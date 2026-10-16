// deno-lint-ignore-file no-explicit-any

import { $currentLyricsData, $currentLyricsType } from "../../stores.ts";
import { ClearScrollSimplebar } from "../../Scrolling/Simplebar/ScrollSimplebar.ts";
import { setBlurringLastLine } from "../Animator/Lyrics/LyricsAnimator.ts";
import { DestroyAllLyricsContainers } from "../Applyer/CreateLyricsContainer.ts";
import { EmitApply, EmitNotApplyed } from "../Applyer/OnApply.ts";
import { ApplyStaticLyrics, type StaticLyricsData } from "../Applyer/Static.ts";
import { ApplyLineLyrics } from "../Applyer/Synced/Line.ts";
import { ApplySyllableLyrics } from "../Applyer/Synced/Syllable.ts";
import fetchLyrics, {
  ClearLyricsPageContainer,
  HideLoaderContainer,
  ShowQueueLoader,
  type FetchLyricsResult,
} from "../fetchLyrics.ts";
import { BuildLyricsNotice, HasNotice, SetShownNotice, SyncNoLyricsLayout } from "../LyricsNotice.ts";
import { ClearLyricsContentArrays, isRomanized } from "../lyrics.ts";
import { PageContainer } from "../../../components/Pages/PageView.ts";
import { CleanUpIsByCommunity } from "../Applyer/Credits/ApplyIsByCommunity.tsx";
import { SpotifyPlayer } from "../../../components/Global/SpotifyPlayer.ts";
import { HideLyricsSkeleton, IsLyricsSkeletonEnabled, PaintLyricsSkeleton } from "../LyricsSkeleton.ts";

/**
 * Union type for all lyrics data types
 */
export type LyricsData = {
  Type: "Syllable" | "Line" | "Static" | string;
  [key: string]: any;
};


let currentAbortController: AbortController | null = null;
let applyToken = 0;

export const cleanupApplyLyricsAbortController = () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null
  }
}

/**
 * Apply lyrics based on their type
 * @param lyrics - The lyrics data to apply
 */
export default async function ApplyLyrics(lyricsContent: FetchLyricsResult): Promise<void> {
  if (!PageContainer) return;
  if (!lyricsContent) {
    setBlurringLastLine(null);
    return;
  }

  const [descriptor, status, requestedUri] = lyricsContent;

  // Fetching is async, so a result can land after the user has already skipped
  // on. Applying it would paint the previous track's lyrics — or its "no
  // lyrics" notice — over the new track, and the notice branch below would
  // stamp the NO_LYRICS sentinel with the new track's uri, making every later
  // fetch for that track short-circuit to "no lyrics" for good. Drop it and
  // leave the current track's own apply to do the work.
  const currentUri = SpotifyPlayer.GetUri();
  if (requestedUri && currentUri && requestedUri !== currentUri) return;

  // Every apply takes a token, so one parked on the skeleton frame below can
  // tell that any later apply — notice or lyrics — has already painted.
  const token = ++applyToken;

  // Building the lyrics DOM blocks the main thread; get the skeleton on screen
  // first. Another apply, or a track change, may land while we wait a frame.
  if (typeof descriptor === "object" && IsLyricsSkeletonEnabled()) {
    await PaintLyricsSkeleton();
    if (token !== applyToken || !PageContainer) return;
    const liveUri = SpotifyPlayer.GetUri();
    if (requestedUri && liveUri && requestedUri !== liveUri) return;
  }

  setBlurringLastLine(null);

  cleanupApplyLyricsAbortController()

  EmitNotApplyed();

  DestroyAllLyricsContainers();

  ClearLyricsContentArrays();
  ClearScrollSimplebar();
  ClearLyricsPageContainer();

  CleanUpIsByCommunity();

  // This apply owns the lyrics area now, so whatever loader an earlier fetch
  // left up (several fetch exits never hide it) comes down — except for the
  // queued state, which keeps its loader on purpose.
  if (descriptor !== "lyrics-queued") HideLoaderContainer();

  if (descriptor === "lyrics-queued") {
    // HTTP 503: the lyrics server has queued our request. Keep the loader and
    // queue message visible (LyricsQueueRetry drives the backoff retry loop)
    // and render nothing else — the loop re-applies once it resolves.
    ShowQueueLoader();
    SetShownNotice(null);
    SyncNoLyricsLayout();
    return;
  }

  // The copy for each keyword lives in LyricsNotice.ts.
  if (typeof descriptor === "string" && HasNotice(descriptor)) {
    $currentLyricsType.set("None");

    if (descriptor === "lyrics-not-found") {
      // Key the sentinel off the uri the fetch was made for, never off whatever
      // happens to be playing now — see the staleness check above.
      const uri = requestedUri ?? currentUri ?? "";
      $currentLyricsData.set(`NO_LYRICS:${uri}`);
    } else {
      $currentLyricsData.set("");
    }

    const lyricsContainer = PageContainer.querySelector<HTMLElement>(
      ".LyricsContainer .LyricsContent"
    );

    if (!lyricsContainer) return;

    if (!currentAbortController || currentAbortController.signal.aborted) {
      currentAbortController = new AbortController();
    }

    const noticeUri = requestedUri ?? currentUri;
    lyricsContainer.appendChild(
      BuildLyricsNotice(descriptor, status, noticeUri, currentAbortController.signal, () => {
        // Retry the track that's playing now; a notice left over from a
        // skipped track is replaced by that track's own apply anyway.
        const uri = SpotifyPlayer.GetUri();
        if (uri) fetchLyrics(uri).then(ApplyLyrics);
      })
    );

    SetShownNotice(descriptor);
    SyncNoLyricsLayout();

    EmitApply("None", null)
    return;
  }

  const lyrics = descriptor as LyricsData;

  // Lyrics replace any notice, whichever path applied them (a TTML upload re-applies
  // without going through fetchLyrics), so a later layout sync can't hide them.
  SetShownNotice(null);
  SyncNoLyricsLayout();

  const romanize = isRomanized;

  if (lyrics.Type === "Syllable") {
    ApplySyllableLyrics(lyrics as any, romanize);
  } else if (lyrics.Type === "Line") {
    ApplyLineLyrics(lyrics as any, romanize);
  } else if (lyrics.Type === "Static") {
    // Type assertion to StaticLyricsData since we've verified the Type is "Static"
    ApplyStaticLyrics(lyrics as StaticLyricsData, romanize);
  }
  // EmitApply normally hides it; this covers an applier that bailed early.
  HideLyricsSkeleton();
}
