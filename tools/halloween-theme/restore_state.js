// Undo find_lyrics_track.js: step back to the original track, restore its
// position, play/pause state and mute state.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Spicetify.Player;
  const s = window.__hlwSaved;
  if (!s) return { error: "nothing saved" };
  for (let i = 0; i < s.steps + 2 && P.data?.item?.uri !== s.uri; i++) {
    P.back();
    await sleep(500);
    P.pause();
    await sleep(900);
  }
  const back = P.data?.item?.uri === s.uri;
  if (back) {
    P.seek(s.progress);
    await sleep(400);
  }
  if (s.wasPlaying) P.play();
  else P.pause();
  P.setMute(s.muted);
  return { restored: back, now: P.data?.item?.name, progress: P.getProgress(), muted: P.getMute(), playing: P.isPlaying() };
})();
