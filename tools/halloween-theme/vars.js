// Read Spicy Lyrics' own layout variables and the lyric column's real edges,
// which is what the theme positions against.
(() => {
  const page = document.querySelector("#SpicyLyricsPage");
  const cs = getComputedStyle(page);
  const v = (n) => cs.getPropertyValue(n).trim();
  const content = page.querySelector(".LyricsContainer .LyricsContent");
  const ccs = content ? getComputedStyle(content) : null;
  const nb = page.querySelector(".ContentBox .NowBar").getBoundingClientRect();
  const lines = [...page.querySelectorAll(".LyricsContent .line")].map((l) => l.getBoundingClientRect()).filter((b) => b.width);
  return {
    vars: {
      NowBarWidth: v("--NowBarWidth"),
      NowBarLeftSpacing: v("--NowBarLeftSpacing"),
      NowBarRightSpacing: v("--NowBarRightSpacing"),
      LyricsLeftSidePadding: v("--LyricsLeftSidePadding"),
      LyricsRightSidePadding: v("--LyricsRightSidePadding"),
    },
    lyricsPadding: ccs ? { left: ccs.paddingLeft, right: ccs.paddingRight } : null,
    nowBar: { left: nb.left, right: nb.right },
    lineEdges: lines.length ? { left: Math.min(...lines.map((b) => b.left)), right: Math.max(...lines.map((b) => b.right)) } : null,
    widestLine: lines.length ? Math.max(...lines.map((b) => b.width)) : null,
  };
})();
