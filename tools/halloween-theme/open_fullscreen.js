// Open Spicy Lyrics, then its fullscreen, using the visible UI controls
// (no private API), and report what was found.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { steps: [] };

  if (!document.querySelector("#SpicyLyricsPage")) {
    const btn =
      document.querySelector("#SpicyLyricsButton, [data-spicy-lyrics-button], button[aria-label*='Spicy']") ||
      [...document.querySelectorAll("button")].find((b) => /spicy lyrics/i.test(b.getAttribute("aria-label") || b.title || ""));
    out.steps.push({ playbarButton: btn ? btn.outerHTML.slice(0, 160) : null });
    if (btn) btn.click();
    await sleep(2500);
  }
  out.pageOpen = !!document.querySelector("#SpicyLyricsPage");

  const fsBtn = document.querySelector("#SpicyLyricsPage #FullscreenToggle") || document.querySelector("#SpicyLyrics_FullscreenButton");
  out.steps.push({ fullscreenButton: fsBtn ? fsBtn.id || fsBtn.outerHTML.slice(0, 120) : null });
  if (fsBtn && !document.querySelector("#SpicyLyricsPage.Fullscreen")) {
    fsBtn.click();
    await sleep(3000);
  }
  const page = document.querySelector("#SpicyLyricsPage");
  out.fullscreen = !!document.querySelector("#SpicyLyricsPage.Fullscreen");
  out.classes = page ? page.className : null;
  out.viewport = { w: innerWidth, h: innerHeight };
  return out;
})();
