import { atom, computed, type ReadableAtom } from "nanostores";
import { persistAtom } from "./stores.ts";
import { getRemoteConfig } from "./remoteConfig.ts";
import { EdgeLookup } from "./API/EdgeService.ts";

/**
 * ─── Experiments ──────────────────────────────────────────────────────────────
 *
 * Opt-in/opt-out feature flags surfaced in Settings → Experiments.
 *
 * TO ADD AN EXPERIMENT: append one entry to the EXPERIMENTS array below. That is
 * the whole registration — the settings UI, the persisted store and (if you set
 * `pageClass`) the CSS hook are all derived from it. Nothing else to wire up.
 *
 *   {
 *     id: "myExperiment",              // stable; persisted as "experiment:myExperiment"
 *     category: "lyrics",              // the Experiments tab heading it sits under
 *     label: "My Experiment",
 *     description: "What it changes, and what turning it off restores.",
 *     default: true,
 *     pageClass: "Exp_MyExperiment",   // optional — toggled on #SpicyLyricsPage
 *     rebuildsNowBar: true,            // optional — see below
 *     forceState: true,                // optional — see below
 *     hidden: true,                    // optional — see below
 *   }
 *
 * `pageClass` is the preferred way to implement one: write the new look under
 * `#SpicyLyricsPage.Exp_Foo` and keep the old one under
 * `#SpicyLyricsPage:not(.Exp_Foo)`, and the toggle costs nothing at runtime.
 *
 * `rebuildsNowBar` is only for experiments whose *markup* differs between states
 * (CSS alone can't get you there). It makes NowBar tear down and rebuild the
 * fullscreen overlay when the flag flips.
 *
 * `forceState` locks the experiment: `true` forces it on, `false` forces it off,
 * leaving it out keeps it user-controlled. A forced experiment still shows in the
 * panel, with its toggle locked and a "Forced on/off" tag so people can see why
 * it won't move. The user's own saved choice is left untouched underneath, so
 * removing `forceState` later hands them back whatever they had picked.
 *
 * `hidden` takes the experiment out of the settings panel (and its search) and
 * nothing else: the value still resolves exactly as it would if it were shown.
 *
 * REMOTE OVERRIDES: the edge serves `?lookup=experimentsState`, an array of
 * `{ id, ...fields }`. Any field but `id` is laid over the local entry, so the
 * server can flip a `default`, force a state, hide a row or reword a label without
 * a release. Ids that don't exist locally are ignored — the server can never add
 * an experiment. `null` for a field means "no override". Each successful response
 * replaces the previous one outright, so an entry with only an `id` (or an empty
 * or `null` response) drops whatever was overridden before. Failed fetches keep
 * the last good overrides. Refreshed every `experimentsSync.intervalMs` (remote
 * config, 60 s by default) and whenever the Experiments tab opens.
 *
 * The resolved value is `forceState ?? userChoice ?? default`, where `userChoice`
 * is only set once the user has toggled it themselves — so a remote `default`
 * reaches everyone who never touched the experiment, and no one who did.
 */

/** The groups the Experiments tab lists experiments under, in this order. */
export const EXPERIMENT_CATEGORIES = [
  { id: "lyrics", title: "Lyrics" },
  { id: "background", title: "Background" },
  { id: "player", title: "Player" },
] as const;
export type ExperimentCategory = (typeof EXPERIMENT_CATEGORIES)[number]["id"];

export type Experiment = {
  /** Stable key. Persisted in the settings blob as `experiment:<id>`. */
  id: string;
  /** Which heading it's listed under in the Experiments tab. */
  category: ExperimentCategory;
  label: string;
  description: string;
  default: boolean;
  /** Class toggled on `#SpicyLyricsPage` while the experiment is enabled. */
  pageClass?: string;
  /** Rebuild the fullscreen NowBar overlay when this flag changes. */
  rebuildsNowBar?: boolean;
  /** Lock the experiment on (`true`) or off (`false`); omit to let the user choose. */
  forceState?: boolean;
  /** Leave it out of the settings panel. Never affects the value. */
  hidden?: boolean;
};

