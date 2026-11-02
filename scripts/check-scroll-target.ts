// Checks which line synced lyrics scroll to. Run with: bun scripts/check-scroll-target.ts
//
// Lines are built the way the Syllable applyer builds them: a lead line's StartTime
// and EndTime cover its background vocals, and each background vocal follows its
// lead as a line of its own.

import { PickScrollLineIndex } from "../src/utils/Scrolling/ScrollTarget.ts";

type Line = Parameters<typeof PickScrollLineIndex>[0][number];

/** A lead line; `wordsFrom` is when its own words start, if later than the line. */
const lead = (start: number, end: number, wordsFrom = start): Line => ({
  StartTime: start,
  EndTime: end,
  Syllables: { Lead: [{ StartTime: wordsFrom, EndTime: end } as any] },
});
const bg = (start: number, end: number): Line => ({ StartTime: start, EndTime: end, BGLine: true });

let failures = 0;
const expect = (name: string, lines: Line[], at: number, want: number | null) => {
  const got = PickScrollLineIndex(lines, at);
  if (got !== want) {
    failures++;
    console.log(`FAIL ${name} @${at}: want ${want}, got ${got}`);
  } else {
    console.log(`ok   ${name} @${at}: ${got}`);
  }
};

{
  // Line 0 runs into line 1 but ends before line 2 starts: the view stays on line 0.
  const lines = [lead(0, 1_500), lead(1_000, 2_500), lead(2_000, 3_000)];
  expect("top line ends before the line two down", lines, 1_200, 0);
}

{
  // Line 0 is still going when line 2 starts; lines 0 and 1 are adjacent, so the first.
  const lines = [lead(0, 2_500), lead(1_000, 2_600), lead(2_000, 3_000), lead(4_000, 5_000)];
  expect("top line outlasts the lookahead", lines, 1_200, 0);
  // Three active at once with a gap between first and last: the last one.
  expect("three active, first and last apart", lines, 2_200, 2);
}

{
  // Line 0's background vocal outlives it into line 3: the view must not go back up.
  const lines = [lead(0, 3_000, 0), bg(500, 3_000), lead(1_000, 2_000), lead(2_000, 3_000)];
  expect("background tail under a later line", lines, 2_500, 3);
}

{
  // A song where each "We just make music, baby" has its background vocal sung first,
  // so its line starts (with the background vocal) long before its words.
  const lines = [
    lead(138_928, 140_410), // 0 Like B-O-Y
    lead(139_110, 142_654, 141_093), // 1 We just make music, baby
    bg(139_110, 140_922), //            2   (background)
    lead(140_812, 143_820), //          3 B-A-B-Y-B-O-Y
    lead(142_573, 146_085, 144_557), // 4 We just make music, baby
    bg(142_573, 144_399), //            5   (background)
    lead(144_285, 147_308), //          6 B-A-B-Y-B-O-Y
  ];
  expect("bg sung ahead of its line", lines, 140_000, 0);
  // Line 3 starts while line 1 is still to sing: the view stays on line 1, line 3 under it.
  for (const at of [140_900, 141_500, 142_600]) expect("bg sung ahead of its line", lines, at, 1);
  expect("bg sung ahead of its line", lines, 142_700, 3);
}

{
  // Two active lines with only a background line between them are adjacent: the first.
  const lines = [lead(0, 2_000), bg(500, 2_000), lead(1_000, 3_000), lead(1_800, 4_000)];
  expect("only a bg line between two active lines", lines, 1_500, 0);
}

{
  // In order sung: line 0, line 1's background vocal, line 3, then line 1's own words.
  // Line 1 starts with its background vocal, so it is active throughout and keeps the view.
  const lines = [
    lead(0, 1_000),
    lead(1_000, 4_000, 3_000),
    bg(1_000, 2_500),
    lead(2_000, 3_000),
    lead(4_000, 5_000),
  ];
  expect("line sung after the one below it", lines, 1_500, 1);
  for (const at of [2_200, 2_700, 3_500]) expect("line sung after the one below it", lines, at, 1);
  expect("line sung after the one below it", lines, 4_500, 4);
}

{
  // A background vocal leading into its own line pulls toward that line.
  const lines = [lead(0, 1_000), lead(1_500, 3_000, 2_000), bg(1_500, 2_500)];
  expect("bg leading into its own line", lines, 1_600, 1);
}

{
  expect("nothing active", [lead(0, 1_000), lead(2_000, 3_000)], 1_500, null);
}

if (failures) throw new Error(`${failures} scroll target check(s) failed`);
console.log("all scroll target checks passed");
