import Global from "../components/Global/Global.ts";
import Session from "../components/Global/Session.ts";
import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import { PageContainer } from "../components/Pages/PageView.ts";
import { IsCompactMode } from "../components/Utils/CompactMode.ts";
import Fullscreen from "../components/Utils/Fullscreen.ts";
import { onAnimationFrame } from "./AnimationFrameLoop.ts";
import { IsOpen as IsBreakerOpen, RetryAfterMs } from "./API/CircuitBreaker.ts";
import App from "./app.ts";
import { getExperiments, isExperimentEnabled } from "./experiments.ts";
import { GetRecentErrors, RedactForReport } from "./Logger.ts";
import { ProviderMap } from "./Lyrics/Applyer/Credits/ApplyProvider.ts";
import { GetLastLyricsFailure, GetLyricsAnsweredFrom } from "./Lyrics/fetchLyrics.ts";
import {
  $animationFpsCap,
  $animationFpsCapEnabled,
  $currentLyricsData,
  $showNpvDynamicBg,
  PersistedSettings,
} from "./stores.ts";
import { $ttmlReviewer } from "./ttmlReviewer.ts";
import { $npvLyricsExpanded, $npvLyricsOpen, $romanization } from "./uiState.ts";

/**
 * The setup report users paste into Discord when something goes wrong: from the
 * "Got a Bug?" tab in Settings, and from "Copy details" on a lyrics notice.
 *
 * Nothing identifying goes in: no account, no user ID, no tokens. It always fits in
 * one Discord message.
 */

export const DISCORD_INVITE_URL = "https://discord.com/invite/uqgXU5wh8j";
export const DISCORD_BUGS_URL = "https://discord.com/channels/1369992682214264993/1370023518313644193";

// Discord's limit is 2,000 characters; the rest is headroom for the user's own text.
const MAX_REPORT_LENGTH = 1900;
const MAX_SETTINGS_LENGTH = 360;
const LABEL_WIDTH = 15;

// Bookkeeping in the settings blob, not choices anyone made, and remembered UI state the
// View and Sidebar lines already describe.
const NOT_SETTINGS = new Set([
  "fromVersion",
  "previousVersion",
  "lastFetchedUri",
  "isNowBarOpen",
  "nowBarSide",
  "npvLyricsOpen",
  "npvLyricsExpanded",
]);

// ─── Smoothness ──────────────────────────────────────────────────────────────

// How smoothly lyrics rendered over the last minute, kept per second. Only seconds the
// lyrics were on screen count: not while Settings covers them (the report is made from
// there), and not while the window is hidden.
const SAMPLE_SECONDS = 60;
// A gap this long means rendering paused (hidden window, page closed), not a slow frame.
const IDLE_GAP_MS = 1000;
// Opening the page and loading a song's lyrics always stall a frame or two; that's not lag.
const SETTLE_MS = 2000;
type SecondSample = { second: number; gaps: number[] };
const samples: SecondSample[] = [];
let lastFrame = 0;
let sampling = false;
let samplingCheckedFor = -1;
let settleUntil = 0;
// The second Settings opened, while it's open. Sampling pauses behind the panel, and someone
// reading Got a Bug? shouldn't watch the samples they came to report expire meanwhile.
let panelOpenedAt: number | null = null;

const settle = () => {
  settleUntil = performance.now() + SETTLE_MS;
};
Global.Event.listen("page:open", settle);
Global.Event.listen("playback:songchange", settle);

function lyricsOnScreen(): boolean {
  return (
    !!PageContainer?.isConnected &&
    // The lyrics' own window: with Popup Lyrics, the main one can be minimised.
    PageContainer.ownerDocument.visibilityState === "visible" &&
    !document.querySelector(".sl-sp") &&
    !!PageContainer.querySelector(".LyricsContainer .line")
  );
}

onAnimationFrame((timestamp) => {
  const second = Math.floor(timestamp / 1000);
  // The DOM checks run once a second, not every frame.
  if (second !== samplingCheckedFor) {
    samplingCheckedFor = second;
    sampling = lyricsOnScreen();
    panelOpenedAt = document.querySelector(".sl-sp") ? (panelOpenedAt ?? second) : null;
  }
  const gap = timestamp - lastFrame;
  lastFrame = timestamp;
  if (!sampling || gap > IDLE_GAP_MS || timestamp < settleUntil) return;
  let current = samples[samples.length - 1];
  if (current?.second !== second) {
    current = { second, gaps: [] };
    samples.push(current);
    while (samples.length > 0 && second - samples[0].second >= SAMPLE_SECONDS) samples.shift();
  }
  current.gaps.push(gap);
});

