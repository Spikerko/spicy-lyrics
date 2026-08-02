import { persistAtom } from "./stores.ts";

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
 *     label: "My Experiment",
 *     description: "What it changes, and what turning it off restores.",
 *     default: true,
 *     pageClass: "Exp_MyExperiment",   // optional — toggled on #SpicyLyricsPage
 *     rebuildsNowBar: true,            // optional — see below
 *   }
 *
 * `pageClass` is the preferred way to implement one: write the new look under
 * `#SpicyLyricsPage.Exp_Foo` and keep the old one under
 * `#SpicyLyricsPage:not(.Exp_Foo)`, and the toggle costs nothing at runtime.
 *
 * `rebuildsNowBar` is only for experiments whose *markup* differs between states
 * (CSS alone can't get you there). It makes NowBar tear down and rebuild the
 * fullscreen overlay when the flag flips.
 */

export type Experiment = {
  /** Stable key. Persisted in the settings blob as `experiment:<id>`. */
  id: string;
  label: string;
  description: string;
  default: boolean;
  /** Class toggled on `#SpicyLyricsPage` while the experiment is enabled. */
  pageClass?: string;
  /** Rebuild the fullscreen NowBar overlay when this flag changes. */
  rebuildsNowBar?: boolean;
};

export const EXPERIMENTS = [
  {
    id: "newProgressBarStyling",
    label: "New SliderBar Styling",
    description:
      "New glass-like style for the SliderBar. Disable to revert back to the original one.",
    default: true,
    pageClass: "Exp_NewProgressBar",
  },
] as const satisfies readonly Experiment[];

/** A registry entry, narrowed to its literal `id` — what the UI iterates over. */
export type RegisteredExperiment = (typeof EXPERIMENTS)[number];
export type ExperimentId = RegisteredExperiment["id"];

const makeStore = (key: string, defaultValue: boolean) => persistAtom<boolean>(key, defaultValue);
type ExperimentStore = ReturnType<typeof makeStore>;

const stores = new Map<string, ExperimentStore>(
  EXPERIMENTS.map((exp) => [exp.id, makeStore(`experiment:${exp.id}`, exp.default)])
);

/** The persisted store for an experiment — use in React via `useStore`. */
export function $experiment(id: ExperimentId): ExperimentStore {
  const store = stores.get(id);
  if (!store) throw new Error(`Unknown experiment "${id}"`);
  return store;
}

export function isExperimentEnabled(id: ExperimentId): boolean {
  return stores.get(id)?.get() ?? false;
}

export function setExperiment(id: ExperimentId, value: boolean): void {
  stores.get(id)?.set(value);
}

/** Sync every experiment's `pageClass` onto the page root. Safe to call anytime. */
export function ApplyExperimentClasses(el: HTMLElement): void {
  for (const exp of EXPERIMENTS) {
    if (!exp.pageClass) continue;
    el.classList.toggle(exp.pageClass, isExperimentEnabled(exp.id));
  }
}

/**
 * Run `cb(experiment)` whenever any experiment is toggled. `.listen` rather than
 * `.subscribe`, so this never fires on module load.
 */
export function onExperimentChange(cb: (experiment: Experiment) => void): void {
  for (const exp of EXPERIMENTS) {
    stores.get(exp.id)?.listen(() => cb(exp));
  }
}
