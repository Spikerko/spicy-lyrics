import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import storage from "../../utils/storage.ts";

const BRIDGE_URL = "http://127.0.0.1:61337/v1/current-track";
const OUTPUT_LEAD_MS = 140;
const STREAM_HEARTBEAT_MS = 320;
const AGGRESSIVE_HEARTBEAT_MS = 180;
const KEEPALIVE_PULSE_MS = 900;
const PROGRESS_BUCKET_MS = 250;

let started = false;
let lastPayloadHash = "";
let pending = false;
let pendingSinceMs = 0;
let lastPositionMs = 0;
let lastPositionEventAtMs = 0;
let lastEmitAtMs = 0;
let streamSequence = 0;
let lastStablePlayback: { trackId: string; progressMs: number; isPlaying: boolean; sentAtMs: number } | null = null;
let latestSongEventTrack: {
  trackId: string;
  title: string;
  artists: string[];
  album: string;
  durationMs: number;
} | null = null;

type SpicyLine = {
  time: number;
  duration?: number;
  text: string;
  secondaryText?: string;
  side: "left" | "right" | "center";
  words?: Array<{ text: string; startTime: number; endTime?: number }>;
};

type CachedTrackColors = { primary: string; secondary: string };
const trackColorCache = new Map<string, CachedTrackColors>();

function resolveSide(entry: any, fallback: "left" | "right" | "center" = "center"): "left" | "right" | "center" {
  const read = (value: unknown): "left" | "right" | "center" | null => {
    if (typeof value === "boolean") return value ? "right" : "left";
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return null;
    if (raw === "left" || raw === "start") return "left";
    if (raw === "right" || raw === "end") return "right";
    if (raw === "center" || raw === "middle" || raw === "centre") return "center";
    if (raw === "opposite") return "right";
    if (raw === "default") return "left";
    return null;
  };

  const directCandidates = [
    entry?.side,
    entry?.Side,
    entry?.align,
    entry?.Align,
    entry?.alignment,
    entry?.Alignment,
    entry?.position,
    entry?.Position
  ];
  for (const candidate of directCandidates) {
    const mapped = read(candidate);
    if (mapped) return mapped;
  }

  const oppositeCandidates = [
    entry?.OppositeAligned,
    entry?.oppositeAligned,
    entry?.Lead?.OppositeAligned,
    entry?.Lead?.oppositeAligned
  ];
  for (const candidate of oppositeCandidates) {
    if (typeof candidate === "boolean") return candidate ? "right" : "left";
  }

  return fallback;
}

function normalizeTime(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n > 1000 ? n / 1000 : n;
}