export const EXPERIMENTS = [
  {
    id: "newProgressBarStyling",
    category: "player",
    label: "New SliderBar Styling",
    description:
      "New glass-like style for the SliderBar. Disable to revert back to the original one.",
    default: true,
    pageClass: "Exp_NewProgressBar",
  },
  {
    id: "lyricsSkeleton",
    category: "lyrics",
    label: "Lyrics Loading Skeleton",
    description:
      "Shows placeholder lines and a small \"Loading Lyrics\" label while lyrics fetch and render, instead of the blurred spinner. Disable to bring the spinner back.",
    default: true,
    pageClass: "Exp_LyricsSkeleton",
  },
  {
    id: "canvasImmersive",
    category: "background",
    label: "Canvas Stage",
    description:
      "When a song has a Spotify Canvas, it fills the Now Bar side of the screen in place of the album cover, and its colors drive the page background. Only applies with the dynamic background. Disable to keep the cover and the animated cover background.",
    default: true,
  },
  {
    id: "npvCanvasBackground",
    category: "background",
    label: "Canvas NPV Background",
    description:
      "When a song has a Spotify Canvas, the Now Playing View's dynamic background is drawn from the Canvas video playing there, frame for frame, instead of the album cover. Disable to keep the cover.",
    default: true,
  },
  {
    id: "popupDock",
    category: "player",
    label: "Popup Player Dock",
    description:
      "Popup lyrics fill the whole window, with the player docked along the bottom like the Canvas Stage: title and artist at rest, the timeline and controls rising in when you move the mouse. Disable to bring back the cover header and the controls over the enlarged cover.",
    default: true,
    pageClass: "Exp_PopupDock",
  },
  {
    id: "refinedBackground",
    category: "background",
    label: "Refined Background",
    description:
      "Background changes crossfade in place, including switching styles in Settings, and Cover Colors use the cover's deeper tones, changing with the song instead of a second later. Image backgrounds keep their edges instead of being cropped. Disable to bring back the sliding image transition and the brighter Cover Colors.",
    default: true,
    pageClass: "Exp_RefinedBackground",
  },
  {
    id: "refreshedSimpleLyrics",
    category: "lyrics",
    label: "Refreshed Simple Lyrics Mode",
    description:
      "In Simple Lyrics Mode, the sung part of a line fades in behind one soft edge that runs on from word to word without stopping, words float up as they're sung with the next already rising before the last has settled, the part still to come stays a little brighter, and the letters of a short held word swell, spread apart, lift and glow one after another, then ease back, stronger the longer the word is held. Lines sit further apart and follow the song in a ripple, each catching up a moment after the one above it. Interlude dots fill in one by one while the group slowly breathes. Its scrolling takes over from Smooth Scrolling while it's on. Disable to bring back the previous Simple Lyrics look.",
    default: false,
    pageClass: "Exp_RefreshedSimpleLyrics",
  },
  {
    id: "refinedCredits",
    category: "lyrics",
    label: "Refined Credits",
    description:
      "The credits under the lyrics become quiet type close under the last line, with no box: the songwriters, then the lyrics source beneath. Community lyrics say so on that second line, with the people who made and uploaded them linked by name. In synced lyrics the credits stay dim until the last line has been sung. Disable to bring back the previous credit lines.",
    default: true,
    pageClass: "Exp_RefinedCredits",
  },
  {
    id: "scrubPreview",
    category: "player",
    label: "Scrub Preview",
    description:
      "Hovering or dragging the progress bar shows the time a click would seek to, and the volume bar shows the level it would set. Disable to hide these previews.",
    default: true,
    pageClass: "Exp_ScrubPreview",
  },
  {
    id: "backgroundLinePop",
    category: "lyrics",
    label: "Background Vocal Pop-Out",
    description:
      "Background vocal lines stay tucked away under their line until it's sung, then slide out from beneath it while the lines below make room, and tuck back in once both are done. Only applies in Simple Lyrics Mode with Refreshed Simple Lyrics Mode on. Disable to keep every background vocal line on screen at all times.",
    default: false,
    pageClass: "Exp_BackgroundLinePop",
  },
  {
    id: "keepOverlappingLines",
    category: "lyrics",
    label: "Keep Overlapping Lines",
    description:
      "In Minimal Lyrics Mode, a line that ends while one above it is still being sung (overlapping lines, background vocals) stays on screen, dimmed, instead of fading out early. Disable to fade every sung line out as soon as it ends.",
    default: true,
    pageClass: "Exp_KeepOverlappingLines",
  },
  {
    id: "nextUpCard",
    category: "player",
    label: "Next Up",
    description:
      "In fullscreen and Cinema View, the last 30 seconds of a song show the next one in the queue (cover, title and artist) in the corner above the lyrics. Disable to never show it.",
    default: true,
    pageClass: "Exp_NextUpCard",
  },
] as const satisfies readonly Experiment[];

