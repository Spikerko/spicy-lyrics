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