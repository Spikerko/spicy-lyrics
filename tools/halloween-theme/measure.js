// Measure the real content boxes in Spicy Lyrics' fullscreen view.
(() => {
  const page = document.querySelector("#SpicyLyricsPage");
  const r = (sel, root = page) => {
    const el = root?.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height),
      right: Math.round(b.right), bottom: Math.round(b.bottom),
      visible: cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0,
      z: cs.zIndex, pos: cs.position,
    };
  };
  // Union of every rendered lyric line, which is what must never be covered.
  const lines = [...(page?.querySelectorAll(".LyricsContent .line") ?? [])]
    .map((l) => l.getBoundingClientRect())
    .filter((b) => b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight);
  const union = lines.length
    ? {
        x: Math.round(Math.min(...lines.map((b) => b.left))),
        y: Math.round(Math.min(...lines.map((b) => b.top))),
        right: Math.round(Math.max(...lines.map((b) => b.right))),
        bottom: Math.round(Math.max(...lines.map((b) => b.bottom))),
        count: lines.length,
      }
    : null;
  return {
    viewport: { w: innerWidth, h: innerHeight },
    page: r(":scope", document.body) && (() => { const b = page.getBoundingClientRect(); return { w: b.width, h: b.height }; })(),
    contentBox: r(".ContentBox"),
    nowBar: r(".ContentBox .NowBar"),
    mediaBox: r(".NowBar .Header .MediaBox"),
    artwork: r(".NowBar .Header .MediaBox .MediaImageContainer"),
    metadata: r(".NowBar .Header .Metadata"),
    timeline: r(".NowBar .Timeline"),
    playbackControls: r(".NowBar .PlaybackControls"),
    volume: r(".NowBar .VolumeControl"),
    heart: r(".NowBar .Heart"),
    viewControls: r(".ViewControls"),
    lyricsContainer: r(".LyricsContainer"),
    lyricsContent: r(".LyricsContainer .LyricsContent"),
    lyricLinesUnion: union,
    bgLayers: [...(page?.querySelectorAll(".ContentBox > .spicy-dynamic-bg") ?? [])].map((e) => ({ cls: e.className, z: getComputedStyle(e).zIndex })),
    brandedHeader: r(".BrandedHeader"),
  };
})();
