// Syllables and emphasized letters are inline-blocks, and the browser shapes each
// one on its own. The font's kerning between the last letter of one piece and the
// first of the next ("To" + "day", "A" + "V") never happens, so a word sung in
// several syllables shows gaps that the same word written whole doesn't have.
// Each glued seam gets that kerning back as a margin on the piece before it: the
// two pieces' joined width minus their separate widths, in em so it follows the
// lyrics size.

const REFERENCE_PX = 100;
const widths = new Map<string, number>();
let context: CanvasRenderingContext2D | null = null;

function measure(font: string, text: string): number {
  const key = `${font}\u0000${text}`;
  let width = widths.get(key);
  if (width === undefined) {
    context ??= document.createElement("canvas").getContext("2d");
    if (!context) return NaN;
    context.font = font;
    context.fontKerning = "normal";
    width = context.measureText(text).width;
    widths.set(key, width);
  }
  return width;
}

function fontOf(el: HTMLElement): string {
  const style = getComputedStyle(el);
  return `${style.fontStyle} ${style.fontWeight} ${REFERENCE_PX}px ${style.fontFamily}`;
}

function lettersOf(group: Element): HTMLElement[] {
  return Array.from(group.querySelectorAll<HTMLElement>(":scope > .letter"));
}

// The pieces that sit side by side with nothing between them, in reading order.
function runsIn(root: HTMLElement): HTMLElement[][] {
  const runs: HTMLElement[][] = [];
  for (const group of root.querySelectorAll<HTMLElement>(".word-group")) {
    const run: HTMLElement[] = [];
    for (const child of group.children) {
      if (child.classList.contains("letterGroup")) run.push(...lettersOf(child));
      else run.push(child as HTMLElement);
    }
    runs.push(run);
  }
  for (const group of root.querySelectorAll<HTMLElement>(".letterGroup")) {
    if (!group.parentElement?.classList.contains("word-group")) runs.push(lettersOf(group));
  }
  return runs;
}

const pendingFonts = new WeakSet<HTMLElement>();

export const KernSyllableSeams = (root: HTMLElement) => {
  if (!root.isConnected) return;
  const runs = runsIn(root).filter((run) => run.length > 1 && run[0].dataset.seamsKerned !== "1");
  if (runs.length === 0) return;

  // A font still loading measures as its fallback; wait for it once.
  const fonts = new Set<string>();
  for (const run of runs) for (const piece of run) fonts.add(fontOf(piece));
  const unloaded = [...fonts].filter((font) => !document.fonts.check(font));
  if (unloaded.length > 0 && !pendingFonts.has(root)) {
    pendingFonts.add(root);
    Promise.all(unloaded.map((font) => document.fonts.load(font)))
      .catch(() => {})
      .then(() => KernSyllableSeams(root));
    return;
  }

  for (const run of runs) {
    run[0].dataset.seamsKerned = "1";
    for (let i = 0; i < run.length - 1; i++) {
      const before = run[i];
      const after = run[i + 1];
      const a = before.textContent ?? "";
      const b = after.textContent ?? "";
      before.style.marginInlineEnd = "";
      if (!a.trim() || !b.trim() || /\s$/.test(a) || /^\s/.test(b)) continue;
      const font = fontOf(before);
      if (font !== fontOf(after)) continue;
      const kern = (measure(font, a + b) - measure(font, a) - measure(font, b)) / REFERENCE_PX;
      if (Number.isFinite(kern) && Math.abs(kern) > 0.001) {
        before.style.marginInlineEnd = `${kern.toFixed(4)}em`;
      }
    }
  }
};
