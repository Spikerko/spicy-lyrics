// Switch to a track that has lyrics without disturbing the listener:
// mute, record state, step forward through the queue until Spicy Lyrics
// renders lyric lines. restore_state.js puts everything back.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Spicetify.Player;
  const saved = {
    uri: P.data?.item?.uri,
    name: P.data?.item?.name,
    progress: P.getProgress(),
    wasPlaying: P.isPlaying(),
    muted: P.getMute(),
    steps: 0,
  };
  window.__hlwSaved = saved;
  P.setMute(true);

  for (let i = 0; i < 6; i++) {
    const lines = document.querySelectorAll("#SpicyLyricsPage .LyricsContent .line").length;
    if (lines > 3) break;
    P.next();
    saved.steps++;
    await sleep(600);
    P.pause();
    await sleep(3500);
  }
  return {
    saved,
    now: P.data?.item?.name,
    lines: document.querySelectorAll("#SpicyLyricsPage .LyricsContent .line").length,
    classes: document.querySelector("#SpicyLyricsPage")?.className,
  };
})();