function describeSmoothness(): string {
  const cap = $animationFpsCapEnabled.get() ? `cap ${$animationFpsCap.get()} fps` : "no cap";
  // Seconds from the last minute only, leaving out the one still filling up.
  const now = panelOpenedAt ?? Math.floor(performance.now() / 1000);
  const full = samples.filter((s) => s.second < now && now - s.second <= SAMPLE_SECONDS && s.gaps.length > 0);
  if (full.length < 3) return `no lyrics on screen in the last minute (${cap})`;
  const rates = full.map((s) => s.gaps.length).sort((a, b) => a - b);
  const median = rates[Math.floor(rates.length / 2)];
  const gaps = full.flatMap((s) => s.gaps).sort((a, b) => a - b);
  const p95 = Math.round(gaps[Math.floor(gaps.length * 0.95)]);
  return `median ${median} fps, worst second ${rates[0]} fps, 95% of frames within ${p95} ms, ${full.length}s sampled (${cap})`;
}

// ─── Rows ────────────────────────────────────────────────────────────────────

export function DescribeView(): string {
  if (!PageContainer) return "Lyrics page closed";
  const parts: string[] = [];
  const pip = !!PageContainer.closest(".spicy-pip-wrapper");
  if (PageContainer.classList.contains("CardMode")) parts.push("Sidebar card");
  else if (pip) parts.push("Popup");
  else if (Fullscreen.CinemaViewOpen) parts.push("Cinema");
  else if (Fullscreen.IsOpen) parts.push("Fullscreen");
  else parts.push("Page");
  if (IsCompactMode()) parts.push("compact");
  const page = PageContainer.classList;
  if (page.contains("NowBarStatus__Open")) {
    parts.push(page.contains("NowBarSide__Right") ? "Now Bar right" : "Now Bar left");
  }
  return parts.join(", ");
}

function describeSidebar(): string {
  const layout = document.querySelector("[data-npv-root]")
    ? "new layout"
    : document.querySelector("aside.NowPlayingView, .main-nowPlayingView-section")
      ? "old layout"
      : "closed";
  if (layout === "closed") return layout;
  const parts = [layout];
  parts.push($showNpvDynamicBg.get() ? "animated background" : "no animated background");
  if (document.querySelector("#SpicyLyricsPage.CardMode")) {
    parts.push(
      !$npvLyricsOpen.get() ? "lyrics card folded" : $npvLyricsExpanded.get() ? "lyrics card expanded" : "lyrics card"
    );
  }
  return parts.join(", ");
}

const LYRICS_TYPES: Record<string, string> = {
  Syllable: "word-synced",
  Line: "line-synced",
  Static: "plain",
};

function describeLyrics(uri: string | undefined): string | undefined {
  const raw = $currentLyricsData.get();
  if (!raw || !uri) return undefined;
  if (raw.startsWith("NO_LYRICS:")) return raw.slice("NO_LYRICS:".length) === uri ? "none found" : undefined;
  try {
    const data = JSON.parse(raw);
    if (data?.uri !== uri) return "not loaded yet";
    const type = LYRICS_TYPES[data.Type] ?? String(data.Type ?? "unknown");
    const source = typeof data.source === "string" ? data.source.toLowerCase() : "";
    const provider = Object.entries(ProviderMap).find(([key]) => source.includes(key))?.[1];
    const parts = [type, provider ? `from ${provider}` : source ? `from ${source}` : undefined];
    if (source === "spl") parts.push("community");
    if (typeof data.source_via === "string") parts.push(`via ${data.source_via}`);
    const answeredFrom = GetLyricsAnsweredFrom(uri);
    if (answeredFrom) {
      parts.push(answeredFrom === "already loaded" ? "already loaded" : `loaded from ${answeredFrom === "API" ? "server" : answeredFrom}`);
    }
    // Kept in the UI state, not the settings blob, so the Settings row never shows it.
    if ($romanization.get()) parts.push("romanisation on");
    return parts.filter(Boolean).join(", ");
  } catch {
    return undefined;
  }
}

