# PJS themes for Spicy Lyrics

This branch (`pjs-themes`) adds GIK UGM / PJS (Perayaan Jelajah Studi) theming
on top of [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) by Spikerko.
Spicy Lyrics is AGPL-3.0, and so are these changes (see `LICENSE`).

The logos and artwork (PJS, GIK UGM, the PJS #13 Halloween art, the squirrel
mascots) belong to GIK UGM and its designers. They are here so the theme
builds, not under the code licence. Ask GIK before reusing them elsewhere.

## What it adds

| Feature | Files | Switch (Settings > Experiments) |
|---|---|---|
| Branded header: GIK UGM + PJS logos in a glass pill above the lyrics | `src/components/Utils/BrandedHeader*.ts`, `src/css/BrandedHeader.css` | `brandedHeader`, `brandedHeaderGlass` |
| PJS #13 Halloween fullscreen scene: sky, moon, haunted house, graves, tree, witch, lute-playing squirrel, rising notes, zombie walking out of the graves, bats, Spooky logo | `src/components/Utils/Halloween*.ts`, `src/css/HalloweenTheme.css` | `halloweenTheme` |

Both are on by default. The theme shows in Cinema View / Fullscreen. The
branded pill hides itself while the Halloween theme is on.

The three Spicy Lyrics files that load these features are changed by a small,
repeatable script (see "Updating Spicy Lyrics"): `src/app.tsx`,
`src/components/Pages/PageView.ts`, `src/utils/experiments.ts`.

## Build and install

Needs [Bun](https://bun.sh), [Spicetify](https://spicetify.app) and the
Spotify desktop app (not the Microsoft Store version).

```sh
bun install
bun run build                      # writes dist/spicy-lyrics.js
python tools/halloween-theme/verify_bundle.py    # 59 checks on the built file
python tools/branded-header/verify_bundle.py     # 21 checks
```

Install the build:

- Windows: copy `dist/spicy-lyrics.js` to `%APPDATA%\spicetify\Extensions\`
- macOS / Linux: copy it to `~/.config/spicetify/Extensions/`

then:

```sh
spicetify config extensions spicy-lyrics.js
spicetify apply
```

Do not install Spicy Lyrics from the Spicetify Marketplace as well (two copies
clash), and do not press "Update" inside Spicy Lyrics (it replaces this build
with the official one). Ready-made installers for other machines:
`tools/windows/` and `tools/mac/` (see "Tools").

## Changing the Halloween theme

- Layout, sizes, animation: `src/css/HalloweenTheme.css`. Every position is
  written in Spicy Lyrics' own layout variables (`--NowBarWidth`,
  `--NowBarLeftSpacing`, `--NowBarRightSpacing`) and the theme's own
  `--hlw-*` values, so it follows the real layout at any window size.
- Which pieces exist and in what order: `src/components/Utils/HalloweenTheme.ts`.
- Layers: `.HalloweenScene` (z 1, behind lyrics), `.HalloweenTop` (z 3, bats,
  web, branch), `.HalloweenLogo` (z 5, the logo, over the lyrics; the lyrics
  fade out before reaching it). Lyrics are z 4, the cover/NowBar z 10.
- Canvas-video songs, compact mode, portrait windows and Popup Lyrics hide the
  characters automatically (rules at the end of the CSS).

### Images

Images are inlined into the bundle as data URIs, because a Spicetify extension
is one JS file. `src/components/Utils/HalloweenAssets.ts` is generated, do not
edit it by hand. To change or add an image:

1. Put the art in `tools/halloween-theme/source/` (copies of the originals
   are already there).
2. Add or change the entry in `ASSETS` in `tools/halloween-theme/gen_assets.py`.
   It uses the copy in `source/` when there is one, so it runs on any machine.
   `LIB` (the original asset folder on the author's machine) is only read for
   an image that has no copy in `source/` yet.
3. `python tools/halloween-theme/gen_assets.py`, then `bun run build`.

## Adding another theme

Copy the Halloween pattern (three files plus the hooks in
`tools/branded-header/integrate.py`), renaming `Halloween`/`Hlw__` to your
theme. One rule that is easy to miss: give the new theme its **own** copy of
the layout block at the top of `HalloweenTheme.css` (renamed, e.g.
`--ntl-lyrics-left`). The `--hlw-*` values only exist while the Halloween
theme is on, so a theme that reuses them breaks as soon as Halloween is off.
`tools/halloween-theme/new_theme_vars_check.py` demonstrates this.

A new entry in `src/utils/experiments.ts` gets its own on/off switch in
Settings > Experiments automatically.

## Updating Spicy Lyrics

```sh
git fetch origin                   # origin = Spikerko/spicy-lyrics
git merge origin/main              # or rebase
python tools/branded-header/integrate.py   # re-applies the 3 hooks; safe to run twice
bun run build
```

`tools/backup/hooks-before-6.4.70.patch` records the hooks as they were before
the last upstream update, in case `integrate.py` needs adjusting.

## Tools

| Folder | What |
|---|---|
| `tools/branded-header/` | `integrate.py` (hooks for both features), asset generator, bundle checks |
| `tools/halloween-theme/` | asset generator, bundle checks, and live checks that drive a running Spotify over the Chrome DevTools Protocol (start Spotify with `--remote-debugging-port=9222`): layout at many window sizes, logo vs lyrics, zombie motion, contrast |
| `tools/windows/`, `tools/mac/` | installers for other machines (`install-windows.cmd`, `install-mac.sh`, Indonesian guide `BACA-DULU.md`). Put the built `dist/spicy-lyrics.js` next to the installer. `tools/mac/make_zip.py` builds a ready-to-send Mac zip. Each has sandbox tests (`test_install.*`, `negative_controls.py`) that never touch your real Spotify |
| `tools/halloween-brief/`, `tools/gef-brief/`, `tools/pjs14-brief/` | mockup scripts and the mockups for the Halloween theme and the upcoming PJS #14 (GEF) theme |

Most design scripts read artwork from folders on the author's machine
(`D:\GIK-INTERN\...`, `D:\NGODING\gik-intern\Global-Edu-Fair\...`). They
are not needed to build the theme; to run them, change the path constant at
the top of the script (`LIB`, `A` or `KV`). The live checks look for Chrome at
its default Windows path.

## Status of the PJS #14 (GEF) theme

Mockup stage only, not in the build yet. Three options are in
`tools/pjs14-brief/` (`mockups3_compare_notes.png` compares them), built from
the PJS #14 asset kit with the Halloween notes recoloured to the new palette
(`tools/pjs14-brief/notes/`). The asset kit itself is not in this repo.
