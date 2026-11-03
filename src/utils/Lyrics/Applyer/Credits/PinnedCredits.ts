import { $pinnedCredits } from "../../../stores.ts";

/**
 * Pinned Credits (setting): the credit rows move out of the scrolling lyrics into a layer
 * held at the bottom of the lyrics area. "noWriters" moves the source and community rows
 * and leaves the songwriters to scroll in after the last line; "full" moves every row.
 *
 * The rows are moved, not copied, so their links and listeners come along, and they go
 * back to the scrolling block whenever pinning stops. The layer sits beside .LyricsContent
 * (inside it, the bottom fade would mask it too) and takes its padding and font size from
 * the lyrics, so the rows line up with the lines and size exactly as they would in place.
 */

const ROW_ORDER = [".Credits", ".LyricsProvider", ".SongInfo"];

let home: HTMLElement | null = null;
let layer: HTMLElement | null = null;
let observer: ResizeObserver | null = null;

function rowRank(row: Element): number {
  return ROW_ORDER.findIndex((selector) => row.matches(selector));
}

/** Puts every pinned row back in the scrolling block and drops the layer. */
function unpin(): void {
  if (layer && home) {
    const rows = [
      ...home.children,
      ...layer.querySelectorAll(ROW_ORDER.map((s) => `.SongCredits > ${s}`).join(", ")),
    ];
    home.append(...rows.sort((a, b) => rowRank(a) - rowRank(b)));
  }
  observer?.disconnect();
  observer = null;
  const container = layer?.parentElement;
  container?.classList.remove("HasPinnedCredits");
  container?.style.removeProperty("--SL-PinnedCreditsHeight");
  layer?.remove();
  layer = null;
}

/** Copies the lyrics' side padding and font size onto the layer, and publishes its height. */
function syncLayout(): void {
  const container = layer?.parentElement;
  const content = container?.querySelector<HTMLElement>(":scope > .LyricsContent");
  const scroll = content?.querySelector<HTMLElement>(".SpicyLyricsScrollContainer");
  if (!layer || !container || !content || !scroll) return;

  // The padding goes on the column inside: the layer itself spans the lyrics area's width,
  // so `cqw` in the credit sizes resolves against the same width as it does in the scroll.
  const column = layer.firstElementChild as HTMLElement;
  const style = getComputedStyle(scroll);
  const contentRect = content.getBoundingClientRect();
  const scrollRect = scroll.getBoundingClientRect();
  layer.style.fontSize = style.fontSize;
  column.style.paddingLeft = `${scrollRect.left - contentRect.left + parseFloat(style.paddingLeft)}px`;
  column.style.paddingRight = `${contentRect.right - scrollRect.right + parseFloat(style.paddingRight)}px`;
  container.style.setProperty("--SL-PinnedCreditsHeight", `${Math.ceil(layer.offsetHeight)}px`);
}

function place(): void {
  unpin();

  const mode = $pinnedCredits.get();
  const scroll = home?.parentElement;
  const content = scroll?.closest<HTMLElement>(".LyricsContent");
  const container = content?.parentElement;
  if (
    mode === "off" ||
    !home ||
    !scroll ||
    !content ||
    !container?.classList.contains("LyricsContainer")
  )
    return;
  // The sidebar card is too short to give up its bottom to the credits, and without
  // anchor positioning there is no box to pin them to: both keep them in the scroll.
  if (container.closest("#SpicyLyricsPage")?.classList.contains("CardMode")) return;
  if (!CSS.supports("anchor-name", "--a")) return;

  const rows = [...home.children].filter((row) =>
    mode === "full" ? rowRank(row) >= 0 : rowRank(row) > 0
  );
  if (rows.length === 0) return;

  layer = document.createElement("div");
  layer.classList.add("LyricsPinnedCredits");
  layer.classList.toggle("EndsOnOppositeLine", scroll.classList.contains("EndsOnOppositeLine"));
  const column = document.createElement("div");
  column.classList.add("PinnedCreditsColumn");
  const credits = document.createElement("div");
  credits.className = home.className;
  credits.append(...rows);
  column.append(credits);
  layer.append(column);
  content.after(layer);
  container.classList.add("HasPinnedCredits");

  observer = new ResizeObserver(syncLayout);
  observer.observe(layer);
  observer.observe(content);
  observer.observe(scroll);
  syncLayout();
}

/**
 * Takes the credits block built for the current lyrics. Placement waits for the current
 * task to finish: the appliers build the block just before they attach the lyrics to the
 * page. Not a frame, which never comes while Spotify's window is hidden.
 */
export function PinSongCredits(credits: HTMLElement): void {
  unpin();
  home = credits;
  queueMicrotask(place);
}

/** Drops the pinned credits with the lyrics they belong to. */
export function ClearPinnedCredits(): void {
  unpin();
  home = null;
}

$pinnedCredits.listen(() => {
  if (home?.isConnected) queueMicrotask(place);
});
