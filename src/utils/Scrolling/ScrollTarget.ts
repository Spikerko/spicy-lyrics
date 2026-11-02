import type { LyricsLine, LyricsSyllable } from "../Lyrics/lyrics.ts";

// Which line synced lyrics scroll to. Kept free of runtime imports so it can be
// checked on its own (scripts/check-scroll-target.ts).

type ScrollLine = Pick<
  LyricsLine | LyricsSyllable,
  "StartTime" | "EndTime" | "DotLine" | "Syllables"
> & {
  BGLine?: boolean;
};

/**
 * How far ahead — counted in real lyric lines, background lines excluded — we
 * look when deciding whether the highest active line may keep the anchor.
 * Bump to 3 to let long lines hold the anchor for longer.
 */
const PIN_LOOKAHEAD = 2;

/** Only Syllable lines carry BGLine; line-synced lyrics have no background lines. */
export const IsBGLine = (line: ScrollLine): boolean => line.BGLine === true;

/** Background lines belong to the lead line above them, and are never a scroll target. */
const ResolveToLeadIndex = (Lines: ScrollLine[], index: number): number => {
  let i = index;
  while (i > 0 && IsBGLine(Lines[i])) i--;
  return i;
};

/** When the lead line at `leadIdx` and its background lines have all finished. */
const GetGroupEndTime = (Lines: ScrollLine[], leadIdx: number): number => {
  let end = Lines[leadIdx].EndTime;
  for (let i = leadIdx + 1; i < Lines.length && IsBGLine(Lines[i]); i++) {
    if (Lines[i].EndTime > end) end = Lines[i].EndTime;
  }
  return end;
};

/** The PIN_LOOKAHEAD-th non-background line after `leadIdx`, or null past the end. */
const GetLookaheadLine = (Lines: ScrollLine[], leadIdx: number) => {
  let remaining = PIN_LOOKAHEAD;
  for (let i = leadIdx + 1; i < Lines.length; i++) {
    if (IsBGLine(Lines[i])) continue;
    if (--remaining === 0) return Lines[i];
  }
  return null;
};

/** The index of the line to scroll to at `position`, or null when no line is active. */
export const PickScrollLineIndex = (Lines: ScrollLine[], position: number): number | null => {
  // 1) gather the indices of all active lines. This runs every animation frame,
  // so we keep indices rather than materialising a copy of each active line.
  const activeIndices: number[] = [];
  for (let i = 0; i < Lines.length; i++) {
    const line = Lines[i];
    if (
      typeof line.StartTime === "number" &&
      typeof line.EndTime === "number" &&
      line.StartTime <= position &&
      line.EndTime >= position
    ) {
      activeIndices.push(i);
    }
  }

  if (activeIndices.length === 0) return null;

  // 2) collapse the active lines onto their lead groups. A background line that
  // still has another active group below it is only the tail of a line we have
  // already moved past — a sustained "oooh" outliving its own lead — so it is
  // dropped rather than dragging the anchor back up. A background line with
  // nothing active below it is kept: it may be leading into its own line, which
  // starts later than the background vocal does.
  let frontLead = -1;
  for (const index of activeIndices) {
    const lead = ResolveToLeadIndex(Lines, index);
    if (lead > frontLead) frontLead = lead;
  }

  // Ascending and deduplicated — ResolveToLeadIndex is monotonic over
  // activeIndices, so only the previous entry needs checking.
  const activeLeads: number[] = [];
  for (const index of activeIndices) {
    const lead = ResolveToLeadIndex(Lines, index);
    if (IsBGLine(Lines[index]) && lead < frontLead) continue;
    if (activeLeads[activeLeads.length - 1] !== lead) activeLeads.push(lead);
  }

  // The highest active line keeps the anchor as long as it (and its background
  // lines) finish before the line PIN_LOOKAHEAD real lines further down starts
  // singing its own words.
  const anchorIdx = activeLeads[0];
  const lookahead = GetLookaheadLine(Lines, anchorIdx);
  if (lookahead === null || GetGroupEndTime(Lines, anchorIdx) <= GetWordsStartTime(lookahead)) {
    return anchorIdx;
  }

  // Anchor refused — fall back to the original heuristic: adjacent lines (only
  // background lines between them) → the first active line, otherwise the last.
  const firstIdx = activeLeads[0];
  const lastIdx = activeLeads[activeLeads.length - 1];
  return HasLeadBetween(Lines, firstIdx, lastIdx) ? lastIdx : firstIdx;
};

/**
 * When a line's own words start. Its StartTime is pulled back to cover a
 * background vocal sung ahead of it, which made the line above give up the
 * anchor that early.
 */
const GetWordsStartTime = (line: ScrollLine): number =>
  Math.max(line.Syllables?.Lead?.[0]?.StartTime ?? line.StartTime, line.StartTime);

/** Whether a non-background line sits strictly between `from` and `to`. */
const HasLeadBetween = (Lines: ScrollLine[], from: number, to: number): boolean => {
  for (let i = from + 1; i < to; i++) if (!IsBGLine(Lines[i])) return true;
  return false;
};