function getTrackPayload() {
  const item = Spicetify?.Player?.data?.item;
  if (!item && !latestSongEventTrack) return null;
  const itemUri = String((item as any)?.uri ?? "");
  const itemTrackId = itemUri.split(":")[2] ?? "";
  const itemArtists = Array.isArray((item as any)?.artists)
    ? (item as any).artists.map((a: any) => String(a?.name ?? "")).filter(Boolean)
    : [];
  const itemDurationMs = Number(
    (item as any)?.duration?.milliseconds ??
      (item as any)?.duration_ms ??
      (item as any)?.metadata?.duration ??
      0
  );
  const eventTrackId = latestSongEventTrack?.trackId ?? "";
  const liveTrackId = SpotifyPlayer.GetId() ?? "";
  // Prefer direct item state first, then live helper, then songchange metadata.
  const trackId = itemTrackId || liveTrackId || eventTrackId;
  if (!trackId) return null;

  const title = String((item as any)?.name ?? "") || SpotifyPlayer.GetName() || latestSongEventTrack?.title || "";
  const artists =
    itemArtists.length
      ? itemArtists
      : (SpotifyPlayer.GetArtists() ?? []).map((a) => a?.name).filter(Boolean).length
        ? (SpotifyPlayer.GetArtists() ?? []).map((a) => a?.name).filter(Boolean)
        : (latestSongEventTrack?.artists ?? []);
  const album = String((item as any)?.album?.name ?? "") || SpotifyPlayer.GetAlbumName() || latestSongEventTrack?.album || "";
  const albumCoverUrl = sanitizeCoverUrl(
    String((item as any)?.album?.images?.[0]?.url ?? "") ||
      String((item as any)?.metadata?.image_url ?? "") ||
      SpotifyPlayer.GetCover("large") ||
      ""
  );
  const coverColors = getCoverColors(trackId, itemUri);
  const themeColors = getThemeColors();
  const rawProgressMs = getLiveProgressMs();
  const durationMs = itemDurationMs > 0
    ? itemDurationMs
    : latestSongEventTrack?.durationMs && latestSongEventTrack.durationMs > 0
      ? latestSongEventTrack.durationMs
      : SpotifyPlayer.GetDuration() ?? 0;
  const progressMs = Math.min(
    durationMs > 0 ? durationMs : Number.MAX_SAFE_INTEGER,
    Math.max(0, rawProgressMs + OUTPUT_LEAD_MS)
  );

  return {
    trackId,
    title,
    artists,
    album,
    albumCoverUrl,
    coverPrimary: coverColors.primary,
    coverSecondary: coverColors.secondary,
    themePrimary: themeColors.primary,
    themeSecondary: themeColors.secondary,
    durationMs,
    progressMs,
    isPlaying: isActuallyPlaying(),
    seq: ++streamSequence,
    sentAtMs: Date.now()
  };
}

function keepSpotifyAwakePulse() {
  try {
    // Touch commonly hot paths so Spicetify/Spotify state is read frequently while unfocused.
    void SpotifyPlayer.GetPosition();
    void SpotifyPlayer.GetId();
    void SpotifyPlayer.GetDuration();
    void SpotifyPlayer.GetName();
    void SpotifyPlayer.GetArtists();
    void Spicetify?.Player?.data?.item?.uri;
    if (typeof Spicetify?.Player?.isPlaying === "function") {
      void Spicetify.Player.isPlaying();
    }
    const api = (Spicetify as any)?.Platform?.PlayerAPI;
    void api?._state?.positionAsOfTimestamp;
    void api?._state?.timestamp;
    void api?._state?.isPaused;
  } catch {
    // best effort
  }
}

function stabilizePlaybackPacket(packet: {
  trackId: string;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
  sentAtMs: number;
}) {
  const current = {
    ...packet,
    progressMs: Math.max(0, Math.min(packet.durationMs || Number.MAX_SAFE_INTEGER, packet.progressMs))
  };

  const prev = lastStablePlayback;
  if (!prev || prev.trackId !== current.trackId) {
    lastStablePlayback = {
      trackId: current.trackId,
      progressMs: current.progressMs,
      isPlaying: current.isPlaying,
      sentAtMs: current.sentAtMs
    };
    return current;
  }

  const delta = current.progressMs - prev.progressMs;
  const playStateChanged = prev.isPlaying !== current.isPlaying;
  const bigSeekJump = Math.abs(delta) >= 900;

  // Only guard paused tiny regressions. While playing, allow backward jumps
  // so user seek/skip corrections are reflected immediately.
  if (!playStateChanged && !bigSeekJump && !current.isPlaying && delta < -120) {
    current.progressMs = prev.progressMs;
  }

  lastStablePlayback = {
    trackId: current.trackId,
    progressMs: current.progressMs,
    isPlaying: current.isPlaying,
    sentAtMs: current.sentAtMs
  };
  return current;
}

function isActuallyPlaying(): boolean {
  try {
    if (typeof Spicetify?.Player?.isPlaying === "function") {
      return Boolean(Spicetify.Player.isPlaying());
    }
    const paused = (Spicetify as any)?.Platform?.PlayerAPI?._state?.isPaused;
    if (typeof paused === "boolean") return !paused;
  } catch {
    // ignore
  }
  return false;
}

