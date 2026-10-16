import { useStore } from "@nanostores/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  $experiment,
  $experimentsSyncing,
  type ExperimentId,
  type ResolvedExperiment,
  setExperiment,
} from "../../../utils/experiments.ts";
import { $backgroundStyle } from "../../../utils/stores.ts";
import { BACKGROUND_STYLE_LABELS } from "./BackgroundSection.tsx";
import { Row, Toggle } from "./components.tsx";

/**
 * Pieces of the Experiments tab. The rows render straight off the EXPERIMENTS
 * registry, so a new experiment shows up here (and in search) the moment it's
 * added to `utils/experiments.ts`. Remote overrides are re-fetched when the tab
 * opens and re-render the rows live when they land.
 */

// While any experimentsState fetch is in flight — the on-open one or a periodic
// poll — the toggles are frozen and the status pill is up, so a click can't set
// a choice the server is about to force or hide. A typical answer takes a few
// tens of ms, which would read as a flicker, so once shown the state is held for
// at least SYNC_MIN_MS.
const SYNC_MIN_MS = 350;

/** `active`, but once it turns on it stays on for at least `minMs`. */
function useHeld(active: boolean, minMs: number): boolean {
  const [held, setHeld] = useState(active);
  const since = useRef(active ? performance.now() : 0);

  useEffect(() => {
    if (active) {
      if (!held) since.current = performance.now();
      setHeld(true);
      return;
    }
    const left = minMs - (performance.now() - since.current);
    if (left <= 0) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(false), left);
    return () => clearTimeout(timer);
  }, [active]);

  return held;
}

function useExperimentsSyncing(): boolean {
  return useHeld(useStore($experimentsSyncing), SYNC_MIN_MS);
}

// The status pill fades out over --dur-fast (0.15s); the spinner keeps turning until it's gone.
const SPIN_TRAIL_MS = 200;

/** `active`, kept on for `ms` after it turns off. */
function useTrailing(active: boolean, ms: number): boolean {
  const [on, setOn] = useState(active);

  useEffect(() => {
    if (active) {
      setOn(true);
      return;
    }
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [active]);

  return active || on;
}

// One keyframe: it fades back to the element's own resting colors.
const FLASH: Keyframe[] = [
  { backgroundColor: "rgba(255, 255, 255, 0.28)", color: "#fff", offset: 0 },
];
const FLASH_TIMING: KeyframeAnimationOptions = { duration: 280, easing: "ease-out" };

/** "Checking for changes", beside the Experiments title. */
export function SyncStatus() {
  const syncing = useExperimentsSyncing();
  // The spinner is always mounted; it only runs while the pill shows, not for as long as the tab is open.
  const spinning = useTrailing(syncing, SPIN_TRAIL_MS);
  return (
    <span
      className="sl-sp-sync-status"
      data-visible={syncing || undefined}
      data-spinning={spinning || undefined}
      role="status"
      aria-hidden={!syncing}
    >
      <span className="sl-sp-sync-spinner" aria-hidden="true" />
      Checking for changes
    </span>
  );
}

// Settings outside the experiment that keep it from taking effect. Each is a hook,
// called on every render of its own row; it returns the note to show, or false.
const CONFLICTS: Partial<Record<ExperimentId, () => string | false>> = {
  canvasImmersive: () => {
    const style = useStore($backgroundStyle);
    return (
      style !== "dynamic" &&
      `Not showing: Background is set to ${BACKGROUND_STYLE_LABELS[style] ?? style}. Switch it to Dynamic (Kawarp) to use this.`
    );
  },
};

const noConflict = () => false as const;

export function ExperimentRow({
  experiment,
  label,
}: {
  experiment: ResolvedExperiment;
  label: React.ReactNode;
}) {
  const enabled = useStore($experiment(experiment.id));
  const syncing = useExperimentsSyncing();
  const forced = experiment.forceState;
  const useConflict = CONFLICTS[experiment.id] ?? noConflict;
  const conflict = useConflict();
  const badgeRef = useRef<HTMLSpanElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Pressing a frozen toggle points the eye at the reason it didn't move: the
  // Forced badge, or the sync pill when it's only waiting on the server.
  const flashReason = () => {
    const target =
      forced !== undefined
        ? badgeRef.current
        : rowRef.current?.closest(".sl-sp-pane")?.querySelector(".sl-sp-sync-status");
    target?.animate(FLASH, FLASH_TIMING);
  };

  const badge =
    forced === undefined ? undefined : (
      <span
        ref={badgeRef}
        className="sl-sp-forced-badge"
        title="Set by Spicy Lyrics, so it can't be changed here."
      >
        <svg width="9" height="10" viewBox="0 0 9 10" fill="none" aria-hidden="true">
          <rect x="0.75" y="4.25" width="7.5" height="5" rx="1.25" fill="currentColor" />
          <path
            d="M2.25 4.25V3a2.25 2.25 0 0 1 4.5 0v1.25"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
        {forced ? "Forced on" : "Forced off"}
      </span>
    );

  return (
    <Row
      label={label}
      description={experiment.description}
      badge={badge}
      note={(enabled && conflict) || undefined}
    >
      <div className="sl-sp-sync-gate" data-syncing={syncing || undefined} ref={rowRef}>
        <Toggle
          label={experiment.label}
          checked={enabled}
          onChange={(v) => setExperiment(experiment.id, v)}
          locked={forced !== undefined}
          onLockedPress={flashReason}
          busy={syncing}
        />
      </div>
    </Row>
  );
}