/** A registry entry, narrowed to its literal `id`. */
export type RegisteredExperiment = (typeof EXPERIMENTS)[number];
export type ExperimentId = RegisteredExperiment["id"];
/** A registry entry with any remote overrides applied — what everything should read. */
export type ResolvedExperiment = Experiment & { id: ExperimentId };

// The category stays local: a value the client doesn't know would drop the row from
// every heading in the Experiments tab.
type ExperimentOverride = Partial<Omit<Experiment, "id" | "category">>;

const REGISTRY = EXPERIMENTS as readonly ResolvedExperiment[];

/** The overrides from the last good `experimentsState` response, keyed by id. */
export const $experimentOverrides = atom<Partial<Record<ExperimentId, ExperimentOverride>>>({});

function resolve(
  exp: ResolvedExperiment,
  overrides: Partial<Record<ExperimentId, ExperimentOverride>>
): ResolvedExperiment {
  const override = overrides[exp.id];
  return override ? { ...exp, ...override } : exp;
}

/** One experiment, with remote overrides applied. */
export function getExperiment(id: ExperimentId): ResolvedExperiment {
  const exp = REGISTRY.find((e) => e.id === id);
  if (!exp) throw new Error(`Unknown experiment "${id}"`);
  return resolve(exp, $experimentOverrides.get());
}

/** Every experiment, with remote overrides applied, in registry order. */
export function getExperiments(): ResolvedExperiment[] {
  const overrides = $experimentOverrides.get();
  return REGISTRY.map((exp) => resolve(exp, overrides));
}

/** The ones the settings panel lists: everything not `hidden`. */
export function getVisibleExperiments(): ResolvedExperiment[] {
  return getExperiments().filter((exp) => !exp.hidden);
}

// `undefined` until the user toggles it, so a `default` (local or remote) keeps
// applying to everyone who never made a choice. Kept even while an experiment is
// forced, so lifting the force hands back whatever they had picked.
const userChoices = new Map(
  REGISTRY.map((exp) => [
    exp.id,
    persistAtom<boolean | undefined>(`experiment:${exp.id}`, undefined),
  ])
);

const stores = new Map<ExperimentId, ReadableAtom<boolean>>(
  REGISTRY.map((exp) => [
    exp.id,
    computed([userChoices.get(exp.id)!, $experimentOverrides], (choice, overrides) => {
      const resolved = resolve(exp, overrides);
      return resolved.forceState ?? choice ?? resolved.default;
    }),
  ])
);

/** `true`/`false` while the experiment is locked on/off, `undefined` when the user decides. */
export function forcedExperimentState(id: ExperimentId): boolean | undefined {
  return getExperiment(id).forceState;
}

/** The experiment's resolved value as a store — use in React via `useStore`. */
export function $experiment(id: ExperimentId): ReadableAtom<boolean> {
  const store = stores.get(id);
  if (!store) throw new Error(`Unknown experiment "${id}"`);
  return store;
}

export function isExperimentEnabled(id: ExperimentId): boolean {
  return stores.get(id)?.get() ?? false;
}

export function setExperiment(id: ExperimentId, value: boolean): void {
  if (forcedExperimentState(id) !== undefined) return;
  userChoices.get(id)?.set(value);
}

// Every class an experiment has ever owned here, so one renamed by an override
// doesn't leave its old class stuck on the page.
const knownPageClasses = new Set<string>(
  REGISTRY.flatMap((exp) => (exp.pageClass ? [exp.pageClass] : []))
);