function formatValue(value: unknown): string {
  if (value === true) return "on";
  if (value === false) return "off";
  if (value === null || value === undefined || value === "") return "none";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function changedSettings(): string {
  const changed: string[] = [];
  for (const [key, { get, defaultValue }] of PersistedSettings) {
    // Experiments have their own line.
    if (NOT_SETTINGS.has(key) || key.startsWith("experiment:")) continue;
    const value = get();
    if (JSON.stringify(value) === JSON.stringify(defaultValue)) continue;
    changed.push(`${key} ${formatValue(value)}`);
  }
  if (changed.length === 0) return "defaults";
  let text = "";
  for (let i = 0; i < changed.length; i++) {
    const next = text ? `${text}, ${changed[i]}` : changed[i];
    if (next.length > MAX_SETTINGS_LENGTH) return `${text}, +${changed.length - i} more`;
    text = next;
  }
  return text;
}

export function ChangedExperiments(): string {
  const changed = getExperiments()
    .filter((exp) => isExperimentEnabled(exp.id) !== exp.default)
    .map(
      (exp) =>
        `${exp.id} ${isExperimentEnabled(exp.id) ? "on" : "off"}` +
        (exp.forceState === undefined ? "" : " (forced)")
    );
  return changed.length ? changed.join(", ") : "defaults";
}

/**
 * The Marketplace doesn't record the active theme's name anywhere the client can read,
 * so this says what's loaded: a CLI theme by name, or the Marketplace theme's own
 * header comment (most themes open by naming themselves).
 */
function describeTheme(): string {
  const parts: string[] = [];
  const cliTheme = Spicetify.Config?.current_theme;
  const marketplaceCss = document.body?.querySelector(":scope > .marketplaceUserCSS")?.textContent?.trim();
  if (marketplaceCss) {
    const header = marketplaceCss.match(/^\/\*+\s*([^\n*]{2,60})/)?.[1]?.trim();
    parts.push(header ? `Marketplace theme "${header}"` : "Marketplace theme");
  } else if (cliTheme && cliTheme !== "marketplace") {
    parts.push(cliTheme);
  } else {
    parts.push("none");
  }
  if (Spicetify.Config?.color_scheme) parts.push(`scheme ${Spicetify.Config.color_scheme}`);
  if (document.querySelector("style.marketplaceSnippets")?.textContent?.trim()) parts.push("snippets on");
  const spicyThemes = describeSpicyThemes();
  if (spicyThemes) parts.push(spicyThemes);
  return parts.join(", ");
}

/**
 * Spicy Themes restyles the lyrics from inside our page, so it never shows up as a
 * Spicetify theme. Its global belongs to another extension: read it defensively.
 */
function describeSpicyThemes(): string | undefined {
  try {
    const state = (window as any).SpicyThemes?.getState?.();
    if (!state) return undefined;
    if (state.isEnabled === false) return "Spicy Themes off";
    const preset = typeof state.activePresetName === "string" ? state.activePresetName.slice(0, 40) : undefined;
    return `Spicy Themes: ${preset ?? "on"}${state.videoMode ? " (video)" : ""}`;
  } catch {
    return undefined;
  }
}

/** This computer or another device (Spotify Connect), never the device's name. */
function describePlayback(): string | undefined {
  const device = (Spicetify.Platform as any)?.ConnectAPI?.state?.activeDevice;
  if (!device) return undefined;
  return device.isLocal ? "this computer" : `another device${device.type ? ` (${device.type})` : ""}`;
}

function describeExtensions(): string {
  const names = [...(Spicetify.Config?.extensions ?? []), ...(Spicetify.Config?.custom_apps ?? [])]
    .map((name) => String(name).replace(/(\.min)?\.m?js$/, ""));
  return names.length ? names.join(", ") : "none";
}

function describeWindow(): string {
  // Spotify's own zoom (a percentage) shows up in devicePixelRatio alongside the display's scaling.
  const zoom =
    parseFloat(
      getComputedStyle(document.querySelector(".Root") ?? document.documentElement).getPropertyValue("--zoom-level")
    ) / 100;
  const parts = [`${window.innerWidth}x${window.innerHeight}`];
  if (zoom > 0) {
    parts.push(`zoom ${Math.round(zoom * 100)}%`);
    // Spotify rounds the zoom it reports; Windows and macOS scale in 25% steps.
    parts.push(`display scale ${Math.round((window.devicePixelRatio / zoom) * 4) * 25}%`);
  } else {
    parts.push(`pixel ratio ${window.devicePixelRatio.toFixed(2)}`);
  }
  return parts.join(", ");
}

function describeErrors(): string[] {
  return GetRecentErrors().map(({ time, source, message, count }) => {
    const at = new Date(time).toISOString().slice(11, 16);
    return `  ${at} (${source}) ${message}${count > 1 ? ` x${count}` : ""}`;
  });
}

// ─── Report ──────────────────────────────────────────────────────────────────

export type BugReportOptions = {
  /** The latest released version, when the update check has answered. */
  latestVersion?: string;
  /** A lyrics notice's details, for its "Copy details". */
  notice?: { descriptor: string; status: number; uri: string | undefined };
};

function versionRow(latest: string | undefined): string | undefined {
  const current = Session.SpicyLyrics.GetCurrentVersion()?.Text;
  if (!current) return undefined;
  const build = App.isDev() ? "dev build" : undefined;
  // In order, so a build newer than the public one (a test build) isn't told to update.
  const behind = latest
    ? Session.SpicyLyrics.IsBehind(Session.SpicyLyrics.GetCurrentVersion(), Session.SpicyLyrics.ParseVersion(latest))
      ? `update available: ${latest}`
      : "latest"
    : undefined;
  const extra = [build, behind].filter(Boolean).join(", ");
  return extra ? `${current} (${extra})` : current;
}

/** The text that's copied, with the label column padded so Discord's code block lines it up. */
export function BuildBugReport(options: BugReportOptions = {}): string {
  const { notice, latestVersion } = options;
  const uri = notice?.uri ?? SpotifyPlayer.GetUri();
  const failure = notice ? GetLastLyricsFailure(notice.uri) : null;
  const artists = SpotifyPlayer.GetArtists()?.map((artist) => artist.name).join(", ");
  const name = SpotifyPlayer.GetName();

  const rows: [string, string | undefined][] = [
    ["Notice", notice ? `${notice.descriptor}${notice.status ? ` (${notice.status})` : ""}` : undefined],
    ["Answered by", failure?.source],
    ["Error", failure?.detail && RedactForReport(failure.detail)],
    ["Spicy Lyrics", versionRow(latestVersion)],
    ["Spotify", Spicetify.Platform?.version],
    ["Spicetify", Spicetify.Config?.version],
    ["Theme", describeTheme()],
    ["OS", Spicetify.Platform?.operatingSystem ?? navigator.platform],
    ["View", DescribeView()],
    ["Sidebar", describeSidebar()],
    ["Track", name ? (artists ? `${name} by ${artists}` : name) : "nothing playing"],
    ["Track URI", name ? uri : undefined],
    ["Playing on", name ? describePlayback() : undefined],
    ["Lyrics", describeLyrics(uri)],
    // Says why the settings below are stripped back: they aren't this person's usual setup.
    ["TTML Reviewer", $ttmlReviewer.get() ? "on" : undefined],
    ["Settings", changedSettings()],
    ["Experiments", ChangedExperiments()],
    ["Extensions", describeExtensions()],
    ["Window", describeWindow()],
    ["Smoothness", describeSmoothness()],
    ["Online", navigator.onLine ? "yes" : "no"],
    ["Service", IsBreakerOpen() ? `paused, retry in ${Math.ceil(RetryAfterMs() / 1000)}s` : "ok"],
    ["Time", new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")],
  ];

  const lines = rows
    .filter((row): row is [string, string] => !!row[1])
    .map(([label, value]) => `${`${label}:`.padEnd(LABEL_WIDTH)}${value}`);

  const errors = describeErrors();
  const heading = notice ? "**Spicy Lyrics notice**" : "**Spicy Lyrics bug report**";
  const footer = "Add a screenshot or clip if you can.";
  const assemble = (errorLines: string[]) =>
    [
      heading,
      "```",
      ...lines,
      ...(errorLines.length ? ["Recent errors:", ...errorLines] : ["Recent errors: none"]),
      "```",
      footer,
    ].join("\n");

  // Oldest errors go first if it would run past one Discord message.
  let report = assemble(errors);
  for (let keep = errors.length - 1; report.length > MAX_REPORT_LENGTH && keep >= 0; keep--) {
    report = assemble(errors.slice(errors.length - keep));
  }
  return report.length > MAX_REPORT_LENGTH ? `${report.slice(0, MAX_REPORT_LENGTH - 4)}\n\`\`\`` : report;
}

/**
 * Puts `text` on the clipboard. Web API first: the native bridge can resolve
 * without writing anything, and then nothing after it runs. `from` picks the
 * clicked window, since in PiP that's the popup.
 */
export async function CopyText(text: string, from: Element): Promise<boolean> {
  const doc = from.ownerDocument;
  try {
    await doc.defaultView!.navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Throws when that window isn't focused.
  }
  try {
    await Spicetify.Platform.ClipboardAPI.copy(text);
    return true;
  } catch {
    // Not every client build has the native clipboard bridge.
  }
  const area = doc.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  doc.body.appendChild(area);
  area.select();
  try {
    return doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
