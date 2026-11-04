import { PageContainer } from "../Pages/PageView.ts";

/*
 * Compact mode with the cover hidden ("names only" / "lyrics only"): the cover
 * and its controls come back when the pointer goes to the spot above the names.
 *
 * The cover box keeps its place, but the names sit over it, so letting the box
 * react to the pointer by itself meant every gap between the letters, or between
 * the song and the artist, opened the cover. The zone is worked out from where
 * the text really is instead, so it also holds in small windows, where the text
 * fills most of the box.
 */

const PEEK_CLASS = "CompactHeaderPeek";
/** Room kept around the names, so the gap between the lines still counts as text. */
const NAMES_PAD = 10;

type Zone = { left: number; right: number; bottom: number };

let zone: Zone | null = null;

function isHiddenCompact(page: HTMLElement): boolean {
  if (!page.isConnected) return false;
  if (page.closest(".spicy-pip-wrapper")) return false;
  const hidden =
    page.classList.contains("CompactHeaderNames") || page.classList.contains("CompactHeaderNone");
  const compact =
    page.classList.contains("CompactMode") || page.classList.contains("ForcedCompactMode");
  return hidden && compact;
}

/** Where the pointer opens the cover: above the names, over the cover box's columns. */
function measureZone(page: HTMLElement): Zone | null {
  const box = page.querySelector<HTMLElement>(".ContentBox .NowBar .Header .MediaBox");
  if (!box) return null;
  const rect = box.getBoundingClientRect();
  if (rect.width === 0) return null;

  let bottom = rect.bottom;
  const names = page.querySelectorAll<HTMLElement>(
    ".ContentBox .NowBar .Header .Metadata :is(.SongName, .Artists)"
  );
  for (const el of names) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) bottom = Math.min(bottom, r.top - NAMES_PAD);
  }
  // Never smaller than a strip above the box, which is always free of text.
  return { left: rect.left, right: rect.right, bottom: Math.max(bottom, rect.top) };
}

let frame = 0;
let pointerX = 0;
let pointerY = 0;

function update() {
  frame = 0;
  const page = PageContainer;
  if (!page) return;
  if (!isHiddenCompact(page)) {
    page.classList.remove(PEEK_CLASS);
    zone = null;
    return;
  }

  const box = page.querySelector<HTMLElement>(".ContentBox .NowBar .Header .MediaBox");
  if (!box) return;

  if (page.classList.contains(PEEK_CLASS)) {
    // Open: it stays open over the zone it was opened from and over the box itself.
    // By position rather than :hover, so a lagging hover state can't keep it open.
    const inZone =
      zone !== null &&
      pointerX >= zone.left &&
      pointerX <= zone.right &&
      pointerY >= 0 &&
      pointerY <= zone.bottom;
    const rect = box.getBoundingClientRect();
    const inBox =
      pointerX >= rect.left &&
      pointerX <= rect.right &&
      pointerY >= rect.top &&
      pointerY <= rect.bottom;
    if (!inZone && !inBox) {
      page.classList.remove(PEEK_CLASS);
      zone = null;
    }
    return;
  }

  const next = measureZone(page);
  if (
    next &&
    pointerX >= next.left &&
    pointerX <= next.right &&
    pointerY >= 0 &&
    pointerY <= next.bottom
  ) {
    zone = next;
    page.classList.add(PEEK_CLASS);
  }
}

function onPointerMove(e: PointerEvent) {
  const page = PageContainer;
  if (!page) return;
  const open = page.classList.contains(PEEK_CLASS);
  if (!open && !isHiddenCompact(page)) return;
  pointerX = e.clientX;
  pointerY = e.clientY;
  if (!frame) frame = requestAnimationFrame(update);
}

function close() {
  PageContainer?.classList.remove(PEEK_CLASS);
  zone = null;
}

document.addEventListener("pointermove", onPointerMove, { passive: true });
document.documentElement.addEventListener("pointerleave", close);
window.addEventListener("blur", close);
