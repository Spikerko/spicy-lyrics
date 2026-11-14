/**
 * Things that share a bottom corner with the Lyrics / Queue switch (QueueView.ts) step aside while
 * it is awake: Up Next and the pinned credit rows, with the NowBar on the right. This keeps two facts
 * where their CSS can read them:
 *
 * - `ViewSwitchAwake` on the switch's parent (the ContentBox) while the switch shows: the controls
 *   are awake, the pointer is on it, its scroll seat is open, or it holds keyboard focus. The same
 *   states its own opacity follows in QueueView.css.
 * - `--SL-ViewSwitchEnd`, the capsule's right edge in the ContentBox, on each element that opts in
 *   through `ClaimSwitchClearance`. It is written on those elements rather than on the ContentBox,
 *   where every lyric line under it would restyle on each write while a seat opens.
 *
 * QueueView calls `WatchViewSwitch` when it mounts or removes the switch, and
 * `RefreshSwitchClearance` after anything that moves the switch without resizing it (a side swap).
 * No imports, so the lyrics code can opt in without depending on the components.
 */

const TARGET_ATTRIBUTE = "data-switch-clearance";
const AWAKE_CLASS = "ViewSwitchAwake";

let watched: HTMLElement | null = null;
let host: HTMLElement | null = null;
let edge = "";
let mutationObserver: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
// Set from pointerenter/leave: :hover can still match while pointerleave is being handled.
let pointerInside = false;

function isAwake(viewSwitch: HTMLElement): boolean {
  if (viewSwitch.dataset.controls !== "Hidden" || pointerInside) return true;
  if (viewSwitch.classList.contains("HasScroll") && viewSwitch.dataset.view !== "queue") return true;
  return !!viewSwitch.querySelector(":focus-visible");
}

function write(target: HTMLElement) {
  if (target.style.getPropertyValue("--SL-ViewSwitchEnd") === edge) return;
  if (edge) target.style.setProperty("--SL-ViewSwitchEnd", edge);
  else target.style.removeProperty("--SL-ViewSwitchEnd");
}

/** Re-reads the switch's state and right edge, and passes them on. */
export function RefreshSwitchClearance() {
  if (!watched || !host) return;
  host.classList.toggle(AWAKE_CLASS, isAwake(watched));
  // Offsets, not rects: a press scales the capsule.
  const next = `${watched.offsetLeft + watched.offsetWidth}px`;
  if (next === edge) return;
  edge = next;
  for (const target of host.querySelectorAll<HTMLElement>(`[${TARGET_ATTRIBUTE}]`)) write(target);
}

/** Marks `target` as one that steps aside, and gives it the current edge at once. */
export function ClaimSwitchClearance(target: HTMLElement) {
  target.setAttribute(TARGET_ATTRIBUTE, "");
  write(target);
}

export function WatchViewSwitch(viewSwitch: HTMLElement | null) {
  if (viewSwitch === watched) return;
  mutationObserver?.disconnect();
  resizeObserver?.disconnect();
  mutationObserver = resizeObserver = null;
  host?.classList.remove(AWAKE_CLASS);
  watched = viewSwitch;
  host = viewSwitch?.parentElement ?? null;
  edge = "";
  pointerInside = !!viewSwitch?.matches(":hover");
  if (!viewSwitch || !host) return;

  const view = viewSwitch.ownerDocument.defaultView ?? window;
  // data-controls follows the pointer (Fullscreen.ts); HasScroll and data-view open and close seats.
  mutationObserver = new view.MutationObserver(RefreshSwitchClearance);
  mutationObserver.observe(viewSwitch, { attributes: true, attributeFilter: ["data-controls", "data-view", "class"] });
  // The seats change its width; a window resize can move it.
  resizeObserver = new view.ResizeObserver(RefreshSwitchClearance);
  resizeObserver.observe(viewSwitch);
  resizeObserver.observe(host);
  // The pointer resting on it holds it up after the rest of the controls have gone.
  viewSwitch.addEventListener("pointerenter", () => {
    pointerInside = true;
    RefreshSwitchClearance();
  });
  viewSwitch.addEventListener("pointerleave", () => {
    pointerInside = false;
    RefreshSwitchClearance();
  });
  viewSwitch.addEventListener("focusin", RefreshSwitchClearance);
  viewSwitch.addEventListener("focusout", () => queueMicrotask(RefreshSwitchClearance));
  RefreshSwitchClearance();
}