function getLiveProgressMs(): number {
  const now = Date.now();
  const recentPositionEvent = lastPositionEventAtMs > 0 && now - lastPositionEventAtMs <= 1800;
  if (recentPositionEvent) {
    const playing = isActuallyPlaying();
    if (!playing) return Math.max(0, lastPositionMs);
    return Math.max(0, lastPositionMs + (now - lastPositionEventAtMs));
  }

  const helperPos = Math.max(0, Number(SpotifyPlayer.GetPosition() ?? 0));
  try {
    const state = (Spicetify as any)?.Platform?.PlayerAPI?._state;
    if (state && Number.isFinite(state.positionAsOfTimestamp) && Number.isFinite(state.timestamp)) {
      const paused = Boolean(state.isPaused);
      const base = Number(state.positionAsOfTimestamp);
      const statePos = paused ? Math.max(0, base) : Math.max(0, base + Math.max(0, Date.now() - Number(state.timestamp)));
      const stateAgeMs = Math.max(0, Date.now() - Number(state.timestamp));
      const helperLooksValid = helperPos > 500;
      const stateLooksStale = !paused && stateAgeMs > 5000;
      const largeSourceMismatch = Math.abs(statePos - helperPos) > 2000;

      // Only trust helper source when it looks valid; avoid snapping to zero/stale helper values.
      if (helperLooksValid && (stateLooksStale || largeSourceMismatch)) {
        return helperPos;
      }
      return statePos;
    }
  } catch {
    // ignore and fallback
  }
  return helperPos;
}

function getThemeColors(): CachedTrackColors {
  const fallback: CachedTrackColors = { primary: "88,110,148", secondary: "76,124,108" };
  try {
    const style = getComputedStyle(document.documentElement);
    const primaryCandidates = [
      style.getPropertyValue("--spice-main"),
      style.getPropertyValue("--spice-player"),
      style.getPropertyValue("--spice-accent"),
      style.getPropertyValue("--spice-button"),
      style.getPropertyValue("--spice-highlight")
    ];
    const secondaryCandidates = [
      style.getPropertyValue("--spice-sidebar"),
      style.getPropertyValue("--spice-card"),
      style.getPropertyValue("--spice-subtext"),
      style.getPropertyValue("--spice-shadow"),
      style.getPropertyValue("--spice-player")
    ];

    const primary = firstValidRgb(primaryCandidates) ?? fallback.primary;
    const secondary = firstValidRgb(secondaryCandidates) ?? fallback.secondary;
    return { primary, secondary };
  } catch {
    return fallback;
  }
}

function firstValidRgb(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const mapped = cssColorToRgbTriplet(candidate);
    if (mapped) return mapped;
  }
  return null;
}

function cssColorToRgbTriplet(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const rgbMatch = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((v) => Number(v.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      const r = Math.max(0, Math.min(255, Math.round(parts[0])));
      const g = Math.max(0, Math.min(255, Math.round(parts[1])));
      const b = Math.max(0, Math.min(255, Math.round(parts[2])));
      return `${r},${g},${b}`;
    }
  }
  if (raw.startsWith("#")) return hexToRgbString(raw);
  return null;
}

