// Splits a word into the units letter-by-letter emphasis animates. Each unit
// becomes its own inline-block span, and text never shapes across spans, so a
// unit must be everything that renders as one glyph cluster.
//
// split("") cuts UTF-16 code units: Tamil "கொ" became "க" + "ொ", and the
// orphaned vowel sign rendered on a dotted circle. Grapheme segmentation keeps
// a consonant with its marks, and also keeps surrogate pairs and emoji whole.
//
// Graphemes still split after a virama in scripts the segmenter does not treat
// as conjunct-forming (Tamil "ஸ்ரீ" → "ஸ்" + "ரீ", which then loses its
// ligature), so a grapheme ending in a virama or ZWJ is joined to the next.
const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

// Viramas of the Brahmic scripts (Devanagari … Malayalam, Sinhala, Myanmar,
// Khmer), plus ZERO WIDTH JOINER.
const JoinsNextRegex =
  /[्্੍્୍்్್്්္្‍]$/;

export function SplitLetters(text: string): string[] {
  const graphemes = segmenter
    ? Array.from(segmenter.segment(text), (s) => s.segment)
    : Array.from(text);

  const letters: string[] = [];
  for (const grapheme of graphemes) {
    const last = letters.length - 1;
    if (last >= 0 && JoinsNextRegex.test(letters[last]) && grapheme.trim().length > 0) {
      letters[last] += grapheme;
    } else {
      letters.push(grapheme);
    }
  }
  return letters;
}

export default SplitLetters;
