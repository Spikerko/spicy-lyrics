# CLAUDE.md

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

## Architecture

This is a **Spicetify extension** (not a standalone web app). It runs inside the Spotify desktop client and depends on `window.Spicetify.*` globals being available at runtime. The build tool is `@spicemod/creator` (spicetify-creator), configured in `spice.config.ts`.

## Experiments

User-facing feature flags, shown in Settings → Experiments. Use one whenever a change alters existing behaviour enough that someone might want the old way back.

**Adding one:** append an entry to `EXPERIMENTS` in `src/utils/experiments.ts`. That is the entire registration — the persisted store, the settings row, and the search integration are all derived from it. Do not add anything to `stores.ts`, the settings panel, or the migration list.

```ts
{
  id: "myExperiment",            // stable; persisted as "experiment:myExperiment"
  label: "My Experiment",
  description: "What it changes, and what turning it off restores.",
  default: true,
  pageClass: "Exp_MyExperiment", // optional
  rebuildsNowBar: true,          // optional
}
```

**Implementing one — prefer CSS.** Set `pageClass` and the class is kept in sync on `#SpicyLyricsPage`; write the new look under `#SpicyLyricsPage.Exp_Foo` and the old under `#SpicyLyricsPage:not(.Exp_Foo)`. Toggling is then free and needs no JS.

Only when the *markup* differs (CSS alone can't get you there) read the flag in TS:

```ts
import { isExperimentEnabled } from "../../utils/experiments.ts";
const enabled = isExperimentEnabled("myExperiment"); // id is type-checked
```

Read it once at build time and set `rebuildsNowBar: true` so the fullscreen overlay is torn down and rebuilt when the flag flips — otherwise the toggle won't take effect until the view is reopened. In React, use `useStore($experiment("myExperiment"))`.

**Rules:** `id` is permanent once shipped (it is the storage key). Both states must work — "off" restores the previous behaviour in full, not an approximation. `default: true` for a change you intend to become the norm; `false` for genuinely unfinished work.

`src/utils/experiments.ts` has the full contract in its header comment. `newProgressBarStyling` (the glass progress/volume bars) is the reference implementation — a pure `pageClass` switch, with both skins living side by side in `ContentBox.css`.