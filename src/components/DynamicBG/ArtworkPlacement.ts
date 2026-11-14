// Where the song's Canvas or motion artwork plays: the Canvas Stage, the NowBar cover, or nowhere.
// The stage and the cover both ask this one function, so they never both show or both wait.

export type MotionVerdict =
  // A video exists for the album.
  | "available"
  // The album has no video, or no UPC to look one up by.
  | "none"
  // The check couldn't finish (metadata or signer unreachable). Treated as no video.
  | "unknown"
  // Being checked.
  | "pending";

export type MotionPriority = "motion" | "canvas";

export type PlacementInput = {
  /** The Canvas Stage could show something in this view (experiment on, NowBar open, dynamic background...). */
  stageEligible: boolean;
  /** The song has a Canvas that hasn't failed to play. */
  canvas: boolean;
  /** Motion artwork is turned on (the setting and the remote switch). */
  motionEnabled: boolean;
  /** Only read when the answer depends on it; see `NeedsMotionVerdict`. */
  motion: MotionVerdict;
  priority: MotionPriority;
  motionOnStage: boolean;
};

export type Placement = {
  stage: "canvas" | "motion" | null;
  /** The NowBar cover may play the motion artwork (it still finds out on its own whether one exists). */
  cover: boolean;
  /** Waiting on the motion check: whatever shows now stays until it lands. */
  pending: boolean;
};

/** Whether the outcome hinges on knowing up front that the album has motion artwork. */
export function NeedsMotionVerdict(input: Omit<PlacementInput, "motion">): boolean {
  if (!input.motionEnabled || !input.stageEligible) return false;
  return input.canvas ? input.priority === "motion" : input.motionOnStage;
}

export function DecideArtworkPlacement(input: PlacementInput): Placement {
  const { stageEligible, canvas, motionEnabled, motionOnStage } = input;
  if (!motionEnabled) return { stage: stageEligible && canvas ? "canvas" : null, cover: false, pending: false };
  // No stage in this view (compact, popup, another background...): the cover is the only place.
  if (!stageEligible) return { stage: null, cover: true, pending: false };

  if (!NeedsMotionVerdict(input)) {
    // A Canvas that wins outright, or no Canvas and motion artwork kept off the stage.
    return canvas ? { stage: "canvas", cover: false, pending: false } : { stage: null, cover: true, pending: false };
  }
  if (input.motion === "pending") return { stage: null, cover: false, pending: true };

  const hasMotion = input.motion === "available";
  if (canvas) {
    // Motion artwork has priority here.
    if (!hasMotion) return { stage: "canvas", cover: false, pending: false };
    return motionOnStage
      ? { stage: "motion", cover: false, pending: false }
      : { stage: null, cover: true, pending: false };
  }
  // No Canvas, motion artwork allowed on the stage. When the check couldn't tell, the cover
  // tries on its own.
  return hasMotion
    ? { stage: "motion", cover: false, pending: false }
    : { stage: null, cover: input.motion === "unknown", pending: false };
}
