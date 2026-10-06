/*
  Workaround for Spicetify <= v2.45.1's applyScrollingFix (spicetifyWrapper/platform.js).

  It is meant to run only on Spotify <= 1.2.56, but the released version check
  (`version[1] >= 2 && version[2] >= 57`) misses 1.3.x. When it runs, a body-wide
  childList MutationObserver re-runs it after every DOM insertion/removal, and each run
  calls getComputedStyle on every element not tagged `data-scroll-optimized`
  (~17-30ms). Every lyrics line change mounts/unmounts virtualizer rows, so every line
  change stalled the renderer and the dynamic background for a frame or more.

  We tag elements with that marker before the scan reaches them: its observer only
  queues the scan in a microtask, and our observer's callback runs in the same
  mutation-delivery pass, before that microtask. The scan then finds nothing to check.
  This mirrors upstream, which skips the fix entirely on these versions:
  https://github.com/spicetify/cli/commit/5cd0c6826594212ba1f992611b8f13c35b54d4f9

  Remove once a Spicetify release containing that commit is the minimum we support.
*/

import Logger from "./Logger.ts";

const MARKER = "data-scroll-optimized";
// The exact selector the scan queries; themes that stub it match on this string.
const SCAN_SELECTOR = `*:not([${MARKER}])`;
// Last Spicetify release shipping the broken check.
const LAST_AFFECTED_SPICETIFY = [2, 45, 1];

const guardLogger = new Logger("ScrollFixGuard");

function isAffectedSpotify(): boolean {
  const version = Spicetify.Platform.version.split(".").map((i) => Number.parseInt(i, 10));
  const releasedSkips = version[1] >= 2 && version[2] >= 57;
  const fixedSkips = (version[1] == 2 && version[2] >= 57) || version[1] > 2;
  return fixedSkips && !releasedSkips;
}

// Unparseable versions (e.g. dev builds from main) already have the fix.
function isAffectedSpicetify(): boolean {
  const version = Spicetify.Config?.version?.split(".").map((i) => Number.parseInt(i, 10));
  if (!version || version.length < 3 || version.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    if (version[i] !== LAST_AFFECTED_SPICETIFY[i]) return version[i] < LAST_AFFECTED_SPICETIFY[i];
  }
  return true;
}

// Vantagraph ships its own guard: it stubs the scan's query, then clears inline
// transform/will-change on every tagged element once at startup. If we tagged
// everything first, that cleanup would strip inline transforms page-wide.
function isVantagraphGuarding(): boolean {
  if (!/vantagraph/i.test(Spicetify.Config?.current_theme ?? "")) return false;
  return Spicetify.LocalStorage.get("vantagraph:wrapper-guard") !== "false";
}

// Every document has untagged elements, so an empty result means someone else
// already neutralised the scan's query.
function isScanAlreadyNeutralised(): boolean {
  return document.querySelectorAll(SCAN_SELECTOR).length === 0;
}

function tagSubtree(root: Element) {
  if (!root.hasAttribute(MARKER)) root.setAttribute(MARKER, "true");
  for (const el of root.querySelectorAll(SCAN_SELECTOR)) {
    el.setAttribute(MARKER, "true");
  }
}

export function guardSpicetifyScrollingFix() {
  if (!isAffectedSpotify() || !isAffectedSpicetify()) return;
  if (isVantagraphGuarding()) {
    guardLogger.debug("Skipped: Vantagraph's wrapper guard handles it");
    return;
  }
  if (isScanAlreadyNeutralised()) {
    guardLogger.debug("Skipped: scan query already neutralised elsewhere");
    return;
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && node.isConnected) tagSubtree(node);
      }
    }
  });
  // The scan queries the whole document, <head> included, so tag from the root.
  observer.observe(document.documentElement, { childList: true, subtree: true });

  tagSubtree(document.documentElement);
}
