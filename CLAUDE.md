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

## Consulting the advisor

When an `advisor` tool is available (a stronger reviewer model), use it as a second opinion instead of guessing. It takes no input and has no tools: it sees only this conversation (this file, every tool call and result so far). It can only judge what you've actually read or run, so get the real evidence into the transcript first, not your recollection of it.

Skip it for routine work: small fixes, renames, copy changes, factual lookups, or a short task where the next step is dictated by the tool output you just read. A typical non-trivial task needs two or three calls, not one per step. UI work is never routine, however small (see below).

**UI and visual changes always go through the advisor.** The advisor is the stronger judge of visual design, so any change someone will see on screen (new elements, styling, spacing, type, motion) follows this loop:
1. Before the first edit: read the surrounding CSS/markup, get a screenshot of the current state into the transcript (CDP capture, then Read the PNG), and ask for the design direction.
2. After implementing: screenshot the rendered result in every state it affects (end-aligned / opposite lines, narrow views like the sidebar card and popup, a bright cover), Read each PNG, and ask for a critique of how it looks, not just whether it works. Computed sizes and a passing probe aren't a visual review.
3. Repeat step 2 after each visual revision until the advisor has no remaining concerns.
4. Check computed styles over CDP after each edit. Broad `!important` rules in the lyrics CSS (e.g. the 700 weight on everything inside `.LyricsContent`) silently override new declarations.

Call it when you're **unsure**:
- Two or more approaches look reasonable and the choice matters.
- You can't tell why something behaves the way it does, or evidence points in different directions.
- You're stuck: the same error keeps coming back, a fix isn't converging, or a CDP probe gives results that don't fit.
- You're about to abandon your current approach for a different one.

Call it before a **big action**:
- Changes that touch many files, rewrite a subsystem, or change a public surface (experiment ids, stored keys, edge lookup names, remote config shape, hooks partner plugins rely on).
- Performance-sensitive CSS or frame-loop changes (selectors with `:has()`, container query units, anything that runs every frame).
- Anything hard to undo: deleting files or large blocks of code, destructive git operations, migrations of persisted data.

