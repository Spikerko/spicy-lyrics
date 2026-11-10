// deno-lint-ignore-file no-explicit-any

// A background vocal is already styled as one, so it carries no parentheses of
// its own. Lyrics files still have them in a background line's romanization or
// translation, and nothing strips them before they reach the client, so they're
// dropped here: the pair wrapping the whole text, or a lone opening or closing
// one at its edge. Parentheses inside the text are kept.
//
// Render-only, like StripZeroWidth: the parsed lyrics keep their text.

// Which edges of `text` carry a wrapping parenthesis.
function wrappingEdges(text: string): { lead: boolean; trail: boolean } {
  const s = text.trim();
  const open = s.startsWith("(");
  const close = s.endsWith(")");
  if (open && close) {
    // "(a) b (c)" isn't wrapped: the first one closes before the end.
    let depth = 0;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")" && --depth === 0) return { lead: false, trail: false };
    }
    return { lead: true, trail: true };
  }
  return { lead: open && !s.includes(")"), trail: close && !s.includes("(") };
}

const dropLead = (text: string): string => text.replace(/^(\s*)\(\s*/, "$1");
const dropTrail = (text: string): string => text.replace(/\s*\)(\s*)$/, "$1");

export function StripWrappingParens(text: string): string {
  const { lead, trail } = wrappingEdges(text);
  let out = text;
  if (lead) out = dropLead(out);
  if (trail) out = dropTrail(out);
  return out.trim();
}

const romanOf = (s: any): string | undefined =>
  typeof s?.TransliteratedText === "string" ? s.TransliteratedText : undefined;

// A background line's syllables with the wrapping parentheses taken off their
// romanization, which starts on the first syllable and ends on the last. The
// syllables are copied where they change, never edited.
export function StripBackgroundRomanParens<T>(syllables: T[]): T[] {
  if (!syllables.some((s) => romanOf(s) !== undefined)) return syllables;
  const texts = syllables.map(
    (s: any) => romanOf(s) ?? (typeof s?.Text === "string" ? s.Text : "")
  );
  const { lead, trail } = wrappingEdges(texts.join(""));
  if (!lead && !trail) return syllables;

  const out = syllables.slice();
  const first = texts.findIndex((t) => t.trim() !== "");
  let last = -1;
  for (let i = texts.length - 1; i >= 0; i--)
    if (texts[i].trim() !== "") {
      last = i;
      break;
    }
  const edit = (i: number, fn: (t: string) => string) => {
    const roman = romanOf(out[i]);
    if (roman === undefined) return;
    out[i] = { ...(out[i] as any), TransliteratedText: fn(roman) };
  };
  if (lead && first !== -1) edit(first, dropLead);
  if (trail && last !== -1) edit(last, dropTrail);
  return out;
}
