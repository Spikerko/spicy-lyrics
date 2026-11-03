// Read-only: real text extents of the song title and artist, so the lute check
// uses measured glyph edges instead of an estimate.
(() => {
  const page = document.querySelector("#SpicyLyricsPage");
  const span = (sel) => {
    const el = page.querySelector(sel);
    if (!el) return null;
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return { text: el.innerText.trim().slice(0, 40), left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom) };
  };
  const cover = page.querySelector(".NowBar .Header .MediaBox .MediaImageContainer").getBoundingClientRect();
  return {
    track: Spicetify.Player.data?.item?.name,
    cover: { left: Math.round(cover.left), right: Math.round(cover.right) },
    title: span(".NowBar .Header .Metadata .SongName"),
    artist: span(".NowBar .Header .Metadata .Artists"),
    timeline: (() => { const b = page.querySelector(".NowBar .Timeline").getBoundingClientRect(); return { right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom) }; })(),
  };
})();