/** Sync every experiment's `pageClass` onto the page root. Safe to call anytime. */
export function ApplyExperimentClasses(el: HTMLElement): void {
  const active = new Set<string>();
  for (const exp of getExperiments()) {
    if (!exp.pageClass) continue;
    knownPageClasses.add(exp.pageClass);
    if (isExperimentEnabled(exp.id)) active.add(exp.pageClass);
  }
  for (const cls of knownPageClasses) el.classList.toggle(cls, active.has(cls));
}

/**
 * Run `cb(experiment)` whenever an experiment's resolved value changes — from the
 * user's toggle or a remote override alike. `.listen` rather than `.subscribe`,
 * so this never fires on module load.
 */
export function onExperimentChange(cb: (experiment: ResolvedExperiment) => void): void {
  for (const exp of REGISTRY) {
    stores.get(exp.id)?.listen(() => cb(getExperiment(exp.id)));
  }
}

/**
 * Run `cb()` whenever the remote overrides change at all. For things that read
 * the definition rather than the value — a `pageClass` renamed while the value
 * stayed put never reaches `onExperimentChange`.
 */
export function onExperimentDefinitionChange(cb: () => void): void {
  $experimentOverrides.listen(() => cb());
}

// ─── Remote overrides ────────────────────────────────────────────────────────

// Timeout and interval come from the remote config's `experimentsSync` group.
// The timeout is also the longest the Experiments panel can stay locked
// waiting on a fetch.

// Every overridable field and the type it has to arrive as. Typed against
// `Experiment`, so adding a field there fails to compile until it's listed here.
const OVERRIDABLE: Record<keyof ExperimentOverride, "string" | "boolean"> = {
  label: "string",
  description: "string",
  default: "boolean",
  pageClass: "string",
  rebuildsNowBar: "boolean",
  forceState: "boolean",
  hidden: "boolean",
};

const KNOWN_IDS = new Set<string>(REGISTRY.map((exp) => exp.id));

function parseOverrides(data: unknown): Partial<Record<ExperimentId, ExperimentOverride>> {
  const result: Partial<Record<ExperimentId, ExperimentOverride>> = {};
  if (!Array.isArray(data)) return result;

  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || !KNOWN_IDS.has(id)) continue;

    const override: Record<string, unknown> = {};
    for (const [key, type] of Object.entries(OVERRIDABLE)) {
      if (!Object.hasOwn(entry, key)) continue;
      const value = (entry as Record<string, unknown>)[key];
      if (typeof value === type) override[key] = value;
    }
    if (Object.keys(override).length) result[id as ExperimentId] = override as ExperimentOverride;
  }
  return result;
}

let inFlight: Promise<void> | null = null;

/** `true` while an `experimentsState` fetch is in flight. The panel locks on it. */
export const $experimentsSyncing = atom(false);

/**
 * Fetch and apply the remote overrides. Concurrent calls share one request. A
 * failure of any kind keeps the overrides already in place.
 */
export function RefreshExperimentOverrides(): Promise<void> {
  inFlight ??= (async () => {
    $experimentsSyncing.set(true);
    try {
      const res = await EdgeLookup("experimentsState", {
        timeoutMs: getRemoteConfig().experimentsSync.timeoutMs,
      });
      if (!res.ok) return;
      const next = parseOverrides(await res.json());
      // The server answers the same thing almost every time; skip the store
      // write so the panel and listeners don't churn on a no-op.
      if (JSON.stringify(next) !== JSON.stringify($experimentOverrides.get())) {
        $experimentOverrides.set(next);
      }
    } catch (error) {
      console.warn("Experiments state refresh failed", error);
    } finally {
      inFlight = null;
      $experimentsSyncing.set(false);
    }
  })();
  return inFlight;
}

let syncStarted = false;

/** Fetch the overrides now, then every `experimentsSync.intervalMs` for the rest of the session. */
export function StartExperimentOverridesSync(): void {
  if (syncStarted) return;
  syncStarted = true;
  const tick = async () => {
    try {
      await RefreshExperimentOverrides();
    } finally {
      setTimeout(tick, getRemoteConfig().experimentsSync.intervalMs);
    }
  };
  void tick();
}
