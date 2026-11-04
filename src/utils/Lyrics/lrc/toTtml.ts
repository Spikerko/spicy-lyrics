/**
 * LRC to TTML text, so an imported .lrc takes the same path as an uploaded .ttml.
 * Line-timed LRC becomes line-timed TTML; enhanced LRC (`<mm:ss.xx>` stamps before
 * words or syllables) becomes word-timed TTML. No imports and no runtime globals.
 */

const TAG = /^\[([a-zA-Z]+):(.*)\]$/;
const LINE_STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,4}))?\]\s*/;
const WORD_STAMP = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,4}))?>/g;

/** How long a line or word with nothing after it to end it stays up. */
const LAST_LINE_MS = 5000;
const LAST_WORD_MS = 3000;

interface RawLine {
  start: number;
  body: string;
}

interface Piece {
  text: string;
  start: number;
  end: number;
  spaceBefore: boolean;
}

const stampMs = (minutes: string, seconds: string, fraction: string | undefined): number =>
  (Number(minutes) * 60 + Number(seconds)) * 1000 +
  (fraction ? Number(fraction.padEnd(3, "0").slice(0, 3)) : 0);

const seconds = (ms: number): string =>
  `${Math.floor(ms / 1000)}.${String(ms % 1000).padStart(3, "0")}`;

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function readOffset(lines: string[]): number {
  for (const line of lines) {
    const tag = TAG.exec(line);
    if (tag?.[1].toLowerCase() !== "offset") continue;
    const value = tag[2].trim();
    return /^[+-]?\d+$/.test(value) ? Number(value) : 0;
  }
  return 0;
}

/**
 * The line's pieces, each running from its stamp to the next one. A last piece
 * with no closing stamp runs to the next line, for at most LAST_WORD_MS; a line
 * with no word stamps at all is one piece timed as a line.
 */
function readPieces(
  line: RawLine,
  next: number | undefined,
  time: (ms: number) => number
): Piece[] {
  const stamps = [...line.body.matchAll(WORD_STAMP)];
  const stampTimes = stamps.map((s) => time(stampMs(s[1], s[2], s[3])));

  const texts: string[] = [];
  let cursor = 0;
  for (const stamp of stamps) {
    texts.push(line.body.slice(cursor, stamp.index));
    cursor = stamp.index + stamp[0].length;
  }
  texts.push(line.body.slice(cursor));

  const pieces: Piece[] = [];
  let spaceBefore = false;
  texts.forEach((text, i) => {
    if (text.trim() === "") {
      if (text !== "") spaceBefore = true;
      return;
    }
    const start = i === 0 ? line.start : stampTimes[i - 1];
    const closing = stampTimes[i] as number | undefined;
    const open =
      stamps.length === 0
        ? (next ?? start + LAST_LINE_MS)
        : Math.min(next ?? Infinity, start + LAST_WORD_MS);
    pieces.push({
      text: text.trim(),
      start,
      end: Math.max(closing ?? open, start + 1),
      spaceBefore: spaceBefore || text.trimStart() !== text,
    });
    spaceBefore = text.trimEnd() !== text;
  });
  return pieces;
}

/** `lrc` as TTML, or null when it has no timed line with any text. */
export function lrcToTtml(lrc: string): string | null {
  const fileLines = lrc
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim());

  const offset = readOffset(fileLines);
  // A positive offset shows the lyrics earlier.
  const time = (ms: number): number => Math.max(ms - offset, 0);

  const lines: RawLine[] = [];
  for (const fileLine of fileLines) {
    let rest = fileLine;
    const starts: number[] = [];
    for (let stamp = LINE_STAMP.exec(rest); stamp; stamp = LINE_STAMP.exec(rest)) {
      starts.push(time(stampMs(stamp[1], stamp[2], stamp[3])));
      rest = rest.slice(stamp[0].length);
    }
    for (const start of starts) lines.push({ start, body: rest });
  }
  lines.sort((a, b) => a.start - b.start);

  const wordTimed = lines.some((line) => line.body.search(WORD_STAMP) !== -1);

  const paragraphs: string[] = [];
  lines.forEach((line, index) => {
    // A blank stamp shows nothing; it only ends the line before it, leaving a gap.
    if (line.body.replace(WORD_STAMP, "").trim() === "") return;

    // A line stamped the same as this one (a translation under it) doesn't end it.
    const next = lines.slice(index + 1).find((other) => other.start > line.start)?.start;

    if (!wordTimed) {
      const end = Math.max(next ?? line.start + LAST_LINE_MS, line.start + 1);
      paragraphs.push(
        `<p begin="${seconds(line.start)}" end="${seconds(end)}" ttm:agent="v1">${escapeXml(line.body)}</p>`
      );
      return;
    }

    const pieces = readPieces(line, next, time);
    if (pieces.length === 0) return;
    // The parser tells a word break from a syllable join by whether a space sits
    // between two spans, so it goes there and never inside a span.
    const spans = pieces
      .map(
        (piece, i) =>
          `${i > 0 && piece.spaceBefore ? " " : ""}<span begin="${seconds(piece.start)}" end="${seconds(piece.end)}">${escapeXml(piece.text)}</span>`
      )
      .join("");
    const end = pieces[pieces.length - 1].end;
    paragraphs.push(
      `<p begin="${seconds(line.start)}" end="${seconds(end)}" ttm:agent="v1">${spans}</p>`
    );
  });

  if (paragraphs.length === 0) return null;

  return (
    `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" ` +
    `xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="${wordTimed ? "Word" : "Line"}">` +
    `<head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head>` +
    `<body><div>${paragraphs.join("")}</div></body></tt>`
  );
}
