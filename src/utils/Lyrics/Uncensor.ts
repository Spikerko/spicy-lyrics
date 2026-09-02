/**
 * Restores words that the upstream lyrics provider censors before the text ever
 * reaches this client.
 *
 * Spicy Lyrics itself never censors anything — lyrics are fetched from
 * `api.spicylyrics.org`, whose provider scrubs some words to a run of asterisks
 * ("****"). Earlier versions of this module assumed exactly one word was ever
 * censored and substituted that word unconditionally. That assumption is wrong:
 * the provider censors several different words, and it censors inflected forms
 * (singular/plural) as separate runs. A fixed substitution is therefore wrong
 * whenever the censored token is a different word, or the same word in a
 * different form — and, because the result still reads as ordinary English, the
 * mistake is invisible on screen.
 *
 * This module instead LOOKS THE WORD UP. LRCLIB (https://lrclib.net) serves
 * community-contributed lyrics that are not censored. We fetch the same track,
 * then recover each censored token by matching the words around it against
 * LRCLIB's text. Because the match is anchored on surrounding context rather
 * than on line or word position, it survives the two sources disagreeing about
 * where lines break.
 *
 * If the lookup fails — offline, track not on LRCLIB, no confident match — we
 * fall back to FALLBACK_WORD, which is the previous behaviour.
 */

import Logger from "../logger.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";

const uncensorLogger = new Logger("Lyrics Uncensor");

/** A standalone run of two or more asterisks — the provider's censor token. */
const CENSOR_RUN = /\*{2,}/g;

/**
 * Used only when LRCLIB cannot tell us the real word. It is the provider's most
 * frequently censored token, so it is the best available guess — but it IS a
 * guess, which is exactly the flaw this module exists to fix. A failed lookup
 * is reported in the logs rather than silently papered over.
 */
const FALLBACK_WORD = "nigga";

