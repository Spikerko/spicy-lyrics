// Zero project imports on purpose. Low-level shared modules (Scheduler, IntervalManager,
// LyricsVirtualizer, etc.) need PiP-aware requestAnimationFrame/document helpers, but
// importing them from PopupLyrics.ts would drag in its whole chain (PageView -> Fullscreen
// -> NPVLyrics -> Session -> ...), which risks circular-import evaluation-order bugs (a
// module's own top-level `new Logger(...)` running before Logger.ts has finished
// initializing). Keeping this file dependency-free means anything can import from it
// without ever risking a cycle.
export let IsPIP = false;
// True for the whole PiP setup flow. The NPV card treats it as "page busy" so it can't
// re-take the pipeline during the long awaits (requestWindow, style fetches) before
// IsPIP itself is set.
export let IsPIPOpening = false;
export let _IsPIP_after = false;

let currentPipWindow: Window | null = null;

export const SetIsPIP = (value: boolean): void => {
  IsPIP = value;
};

export const SetIsPIPOpening = (value: boolean): void => {
  IsPIPOpening = value;
};

export const SetIsPIPAfter = (value: boolean): void => {
  _IsPIP_after = value;
};

export const SetPipWindow = (win: Window | null): void => {
  currentPipWindow = win;
};

export const GetPipWindow = (): Window | null => currentPipWindow;

// Document Picture-in-Picture keeps the same JS realm as the opener, but each window has
// its OWN requestAnimationFrame. The opener's rAF is throttled/frozen by the browser once
// it's fully hidden (e.g. closed to background, not just minimized), which would silently
// stall any loop driving the popup's UI. Callers that render into the popup must schedule
// frames on the pip window itself so they keep running regardless of the opener's visibility.
export const RequestPipAnimationFrame = (callback: FrameRequestCallback): number => {
  const win = (IsPIP && currentPipWindow) ? currentPipWindow : window;
  return win.requestAnimationFrame(callback);
};

export const CancelPipAnimationFrame = (handle: number): void => {
  const win = (IsPIP && currentPipWindow) ? currentPipWindow : window;
  win.cancelAnimationFrame(handle);
};

// Same reasoning as above but for `document.hidden`/visibilitychange: the popup has its
// own Document, so checking the opener's `document.hidden` reports the wrong thing entirely
// (e.g. staying "visible" while the popup is actually the one that went hidden, or bailing
// on the popup's own layout work because the opener (which isn't even on screen) got
// backgrounded).
export const GetActiveDocument = (): Document => {
  return (IsPIP && currentPipWindow) ? currentPipWindow.document : document;
};

// Same reasoning again, for anything sizing itself off `window` (matchMedia,
// innerWidth/innerHeight): the popup is a fixed ~390px window regardless of how wide the
// main Spotify window happens to be.
export const GetActiveWindow = (): Window => {
  return (IsPIP && currentPipWindow) ? currentPipWindow : window;
};
