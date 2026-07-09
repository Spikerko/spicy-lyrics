import type { LyricAnnotationAnchor, RawLyricAnnotation } from "./types.ts";

export const CONFIDENCE_THRESHOLD = 0.72;

export interface MatchableLyricLine {
  index: number;
  text: string;
}

interface NormalizedLine {
  index: number;
  norm: string;
}

export function normalizeLyricLine(input: string): string {
  const normalized = String(input ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .trim();

  if (/^\[[^\]]*\]$/.test(normalized) || /^\([^)]*\)$/.test(normalized)) return "";

  return normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSetScore(a: string, b: string): number {
  const aTokens = new Set(a.split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.split(/\s+/).filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeLines(lines: MatchableLyricLine[]): NormalizedLine[] {
  return lines
    .map((line) => ({ index: line.index, norm: normalizeLyricLine(line.text) }))
    .filter((line) => line.norm.length > 0);
}

function fragmentLines(fragment: string): string[] {
  return fragment
    .split(/\r?\n/)
    .map(normalizeLyricLine)
    .filter((line) => line.length > 0);
}

function exactSingleLine(lines: NormalizedLine[], fragment: string): LyricAnnotationAnchor | null {
  for (const line of lines) {
    if (line.norm === fragment) {
      return {
        annotationId: "",
        lineIndexStart: line.index,
        lineIndexEnd: line.index,
        confidence: 1,
      };
    }
  }

  for (const line of lines) {
    if (line.norm.includes(fragment) && fragment.length >= 0.6 * line.norm.length) {
      return {
        annotationId: "",
        lineIndexStart: line.index,
        lineIndexEnd: line.index,
        confidence: 0.9,
      };
    }
  }

  return null;
}

function multilineWindow(
  lines: NormalizedLine[],
  fragments: string[]
): LyricAnnotationAnchor | null {
  if (fragments.length < 2 || fragments.length > 6) return null;

  for (let i = 0; i <= lines.length - fragments.length; i++) {
    const window = lines.slice(i, i + fragments.length);
    const exact = fragments.every((fragment, index) => fragment === window[index].norm);
    if (exact) {
      return {
        annotationId: "",
        lineIndexStart: window[0].index,
        lineIndexEnd: window[window.length - 1].index,
        confidence: 1,
      };
    }

    const fuzzy = fragments.every(
      (fragment, index) => tokenSetScore(fragment, window[index].norm) >= 0.85
    );
    if (fuzzy) {
      return {
        annotationId: "",
        lineIndexStart: window[0].index,
        lineIndexEnd: window[window.length - 1].index,
        confidence: 0.9,
      };
    }
  }

  return null;
}

function fuzzyFallback(lines: NormalizedLine[], fragment: string): LyricAnnotationAnchor | null {
  let best: NormalizedLine | null = null;
  let bestScore = 0;

  for (const line of lines) {
    const score = tokenSetScore(fragment, line.norm);
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }

  if (!best || bestScore < CONFIDENCE_THRESHOLD) return null;

  return {
    annotationId: "",
    lineIndexStart: best.index,
    lineIndexEnd: best.index,
    confidence: bestScore,
  };
}

export function matchLineAnnotations(
  lyricLines: MatchableLyricLine[],
  annotations: RawLyricAnnotation[]
): LyricAnnotationAnchor[] {
  const lines = normalizeLines(lyricLines);
  const seen = new Set<string | number>();
  const anchors: LyricAnnotationAnchor[] = [];

  for (const annotation of annotations) {
    if (seen.has(annotation.id)) continue;
    seen.add(annotation.id);

    const fragments = fragmentLines(annotation.fragment);
    if (fragments.length === 0) continue;

    const anchor =
      (fragments.length === 1 ? exactSingleLine(lines, fragments[0]) : null) ??
      multilineWindow(lines, fragments) ??
      fuzzyFallback(lines, fragments[0]);

    if (!anchor) continue;

    anchors.push({
      ...anchor,
      annotationId: annotation.id,
    });
  }

  return anchors.sort((a, b) => a.lineIndexStart - b.lineIndexStart);
}