/** Word tokens, keeping intra-word apostrophes intact. */
const WORD_TOKEN = /[^\W_]+(?:['’][^\W_]+)*/gu;

/** How many words of context to anchor on, and the fewest we will accept. */
const MAX_CONTEXT = 5;
const MIN_CONTEXT = 2;

const LRCLIB_ENDPOINT = "https://lrclib.net/api/search";
const LRCLIB_TIMEOUT_MS = 8000;

/** Per-track memo, so seeking or re-opening a track does not refetch. */
const referenceCache = new Map<string, string[] | null>();

/** Case/diacritic-insensitive form used for comparison only. */
function normalize(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toLowerCase();
}

/**
 * A text field somewhere in the lyrics payload that contains at least one
 * censor run, plus the global token indices of those runs.
 */
type CensoredField = {
  owner: any;
  key: string;
  /** Global token index for each censor run in this field, in order. */
  slots: number[];
};

/**
 * Walk the payload in reading order, collecting every word token and noting
 * which of them are censor runs. The token stream must be built in the order
 * the lyrics are sung, because context anchoring depends on it.
 */
function collect(lyrics: any): { stream: (string | null)[]; fields: CensoredField[] } {
  const stream: (string | null)[] = [];
  const fields: CensoredField[] = [];

  const take = (owner: any, key: string) => {
    const text = owner?.[key];
    if (typeof text !== "string" || text.length === 0) return;

    const slots: number[] = [];
    // Split on censor runs so the runs themselves become tokens, in order.
    for (const piece of text.split(/(\*{2,})/g)) {
      if (piece.length === 0) continue;
      if (/^\*{2,}$/.test(piece)) {
        slots.push(stream.length);
        stream.push(null);
        continue;
      }
      for (const word of piece.match(WORD_TOKEN) ?? []) stream.push(word);
    }
    if (slots.length > 0) fields.push({ owner, key, slots });
  };

  if (lyrics?.Type === "Static") {
    for (const line of lyrics.Lines ?? []) take(line, "Text");
  } else if (lyrics?.Type === "Line") {
    for (const group of lyrics.Content ?? []) {
      if (group?.Type === "Vocal") take(group, "Text");
    }
  } else if (lyrics?.Type === "Syllable") {
    for (const group of lyrics.Content ?? []) {
      if (group?.Type !== "Vocal") continue;
      for (const syllable of group.Lead?.Syllables ?? []) take(syllable, "Text");
      for (const background of group.Background ?? []) {
        for (const syllable of background?.Syllables ?? []) take(syllable, "Text");
      }
    }
  } else {
    // Unknown shape — a generic walk so a future format still gets restored
    // rather than silently keeping its asterisks.
    const seen = new Set<any>();
    const walk = (node: any) => {
      if (node === null || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node.Text === "string") take(node, "Text");
      for (const key in node) walk(node[key]);
    };
    walk(lyrics);
  }

  return { stream, fields };
}

/** Pull LRCLIB's word stream for the track that is currently playing. */
async function fetchReference(): Promise<string[] | null> {
  const trackId = SpotifyPlayer.GetId();
  if (trackId && referenceCache.has(trackId)) return referenceCache.get(trackId) ?? null;

  const name = SpotifyPlayer.GetName();
  const artist = SpotifyPlayer.GetArtists()?.[0]?.name;
  if (!name || !artist) return null;

  const params = new URLSearchParams({ track_name: name, artist_name: artist });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LRCLIB_TIMEOUT_MS);

  try {
    const response = await fetch(`${LRCLIB_ENDPOINT}?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`LRCLIB responded ${response.status}`);

    const results: any[] = await response.json();
    const durationSeconds = SpotifyPlayer.GetDuration() / 1000;

    // Prefer the upload whose duration is closest to what is playing: the best
    // available signal that it is the same recording and not a remix or edit.
    const usable = results.filter((result) => result?.syncedLyrics || result?.plainLyrics);
    if (usable.length === 0) throw new Error("no lyrics in LRCLIB results");

    usable.sort((a, b) => {
      const distanceA = a.duration ? Math.abs(a.duration - durationSeconds) : Number.MAX_SAFE_INTEGER;
      const distanceB = b.duration ? Math.abs(b.duration - durationSeconds) : Number.MAX_SAFE_INTEGER;
      return distanceA - distanceB;
    });

    const raw: string = usable[0].syncedLyrics ?? usable[0].plainLyrics ?? "";
    const words: string[] = [];
    for (const line of raw.split("\n")) {
      const text = line.replace(/^\s*\[\d+:\d+(?:[.:]\d+)?\]\s*/, "");
      for (const word of text.match(WORD_TOKEN) ?? []) words.push(word);
    }

    const reference = words.length > 0 ? words : null;
    if (trackId) referenceCache.set(trackId, reference);
    return reference;
  } catch (error) {
    uncensorLogger.warn("LRCLIB reference lookup failed", error);
    if (trackId) referenceCache.set(trackId, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Recover the true word for each censored slot by anchoring on the words around
 * it. Other censored slots inside the context act as wildcards, so two censored
 * words close together do not defeat the match. The context window shrinks until
 * the match is unique, and anything shorter than MIN_CONTEXT is refused — a
 * guess from a single word of context is not worth the wrong answer it yields.
 */
function recover(stream: (string | null)[], reference: string[]): Map<number, string> {
  const referenceNormalized = reference.map(normalize);
  const streamNormalized = stream.map((word) => (word === null ? null : normalize(word)));
  const recovered = new Map<number, string>();

  const matches = (window: (string | null)[], at: number): boolean =>
    window.every((word, offset) => word === null || word === referenceNormalized[at + offset]);

  for (let index = 0; index < stream.length; index += 1) {
    if (stream[index] !== null) continue;

    for (let size = MAX_CONTEXT; size >= MIN_CONTEXT; size -= 1) {
      const left = streamNormalized.slice(Math.max(0, index - size), index);
      const right = streamNormalized.slice(index + 1, index + 1 + size);
      if (left.length === 0 && right.length === 0) continue;

      const candidates: number[] = [];
      for (let at = left.length; at + right.length < referenceNormalized.length; at += 1) {
        if (!matches(left, at - left.length)) continue;
        if (!matches(right, at + 1)) continue;
        candidates.push(at);
      }
      if (candidates.length === 0) continue;

      // Several positions are fine as long as they all name the same word.
      const distinct = new Set(candidates.map((at) => referenceNormalized[at]));
      if (distinct.size === 1) {
        recovered.set(index, reference[candidates[0]]);
        break;
      }
    }
  }

  return recovered;
}

/** Write the recovered words back into the payload, run by run. */
function applyRecovered(
  fields: CensoredField[],
  recovered: Map<number, string>
): { restored: number; guessed: number } {
  let restored = 0;
  let guessed = 0;

  for (const field of fields) {
    let slot = 0;
    field.owner[field.key] = (field.owner[field.key] as string).replace(CENSOR_RUN, () => {
      const word = recovered.get(field.slots[slot]);
      slot += 1;
      if (word !== undefined) {
        restored += 1;
        return word;
      }
      guessed += 1;
      return FALLBACK_WORD;
    });
  }

  return { restored, guessed };
}

/**
 * Restore every censored word in a lyrics payload, in place.
 *
 * Idempotent, and cheap when there is nothing to do: a payload with no censor
 * runs returns before any network call, so the common case costs one walk.
 */
export async function uncensorLyrics(lyrics: any): Promise<void> {
  if (lyrics === null || typeof lyrics !== "object") return;

  const { stream, fields } = collect(lyrics);
  if (fields.length === 0) return;

  const reference = await fetchReference();
  const recovered = reference ? recover(stream, reference) : new Map<number, string>();
  const { restored, guessed } = applyRecovered(fields, recovered);

  uncensorLogger.info("Restored censored words", {
    restoredFromLrclib: restored,
    fellBackToDefault: guessed,
    hadReference: reference !== null,
  });
}
