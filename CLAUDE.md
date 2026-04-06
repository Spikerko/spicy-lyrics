# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (watch mode — builds and syncs to Spicetify)
bun run dev

# Production build (outputs to builds/)
bun run build

# Lint
bun run lint

# Lint with auto-fix
bun run lint:fix

# Format
bun run fmt
```

Build outputs: `dist/` (intermediate), `builds/spicy-lyrics.mjs` (final bundle consumed by Spicetify).

Version and project name are managed in `project/config.ts` — bump this file when releasing.

`isDev` flag in `src/components/Global/Defaults.ts` switches the API base URL between `http://localhost:3000` and `https://api.spicylyrics.org`.

## Architecture

This is a **Spicetify extension** (not a standalone web app). It runs inside the Spotify desktop client and depends on `window.Spicetify.*` globals being available at runtime. The build tool is `@spicemod/creator` (spicetify-creator), configured in `spice.config.ts`.

### Startup flow

`src/app.tsx` is the entry point. It waits for `Platform.OnSpotifyReady` (a promise that polls for `Spicetify.Platform` and `Spicetify.CosmosAsync`), then bootstraps the UI and registers event listeners for track changes.

### Core subsystems

**Lyrics pipeline** (`src/utils/Lyrics/`)
1. `fetchLyrics.ts` — fetches lyrics for a track URI; checks in-memory state → `LyricsStore` (IndexedDB-backed expire cache via `@spikerko/tools/Cache`) → network (`/query` API). Returns `[descriptor, httpStatus]` tuples.
2. `ProcessLyrics.ts` — language detection (`franc`) + romanization for Japanese/Chinese/Korean/Cyrillic/Greek scripts.
3. `Global/Applyer.ts` — dispatches to the three apply functions based on `lyrics.Type`.
4. `Applyer/Static.ts`, `Applyer/Synced/Line.ts`, `Applyer/Synced/Syllable.ts` — build DOM for each lyrics type.
5. `Animator/` — handles live playback animation (active line highlighting, scrolling).

**Lyrics types** (from the API):
- `"Static"` — plain line-by-line, no timing.
- `"Line"` — line-synced with timestamps.
- `"Syllable"` — word/syllable-level timing, supports Lead + Background vocal groups, RTL, romanization overlays.

**State / storage** (`src/utils/storage.ts`)
Two hot keys (`currentlyFetching`, `currentLyricsData`) are kept in module-level variables for perf; everything else is stored in `Spicetify.LocalStorage` under the `SpicyLyrics-` prefix.

**Global singleton** (`src/components/Global/Global.ts`)
Thin wrapper around `window._spicy_lyrics` for cross-module scope sharing and a custom event bus (`EventManager`).

**Dynamic background** (`src/components/DynamicBG/`)
Uses `@kawarp/core` (WebGL canvas warping) to render album art as an animated background. Artist header images are fetched separately and cached.

**Settings** (`src/utils/settings.ts`)
Uses a vendored/edited `spcr-settings` package (`src/edited_packages/spcr-settings/`) to register Spicetify Profiles settings sections.

**CLI sync** (`src/components/cli-sync/`)
An in-development feature (currently commented out in `app.tsx`) for socket.io-based communication with a local CLI tool on port `29858`.

### Key globals / types

- `Spicetify` — the Spotify client API, typed in `src/types/spicetify.d.ts`.
- `window._spicy_lyrics` — extension's own global scope, managed through `Global.SetScope` / `Global.GetScope`.
- The `PageContainer` DOM element (from `src/components/Pages/PageView.ts`) is the root mount point for lyrics rendering.

### Package notes

- `@spikerko/tools` and `@spikerko/web-modules` are JSR packages aliased via npm.
- Dynamic packages (`pinyin`, `aromanize`, `GreekRomanization`) are loaded at runtime via `src/utils/ImportPackage.ts` and cached in `src/packages/`.
- TypeScript is strict-null-checks **off** — `null`/`undefined` checks are done manually throughout.