How to use it:
- Orient first (read the relevant files, check the current state, run a probe if one settles a question), then call it before the first edit. A call made before you've looked at anything gets generic advice.
- When planning, call it before writing the plan or todo list, so its advice shapes the plan.
- Before calling the work done, make it durable (edits saved, typecheck/probe output in the transcript), then call it once more.
- Weigh the advice seriously. Adapt only if following it fails, or a primary source (the file's contents, a probe result) contradicts a specific claim. A passing check isn't proof the advice is wrong; it may not test what the advice is about.
- If you'd already found evidence pointing one way and the advice points another, don't silently switch. Make one more call that names the conflict: "I found X, you suggest Y, which constraint breaks the tie?"

## Comments

This repo is public. Comments, commit messages, experiment descriptions and docs say what the code does and why, never where the idea or implementation came from: no "as in <project>", "like <product>", "based on...", "inspired by...", "ported from...", and no naming of other projects or the references used to build something. This holds even when a feature was modelled on one. Names that are part of real behaviour (a lyrics provider's display name, a CSS variable another project reads) are fine.

## Experiments

User-facing feature flags, shown in Settings → Experiments. Use one whenever a change alters existing behaviour enough that someone might want the old way back.

**Adding one:** append an entry to `EXPERIMENTS` in `src/utils/experiments.ts`. That is the entire registration — the persisted store, the settings row, and the search integration are all derived from it. Do not add anything to `stores.ts`, the settings panel, or the migration list.

```ts
{
  id: "myExperiment",            // stable; persisted as "experiment:myExperiment"
  category: "lyrics",            // required: "lyrics" | "background" | "player", its heading in the tab
  label: "My Experiment",
  description: "What it changes, and what turning it off restores.",
  default: true,
  pageClass: "Exp_MyExperiment", // optional
  rebuildsNowBar: true,          // optional
  forceState: true,              // optional — true locks it on, false locks it off
  hidden: true,                  // optional — hides the row; never affects the value
}
```

`forceState` overrides the user's choice: the row stays visible in the panel with a locked toggle and a "Forced on/off" tag. Their saved value is preserved underneath, so removing `forceState` restores it.

**Remote overrides:** the `experimentsState` [edge lookup](#edge-service) returns `[{ id, ...fields }]`, and any field except `id` is laid over the local entry (`default`, `forceState`, `hidden`, `label`, …). It's fetched at startup, every `experimentsSync.intervalMs` (remote config, 60 s by default), and whenever the Experiments tab in Settings opens; while any fetch is in flight the experiment toggles (in the tab and in search results) are frozen and the tab shows a loader (held ≥350 ms so fast answers don't flicker; a fetch times out at `experimentsSync.timeoutMs`, 5 s by default). Unknown ids are ignored, so the server can't add experiments. A remote `default` only reaches users who never toggled that experiment. Read experiment metadata through `getExperiment()` / `getExperiments()` rather than `EXPERIMENTS` directly, or overrides won't apply.

**Implementing one — prefer CSS.** Set `pageClass` and the class is kept in sync on `#SpicyLyricsPage`; write the new look under `#SpicyLyricsPage.Exp_Foo` and the old under `#SpicyLyricsPage:not(.Exp_Foo)`. Toggling is then free and needs no JS.

Only when the *markup* differs (CSS alone can't get you there) read the flag in TS:

```ts
import { isExperimentEnabled } from "../../utils/experiments.ts";
const enabled = isExperimentEnabled("myExperiment"); // id is type-checked
```

Read it once at build time and set `rebuildsNowBar: true` so the fullscreen overlay is torn down and rebuilt when the flag flips — otherwise the toggle won't take effect until the view is reopened. In React, use `useStore($experiment("myExperiment"))`.

**Rules:** `id` is permanent once shipped (it is the storage key). Both states must work — "off" restores the previous behaviour in full, not an approximation. `default: true` for a change you intend to become the norm; `false` for genuinely unfinished work.

`src/utils/experiments.ts` has the full contract in its header comment. `newProgressBarStyling` (the glass progress/volume bars) is the reference implementation — a pure `pageClass` switch, with both skins living side by side in `ContentBox.css`.

## Edge service

`https://api.spicylyrics.org/bp/svc?selector=<name>` serves small, frequently polled data outside `/query`, so it never counts against the batched API or its circuit breaker. Current lookups: `config` (remote config), `experimentsState` (experiment overrides) and `version` (latest version per branch, JSON `{ product, branches: [{ tag, version }] }`; the client reads the `public` tag).

Always call it through `EdgeLookup(name, { timeoutMs })` in `src/utils/API/EdgeService.ts`, never with a hand-built URL, so the transport can change in one place. It sends the request uncached with the timeout and resolves with the raw `Response` whatever the status (it rejects only on network failure or timeout), so the caller checks `res.ok` and parses the body.

Every lookup except `config` needs a token from `/bp/init`. `EdgeLookup` handles it all: one shared init for concurrent callers, a refresh before expiry, one re-init and retry on a 401, and the whole thing inside the caller's `timeoutMs`. A failed init response is returned in place of the lookup's. `config` is sent without a token (`TOKENLESS_LOOKUPS`) so it never depends on init; changing that set needs the matching server change.

**Adding a lookup:** add its name to `EdgeLookupName`, and read the timeout from the remote config at the call site. Every lookup sends a `SpicyLyrics-Version` header. `EdgeService.ts` must not import anything from `src/` (its only import is the dependency-free `project/config.ts`), because `remoteConfig.ts` depends on it.

## Remote config

Request cadence, timeouts, backoff, the circuit breaker and cache TTLs are tuned server-side from the `config` [edge lookup](#edge-service). It is fetched at boot, every `remoteConfig.intervalMs` (15 s by default), on window focus and when the network comes back. It bypasses `Query()` and the breaker on purpose.

`src/utils/remoteConfig.ts` holds the compiled defaults (`DEFAULT_REMOTE_CONFIG`, which also defines the shape). Served values are trusted, with no range limits. A key falls back to its default only when the client can't run on it: missing, wrong type, negative, or an empty `ladderMs`. The rest of the payload still applies. Numbers are capped at the `setTimeout` maximum, and `remoteConfig.timeoutMs` / `intervalMs` have a 1 s floor so a bad push can't stop config fetches for good. Other self-rescheduling poll intervals (`POLL_INTERVALS`: `experimentsSync.intervalMs`, `updates.checkIntervalMs`) get the same floor so a 0 can't become a request loop; add a new poll loop's interval there. The last payload is persisted and loaded synchronously at import.

**Adding a value:** add it to `DEFAULT_REMOTE_CONFIG`. Then read `getRemoteConfig().group.key` **at the point of use**, never into a module-level `const`, or pushed changes won't reach it. For an `ExpireStore` TTL, pass a `get Duration()` getter. Use `onRemoteConfigChange` only when existing state has to react, as the breaker does with its open window. Debug surface: `window.SpicyLyrics.request.remoteConfig` (`get`, `refresh`, `sanitize`, `check`, `defaults`); logs go to the console under `(Remote Config)`.

## Testing changes in development
Check if 127.0.0.1 port 8088 is running Spotify's chromium debugger. If it is, use that for testing changed features. You should do this automatically, don't ask for the user to do so unless they explicitly opted out in their message.