function sanitizeCoverUrl(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("spotify:image:")) {
    const imageId = raw.replace("spotify:image:", "").trim();
    return imageId ? `https://i.scdn.co/image/${imageId}` : "";
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function getCoverColors(trackId: string, trackUri: string): CachedTrackColors {
  const cached = trackColorCache.get(trackId);
  if (cached) return cached;

  const fallback: CachedTrackColors = { primary: "88,110,148", secondary: "76,124,108" };
  try {
    const extractor = (Spicetify as any)?.colorExtractor;
    if (typeof extractor !== "function") return fallback;
    const p = extractor(trackUri);
    if (!p || typeof p.then !== "function") return fallback;
    p.then((colors: any) => {
      const primaryHex = String(colors?.LIGHT_VIBRANT ?? colors?.VIBRANT ?? colors?.DOMINANT ?? "");
      const secondaryHex = String(colors?.DARK_VIBRANT ?? colors?.MUTED ?? colors?.DARK_MUTED ?? "");
      const mapped: CachedTrackColors = {
        primary: hexToRgbString(primaryHex) ?? fallback.primary,
        secondary: hexToRgbString(secondaryHex) ?? fallback.secondary
      };
      trackColorCache.set(trackId, mapped);
    }).catch(() => undefined);
  } catch {
    // ignore
  }
  return fallback;
}

function hexToRgbString(hex: string): string | null {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

function normalizeLyricsFromStorage(trackId: string): SpicyLine[] {
  const raw = storage.get("currentLyricsData");
  if (!raw) return [];
  const text = raw.toString();
  if (!text || text.startsWith("NO_LYRICS:")) return [];

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (!parsed?.Type) return [];
  const parsedTrackId = String(parsed?.id ?? "");
  const sameTrack =
    !parsedTrackId ||
    !trackId ||
    parsedTrackId === trackId ||
    parsedTrackId.endsWith(trackId) ||
    trackId.endsWith(parsedTrackId);
  if (!sameTrack) {
    // Prevent one-song-behind mismatch while Spicy updates currentLyricsData.
    return [];
  }

  if (parsed.Type === "Static") {
    return (parsed.Lines ?? parsed.Content?.Lines ?? [])
      .map((line: any, i: number) => ({
        time: i,
        text: String(line?.Text ?? "").trim(),
        side: "center" as const
      }))
      .filter((line: SpicyLine) => line.text.length > 0);
  }

  if (!Array.isArray(parsed.Content)) return [];

  if (parsed.Type === "Line") {
    const content = Array.isArray(parsed.Content) ? parsed.Content : [];
    const lines = content
      .filter((line: any) => line?.Type === "Vocal")
      .map((line: any, index: number) => {
        const time = normalizeTime(line.StartTime);
        const secondaryFromSelf = extractSecondaryText(line);
        const secondaryFromNearby = findNearbyBackgroundText(content, time, index);
        return {
          time,
          duration: Math.max(0.05, normalizeTime(line.EndTime) - normalizeTime(line.StartTime)),
          text: String(line.Text ?? "").trim(),
          secondaryText: (secondaryFromSelf || secondaryFromNearby || "").trim() || undefined,
          side: resolveSide(line, "left")
        };
      })
      .filter((line: SpicyLine) => line.text.length > 0);
    return lines;
  }

  if (parsed.Type === "Syllable") {
    return parsed.Content
      .filter((line: any) => line?.Type === "Vocal" && line?.Lead)
      .map((line: any) => {
        const lead = line.Lead;
        const syllables = Array.isArray(lead?.Syllables) ? lead.Syllables : [];
        const words = syllables
          .map((s: any, index: number) => {
            const txt = String(s?.Text ?? "");
            if (!txt) return null;
            const addSpace = index < syllables.length - 1 && !s?.IsPartOfWord;
            return {
              text: addSpace ? `${txt} ` : txt,
              startTime: normalizeTime(s?.StartTime ?? lead?.StartTime),
              endTime: Number.isFinite(s?.EndTime) ? normalizeTime(s.EndTime) : undefined
            };
          })
          .filter(Boolean) as SpicyLine["words"];
        const text = words.map((w) => w.text).join("").trim();
        return {
          time: normalizeTime(lead?.StartTime),
          duration: Math.max(0.05, normalizeTime(lead?.EndTime) - normalizeTime(lead?.StartTime)),
          text,
          secondaryText: extractSecondaryText(line),
          side: resolveSide(line, resolveSide(lead, "left")),
          words
        };
      })
      .filter((line: SpicyLine) => line.text.length > 0);
  }

  return [];
}

function extractSecondaryText(line: any): string | undefined {
  const bgCandidates = [
    line?.Background,
    line?.BackGround,
    line?.background,
    line?.Backing,
    line?.backing
  ].filter(Boolean);

  const extract = (bg: any): string => {
    if (!bg) return "";
    if (typeof bg?.Text === "string" && bg.Text.trim()) return bg.Text.trim();
    if (Array.isArray(bg?.Syllables) && bg.Syllables.length > 0) {
      const text = bg.Syllables
        .map((s: any, i: number) => {
          const t = String(s?.Text ?? "");
          if (!t) return "";
          const addSpace = i < bg.Syllables.length - 1 && !s?.IsPartOfWord;
          return addSpace ? `${t} ` : t;
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      return text;
    }
    if (Array.isArray(bg)) {
      const merged = bg
        .map((item) => extract(item))
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return merged;
    }
    return "";
  };

  for (const bg of bgCandidates) {
    const result = extract(bg);
    if (result) return result;
  }
  return undefined;
}

function findNearbyBackgroundText(content: any[], vocalTime: number, vocalIndex: number): string | undefined {
  const toText = (entry: any): string => {
    if (!entry) return "";
    if (typeof entry?.Text === "string" && entry.Text.trim()) return entry.Text.trim();
    if (entry?.Lead?.Syllables && Array.isArray(entry.Lead.Syllables)) {
      return entry.Lead.Syllables
        .map((s: any, i: number, arr: any[]) => {
          const t = String(s?.Text ?? "");
          if (!t) return "";
          return i < arr.length - 1 && !s?.IsPartOfWord ? `${t} ` : t;
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    }
    if (entry?.Syllables && Array.isArray(entry.Syllables)) {
      return entry.Syllables
        .map((s: any, i: number, arr: any[]) => {
          const t = String(s?.Text ?? "");
          if (!t) return "";
          return i < arr.length - 1 && !s?.IsPartOfWord ? `${t} ` : t;
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim();
    }
    return "";
  };

  const maxDistance = 0.65;
  for (let i = Math.max(0, vocalIndex - 2); i <= Math.min(content.length - 1, vocalIndex + 2); i += 1) {
    if (i === vocalIndex) continue;
    const entry = content[i];
    const type = String(entry?.Type ?? "").toLowerCase();
    if (type === "vocal") continue;
    const time = normalizeTime(entry?.StartTime ?? entry?.Lead?.StartTime);
    if (!Number.isFinite(time)) continue;
    if (Math.abs(time - vocalTime) > maxDistance) continue;
    const text = toText(entry);
    if (text) return text;
  }
  return undefined;
}

function payloadHash(payload: any): string {
  const lines = Array.isArray(payload.lyrics) ? payload.lyrics : [];
  return JSON.stringify({
    trackId: payload.trackId,
    isPlaying: payload.isPlaying,
    progressBucket: Math.floor((payload.progressMs ?? 0) / PROGRESS_BUCKET_MS),
    heartbeatBucket: Math.floor(Date.now() / STREAM_HEARTBEAT_MS),
    lineCount: lines.length,
    first: lines[0]?.text,
    last: lines[lines.length - 1]?.text
  });
}

async function flushBridge() {
  const now = Date.now();
  if (pending && now - pendingSinceMs > 2500) {
    // Recover from any stuck network call so stream does not silently die.
    pending = false;
    pendingSinceMs = 0;
  }
  if (pending) return;
  pending = true;
  pendingSinceMs = now;
  try {
    const track = getTrackPayload();
    if (!track || !track.trackId) return;
    let lyrics = normalizeLyricsFromStorage(track.trackId);
    let noLyrics = false;
    // If lyrics cache is for a different track, keep streaming playback but with empty lyrics.
    const raw = storage.get("currentLyricsData");
    if (raw) {
      try {
        const rawText = raw.toString();
        if (rawText.startsWith("NO_LYRICS:")) {
          const noLyricsTrackId = rawText.replace("NO_LYRICS:", "").trim();
          const sameNoLyricsTrack =
            noLyricsTrackId === track.trackId ||
            noLyricsTrackId.endsWith(track.trackId) ||
            track.trackId.endsWith(noLyricsTrackId);
          if (sameNoLyricsTrack) {
            noLyrics = true;
            lyrics = [];
          }
        } else {
          const parsed = JSON.parse(rawText);
          const lyricsTrackId = String(parsed?.id ?? "");
          const sameTrack =
            !lyricsTrackId ||
            lyricsTrackId === track.trackId ||
            lyricsTrackId.endsWith(track.trackId) ||
            track.trackId.endsWith(lyricsTrackId);
          if (!sameTrack) {
            lyrics = [];
          }
        }
      } catch {
        // ignore malformed lyrics cache
      }
    }
    const stabilized = stabilizePlaybackPacket(track);
    const payload = { ...stabilized, lyrics, noLyrics };
    const hash = payloadHash(payload);
    if (hash === lastPayloadHash) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
      await fetch(BRIDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    lastPayloadHash = hash;
    lastEmitAtMs = Date.now();
  } catch {
    // ignore; retried by next event/interval
  } finally {
    pending = false;
    pendingSinceMs = 0;
  }
}

export function setupSpotifyDockBridge() {
  if (started) return;
  started = true;

  const onTick = () => {
    void flushBridge();
  };

  Global.Event.listen("lyrics:apply", onTick);
  Global.Event.listen("playback:songchange", (evt) => {
    const eventTrack = evt?.data?.item;
    const uri = String(eventTrack?.uri ?? "");
    const trackId = uri.split(":")[2] ?? "";
    if (trackId) {
      latestSongEventTrack = {
        trackId,
        title: String(eventTrack?.name ?? ""),
        artists: Array.isArray(eventTrack?.artists)
          ? eventTrack.artists.map((a: any) => String(a?.name ?? "")).filter(Boolean)
          : [],
        album: String(eventTrack?.album?.name ?? eventTrack?.metadata?.album_title ?? ""),
        durationMs: Number(eventTrack?.duration?.milliseconds ?? eventTrack?.duration_ms ?? 0)
      };
    }
    lastPayloadHash = "";
    lastStablePlayback = null;
    lastPositionMs = 0;
    lastPositionEventAtMs = 0;
    onTick();
  });
  Global.Event.listen("playback:position", (pos) => {
    const p = Number(pos);
    if (!Number.isFinite(p)) return;
    const now = Date.now();
    const jumped = Math.abs(p - lastPositionMs) > 1400;
    lastPositionMs = p;
    lastPositionEventAtMs = now;
    const heartbeatDue = now - lastEmitAtMs > STREAM_HEARTBEAT_MS;
    // Keep a steady playback stream for anchors, plus immediate seek jump updates.
    if (jumped || heartbeatDue) onTick();
  });
  Global.Event.listen("playback:playpause", () => {
    lastStablePlayback = null;
    onTick();
  });

  // Keep streaming even when event flow gets throttled/unfocused.
  setInterval(onTick, STREAM_HEARTBEAT_MS);
  // Extra aggressive heartbeat for anti-sleep behavior.
  setInterval(onTick, AGGRESSIVE_HEARTBEAT_MS);
  // Secondary watchdog pulse to prevent silent stalls while app is backgrounded.
  setInterval(onTick, 1000);
  // Keepalive pulse to discourage stale player state in background.
  setInterval(keepSpotifyAwakePulse, KEEPALIVE_PULSE_MS);

  // Extra nudge when tab/window visibility changes to avoid "sleepy" stale payload.
  document.addEventListener("visibilitychange", onTick);
  window.addEventListener("focus", onTick);

  onTick();
}
