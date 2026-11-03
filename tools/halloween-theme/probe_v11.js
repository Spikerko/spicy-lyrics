// Live v1.1 probe: logo vs lyrics, witch vs graves/house, zombie path over a
// full 24s cycle (sampled by seeking the animations, not waiting). Restores
// every animation's currentTime it touches.
(async () => {
  const P = document.querySelector('#SpicyLyricsPage');
  const R = (e) => { const b = e.getBoundingClientRect(); return {l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height}; };
  const q = (s) => P.querySelector(s);
  const out = {vw: [innerWidth, innerHeight], fullscreen: P.classList.contains('Fullscreen')};

  // Stacking: logo layer z vs lyrics and NowBar.
  const zi = (s) => getComputedStyle(q(s)).zIndex;
  out.z = {scene: zi('.HalloweenScene'), top: zi('.HalloweenTop'), logo: zi('.HalloweenLogo'), lyrics: zi('.LyricsContainer'), nowbar: zi('.NowBar')};

  // Is the logo actually on top? Hit-test ignores pointer-events:none, so use
  // elementsFromPoint order after temporarily enabling pointer events.
  const logo = q('.Hlw__Logo'), lr = R(logo);
  const layer = q('.HalloweenLogo');
  layer.style.pointerEvents = 'auto'; logo.style.pointerEvents = 'auto';
  const stack = document.elementsFromPoint(lr.l + lr.w / 2, lr.t + lr.h / 2).slice(0, 4).map(e => e.className.toString().slice(0, 24));
  layer.style.pointerEvents = ''; logo.style.pointerEvents = '';
  out.logo = {box: lr, topmostAtCentre: stack};

  // Lyrics mask: alpha at the logo's bottom edge, measured in LyricsContent space.
  const lc = q('.LyricsContainer .LyricsContent'), lcr = R(lc);
  const cs = getComputedStyle(lc);
  out.mask = {lcTop: lcr.t, image: cs.maskImage.slice(0, 160)};
  // Visible lyric glyphs above the fade-in end must have ~0 mask alpha.
  const ln = [...lc.querySelectorAll('.line')].map(l => { const g = document.createRange(); g.selectNodeContents(l); return g.getBoundingClientRect(); }).filter(b => b.width && b.bottom > 0 && b.top < innerHeight);
  out.lyricsOverlapLogoBox = ln.filter(b => b.right > lr.l && b.left < lr.r && b.top < lr.b).map(b => [Math.round(b.top), Math.round(b.bottom)]);

  // Witch.
  const witch = q('.Hlw__Witch'), graves = q('.Hlw__Graves'), house = q('.Hlw__House');
  out.witch = {box: R(witch), scale: getComputedStyle(witch).scale, graves: R(graves), house: R(house), shown: getComputedStyle(witch).display !== 'none'};

  // Zombie: seek both animations through the cycle.
  const walk = q('.Hlw__ZombieWalk'), z = q('.Hlw__Zombie');
  const anims = [...walk.getAnimations(), ...z.getAnimations()].filter(a => a.animationName !== 'Hlw__Lurch');
  const saved = anims.map(a => a.currentTime);
  const samples = [];
  for (const pct of [0, 5, 10, 14, 19, 40, 60, 84, 87, 89.9, 95]) {
    anims.forEach(a => { a.currentTime = 24000 * pct / 100; });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const zb = R(z), wb = R(walk);
    samples.push({pct, imgTop: Math.round(zb.t), imgL: Math.round(zb.l), imgR: Math.round(zb.r), clipBottom: Math.round(wb.b), opacity: +getComputedStyle(walk).opacity});
  }
  anims.forEach((a, i) => { a.currentTime = saved[i]; });
  out.zombie = {anims: anims.map(a => a.animationName), graves: R(graves), samples, shown: getComputedStyle(walk).display !== 'none'};
  return out;
})()
