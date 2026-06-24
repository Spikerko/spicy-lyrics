/**
 * Restores a word that the upstream lyrics provider censors before the text
 * ever reaches this client.
 *
 * Spicy Lyrics does not censor anything itself — lyrics are fetched from
 * `api.spicylyrics.org`, which sources them from a provider that scrubs one
 * specific word (rendering it as a run of asterisks, e.g. "****") while leaving
 * every other word intact. Because that is the only token the provider ever
 * censors, any standalone run of asterisks in the lyric text maps back to it
 * unambiguously. The restore therefore runs entirely client-side, after the
 * lyrics are fetched.
 */

// The word the provider censors, restored verbatim. Kept lowercase on purpose:
// the censored token ("****") carries no case information, the word is lowercase
// in the vast majority of its (mid-line) occurrences, and reliable line-start
// detection isn't possible for Syllable lyrics (each syllable is a separate
// Text). Consistent lowercase beats occasionally-wrong capitalisation.
const RESTORED_WORD = "nigga";

// A standalone run of two or more asterisks — the form the provider emits
// ("****", optionally next to punctuation or quotes). The negative classes
// include `*` itself so the match must span the ENTIRE run AND not touch a
// letter on either side. That leaves author-written partial censors like
// `f***` or `f**k` completely untouched — without `*` in the lookbehind the
// engine would still grab the trailing `**` of `f***` and corrupt it.
const CENSOR_PATTERN = /(?<![A-Za-z*])\*{2,}(?![A-Za-z*])/g;

/** Restore a single string. Cheap no-op when there's nothing to restore. */
function restore(text: string): string {
  if (text.indexOf("*") === -1) return text;
  return text.replace(CENSOR_PATTERN, RESTORED_WORD);
}

/**
 * Walk a lyrics object in place and restore every `Text` field, regardless of
 * format — Static (`Lines[].Text`), Line (`Content[].Text`) and Syllable
 * (`Content[].Lead.Syllables[].Text` + `Background`) — because it keys off the
 * field name rather than the layout. Idempotent.
 */
export function uncensorLyrics(lyrics: any): void {
  walk(lyrics);
}

function walk(node: any): void {
  if (node === null || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) walk(item);
    return;
  }

  if (typeof node.Text === "string") {
    node.Text = restore(node.Text);
  }

  for (const key in node) {
    const value = node[key];
    if (value !== null && typeof value === "object") walk(value);
  }
}
