const API_HOST = "api.spicylyrics.org";
const STORAGE_BASE_URL = "https://public.storage.spicylyrics.org/spicy-lyrics";
const STATUS_URL = "https://status.spicylyrics.org";
const DISCORD_URL = "https://discord.com/invite/uqgXU5wh8j";
const STATUS_API_URL = "https://uptimeapi.edgeprocessor.spicylyrics.org";
const OBJPACK_URL = "https://cdn.jsdelivr.net/gh/Spikerko/spicy-lyrics@main/builds/main/sjobjpack.js";
const LOG_PREFIX = "[Spicy Lyrics] [Entry]";

const REQUEST_TIMEOUT_MS = 5000;
const VERSION_ATTEMPTS = 5;
const IMPORT_ATTEMPTS = 3;
const SPICETIFY_SLOW_MS = 60000;
const BACKGROUND_RETRY_MS = 60000;
const BACKGROUND_VERSION_ATTEMPTS = 2;
const FIX_CHECK_MS = 180000;
const TOAST_MS = 3000;
const VERSION_PATTERN = /^[0-9A-Za-z.+-]+$/;

// Browsers report a network failure of import() as a TypeError with these messages.
// Anything else means the module downloaded and threw while evaluating.
const MODULE_FETCH_FAILURE = /dynamically imported module|importing a module script failed/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const backoff = (attempt) => Math.min(500 * 2 ** attempt, 8000);

const withRetries = async (attempts, task, shouldRetry = () => true) => {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(backoff(attempt - 1));
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error)) break;
    }
  }
  throw lastError;
};

const isModuleFetchFailure = (error) =>
  error instanceof TypeError && MODULE_FETCH_FAILURE.test(error.message);

const describeError = (error) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const isSpicetifyReady = () => {
  const spicetify = window.Spicetify;
  return Boolean(spicetify?.React && spicetify.ReactDOM && spicetify.ReactDOMServer);
};

// Resolves with the slow-start notice if one went up, so the load that follows can report back to it.
const waitForSpicetify = () =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    let slowNotice = null;
    const check = () => {
      if (isSpicetifyReady()) {
        resolve(slowNotice);
        return;
      }
      if (!slowNotice && Date.now() - startedAt > SPICETIFY_SLOW_MS) {
        slowNotice = startSpicetifyWait();
      }
      setTimeout(check, 50);
    };
    check();
  });

const fetchVersion = async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://${API_HOST}/version`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Version request failed with HTTP ${response.status}`);
    const version = (await response.text()).trim();
    if (!VERSION_PATTERN.test(version)) {
      throw new Error(`Unexpected version response: ${JSON.stringify(version.slice(0, 40))}`);
    }
    return version;
  } finally {
    clearTimeout(timer);
  }
};

// Chromium remembers a failed module fetch per URL, so every retry needs a URL it hasn't seen.
let importCount = 0;

const importExtension = (version) => {
  window._spicy_lyrics_metadata = { LoadedVersion: version };
  const url = `${STORAGE_BASE_URL}${encodeURIComponent(`@${version}.mjs`)}`;
  return withRetries(
    IMPORT_ATTEMPTS,
    () => {
      const attempt = importCount++;
      return import(attempt === 0 ? url : `${url}?retry=${attempt}`);
    },
    isModuleFetchFailure,
  );
};

const attemptLoad = async (versionAttempts = VERSION_ATTEMPTS) => {
  let version;
  try {
    version = await withRetries(versionAttempts, fetchVersion);
  } catch (error) {
    console.error(`${LOG_PREFIX} Couldn't fetch the current version:`, error);
    return { ok: false, kind: "connection", error };
  }

  try {
    await importExtension(version);
    return { ok: true };
  } catch (error) {
    console.error(`${LOG_PREFIX} Couldn't load version ${version}:`, error);
    return { ok: false, kind: isModuleFetchFailure(error) ? "connection" : "startup", error, version };
  }
};

// The status API speaks objpack both ways: opts go up packed, and the reply is [packed, -3, timestamp].
const fetchApiStatus = async () => {
  const { SLObjPack } = await import(`${OBJPACK_URL}?t=${Date.now()}`);
  const pack = new SLObjPack();
  const params = new URLSearchParams({
    resolver: "ServiceStatus",
    opts: JSON.stringify(pack.pack({ bm: "api" })),
  });
  let response;
  try {
    response = await fetch(`${STATUS_API_URL}/provider/forward?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Reaching here means jsDelivr answered but our status service didn't, which isolates the user's side.
    if (error instanceof TypeError) return "unreachable";
    throw error;
  }
  if (!response.ok) throw new Error(`Status request failed with HTTP ${response.status}`);
  const [payload] = await response.json();
  const monitors = pack.unpack(payload)?.r?.c;
  const api = Array.isArray(monitors) ? monitors.find((monitor) => monitor?.vn === "api") : null;
  return typeof api?.vs === "string" ? api.vs : null;
};

// These mean the outage is on our side, so background retries leave the API alone until they clear.
const OUTAGE_STATUSES = new Set(["down", "maintenance", "validating"]);
const OUTAGE_LABELS = { down: "API down", maintenance: "Maintenance", validating: "Recovering" };

// Keyed by BetterStack monitor status. "paused" and "pending" say nothing about an outage, so they get no line.
const API_STATUS_NOTES = {
  up: "Our API is up right now, so something between you and our servers is probably blocking it, like a VPN, firewall, or ad blocker.",
  down: "Our API is down right now. Spicy Lyrics will load once it's back, so try again in a few minutes.",
  validating: "Our API is recovering from an outage. Try again in a minute.",
  maintenance: "Our API is down for scheduled maintenance. Try again once it's over.",
  unreachable: "Our status service didn't answer either, so your internet connection is the likely cause.",
};

// Same outlines as BrandSvg.tsx in the web client, which this file can't import.
const BRAND_MARK_PATHS = [
  "M18.9962 5.00357C18.5208 4.52802 17.9233 4.19298 17.2696 4.03541C16.6159 3.87784 15.9313 3.90387 15.2915 4.11061C14.6516 4.31735 14.0813 4.69678 13.6433 5.20705C13.2054 5.71733 12.9169 6.33862 12.8097 7.00242L16.9973 11.1897C17.6611 11.0825 18.2824 10.794 18.7927 10.3561C19.303 9.91824 19.6825 9.34793 19.8893 8.7081C20.096 8.06827 20.122 7.38377 19.9645 6.73009C19.8069 6.07641 19.4718 5.47894 18.9962 5.00357ZM15.2227 12.153L11.845 8.77431C10.4947 10.3119 9.14443 11.8495 7.79421 13.3871L4.34436 17.3139C4.06732 17.6308 3.92106 18.0412 3.93518 18.4618C3.94929 18.8825 4.12273 19.2821 4.42039 19.5798C4.71804 19.8774 5.11767 20.0508 5.53838 20.0649C5.9591 20.0791 6.36945 19.9328 6.68639 19.6558L10.6328 16.1894L15.224 12.1543L15.2227 12.153ZM10.8636 6.96374C10.9806 5.9186 11.3904 4.92775 12.0457 4.10518C12.701 3.28261 13.5752 2.66176 14.5678 2.31407C15.5604 1.96638 16.631 1.90598 17.6564 2.13981C18.6818 2.37365 19.6203 2.89222 20.364 3.63586C21.1077 4.3795 21.6263 5.31798 21.8602 6.34331C22.094 7.36865 22.0336 8.43917 21.6859 9.43169C21.3382 10.4242 20.7173 11.2984 19.8947 11.9537C19.0721 12.6089 18.0811 13.0187 17.0359 13.1357L11.9108 17.6402L7.96445 21.1079C7.27835 21.7096 6.38902 22.0279 5.47687 21.9981C4.56473 21.9683 3.69808 21.5926 3.05275 20.9473C2.40742 20.302 2.03174 19.4354 2.00192 18.5234C1.97211 17.6113 2.29039 16.722 2.8922 16.0359L6.34334 12.1092L10.8636 6.96374Z",
  "M8.35932 0.380176C8.40765 0.249583 8.59235 0.249583 8.64068 0.380176L9.15129 1.76009C9.16648 1.80114 9.19886 1.83352 9.23991 1.84871L10.6198 2.35932C10.7504 2.40765 10.7504 2.59235 10.6198 2.64068L9.23991 3.15129C9.19886 3.16648 9.16648 3.19886 9.15129 3.23991L8.64068 4.61982C8.59235 4.75042 8.40765 4.75042 8.35932 4.61982L7.84871 3.23991C7.83352 3.19886 7.80114 3.16648 7.76009 3.15129L6.38018 2.64068C6.24958 2.59235 6.24958 2.40765 6.38018 2.35932L7.76009 1.84871C7.80114 1.83352 7.83352 1.80114 7.84871 1.76009L8.35932 0.380176Z",
  "M19.8593 14.3802C19.9076 14.2496 20.0924 14.2496 20.1407 14.3802L21.0564 16.855C21.0716 16.896 21.104 16.9284 21.145 16.9436L23.6198 17.8593C23.7504 17.9076 23.7504 18.0924 23.6198 18.1407L21.145 19.0564C21.104 19.0716 21.0716 19.104 21.0564 19.145L20.1407 21.6198C20.0924 21.7504 19.9076 21.7504 19.8593 21.6198L18.9436 19.145C18.9284 19.104 18.896 19.0716 18.855 19.0564L16.3802 18.1407C16.2496 18.0924 16.2496 17.9076 16.3802 17.8593L18.855 16.9436C18.896 16.9284 18.9284 16.896 18.9436 16.855L19.8593 14.3802Z",
  "M13.3593 18.3802C13.4076 18.2496 13.5924 18.2496 13.6407 18.3802L14.1513 19.7601C14.1665 19.8011 14.1989 19.8335 14.2399 19.8487L15.6198 20.3593C15.7504 20.4076 15.7504 20.5924 15.6198 20.6407L14.2399 21.1513C14.1989 21.1665 14.1665 21.1989 14.1513 21.2399L13.6407 22.6198C13.5924 22.7504 13.4076 22.7504 13.3593 22.6198L12.8487 21.2399C12.8335 21.1989 12.8011 21.1665 12.7601 21.1513L11.3802 20.6407C11.2496 20.5924 11.2496 20.4076 11.3802 20.3593L12.7601 19.8487C12.8011 19.8335 12.8335 19.8011 12.8487 19.7601L13.3593 18.3802Z",
  "M3.85932 3.38018C3.90765 3.24958 4.09235 3.24958 4.14068 3.38018L5.05643 5.85495C5.07162 5.89601 5.10399 5.92838 5.14505 5.94357L7.61982 6.85932C7.75042 6.90765 7.75042 7.09235 7.61982 7.14068L5.14505 8.05643C5.10399 8.07162 5.07162 8.10399 5.05643 8.14505L4.14068 10.6198C4.09235 10.7504 3.90765 10.7504 3.85932 10.6198L2.94357 8.14505C2.92838 8.10399 2.89601 8.07162 2.85495 8.05643L0.380176 7.14068C0.249583 7.09235 0.249583 6.90765 0.380176 6.85932L2.85495 5.94357C2.89601 5.92838 2.92838 5.89601 2.94357 5.85495L3.85932 3.38018Z",
];

// The extension's stylesheet never loads when this file has to show a popup, so the
// dialog carries its own copy of the web client's stats hero: band ramp, cropped mark, ink.
const POPUP_STYLES = `
.sle-overlay {
  --sle-ease: cubic-bezier(0.23, 1, 0.32, 1);
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 16px;
  background-color: rgba(0, 0, 0, 0);
  -webkit-backdrop-filter: blur(0px);
  backdrop-filter: blur(0px);
  font-family: var(--encore-body-font-stack, var(--fallback-fonts, sans-serif));
  -webkit-font-smoothing: antialiased;
  transition:
    background-color 0.22s var(--sle-ease),
    -webkit-backdrop-filter 0.22s var(--sle-ease),
    backdrop-filter 0.22s var(--sle-ease);
}
.sle-overlay.is-open {
  background-color: rgba(0, 0, 0, 0.55);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
.sle-overlay--swap {
  transition: none;
}
.sle-overlay.is-closing,
.sle-overlay.is-closing .sle-dialog {
  transition-duration: 0.16s;
  transition-timing-function: cubic-bezier(0.4, 0, 1, 1);
}
.sle-overlay.is-closing {
  pointer-events: none;
}
.sle-dialog,
.sle-pill {
  --sle-field: oklch(0.30 0.095 297);
  --sle-field-deep: oklch(0.235 0.08 297);
  --sle-tint: oklch(0.435 0.105 297);
  --sle-ink: oklch(0.87 0.08 297);
  --sle-ink-muted: oklch(0.775 0.058 297);
  --sle-cta: oklch(0.955 0.022 297);
  --sle-cta-ink: oklch(0.25 0.09 297);
}
.sle-dialog.sle-tone-red,
.sle-pill.sle-tone-red {
  --sle-field: oklch(0.315 0.092 20);
  --sle-field-deep: oklch(0.245 0.075 20);
  --sle-tint: oklch(0.445 0.10 20);
  --sle-ink: oklch(0.875 0.068 22);
  --sle-ink-muted: oklch(0.78 0.05 22);
  --sle-cta: oklch(0.958 0.018 22);
  --sle-cta-ink: oklch(0.26 0.09 20);
}
.sle-dialog {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
  width: min(30rem, 100%);
  max-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 28px;
  border: 1px solid color-mix(in oklab, var(--sle-ink) 16%, transparent);
  border-radius: 16px;
  outline: none;
  background-color: var(--sle-field);
  background-image: linear-gradient(165deg, var(--sle-field) 0%, var(--sle-field-deep) 100%);
  box-shadow:
    inset 0 1px 0 color-mix(in oklab, var(--sle-ink) 22%, transparent),
    0 20px 48px -20px rgba(0, 0, 0, 0.55);
  color: var(--sle-ink);
  opacity: 0;
  transform: scale(0.96);
  transition:
    opacity 0.22s var(--sle-ease),
    transform 0.22s var(--sle-ease);
}
.sle-overlay.is-open .sle-dialog {
  opacity: 1;
  transform: scale(1);
}
.sle-dialog > :not(.sle-mark) {
  transition:
    opacity 0.36s var(--sle-ease),
    transform 0.46s var(--sle-ease);
  transition-delay: calc(60ms + var(--sle-i, 0) * 35ms);
}
.sle-overlay:not(.is-open):not(.is-closing) .sle-dialog > :not(.sle-mark) {
  opacity: 0;
  transform: translateY(8px);
}
.sle-mark {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.sle-mark > svg {
  position: absolute;
  top: -26%;
  right: -20%;
  width: 72%;
  color: var(--sle-tint);
  opacity: 0.55;
  transform: rotate(-24deg);
  transition: transform 0.7s var(--sle-ease);
}
.sle-overlay.is-open .sle-mark > svg {
  transform: rotate(-14deg);
}
.sle-heading {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 2px;
}
.sle-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--sle-ink-muted);
}
.sle-brand > svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.sle-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--sle-ink);
}
.sle-text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--sle-ink-muted);
}
.sle-text--quiet {
  font-size: 0.82rem;
}
.sle-detail {
  margin: 2px 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--sle-ink) 9%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--sle-ink) 14%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--sle-ink);
  overflow-wrap: anywhere;
  user-select: text;
}
.sle-server,
.sle-progress {
  box-sizing: border-box;
  overflow: hidden;
}
.sle-server[hidden],
.sle-progress[hidden] {
  display: none;
}
.sle-line-text {
  display: block;
}
.sle-server {
  margin: 2px 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: color-mix(in oklab, var(--sle-ink) 9%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--sle-ink) 14%, transparent);
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.45;
  color: var(--sle-ink);
}
.sle-server[data-state="checking"] {
  font-weight: 400;
  color: var(--sle-ink-muted);
}
/* A highlight sweeps across the text while the check is in flight, and stops as soon as it answers. */
.sle-server[data-state="checking"] .sle-line-text {
  background: linear-gradient(
      90deg,
      var(--sle-ink-muted) 40%,
      var(--sle-cta) 50%,
      var(--sle-ink-muted) 60%
    )
    100% 0 / 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: sle-shimmer 1.6s linear infinite;
}
@keyframes sle-shimmer {
  to {
    background-position: 0% 0;
  }
}
.sle-progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 8px 12px;
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--sle-ink-muted);
}
.sle-progress-time {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--sle-ink);
}
.sle-progress-bar {
  grid-column: 1 / -1;
  display: block;
  height: 3px;
  overflow: hidden;
  border-radius: 3px;
  background-color: color-mix(in oklab, var(--sle-ink) 16%, transparent);
}
.sle-progress-fill {
  display: block;
  height: 100%;
  background-color: var(--sle-cta);
  transform-origin: left center;
}
.sle-link {
  color: var(--sle-ink);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: color-mix(in oklab, var(--sle-ink) 45%, transparent);
  text-underline-offset: 2px;
  border-radius: 2px;
}
.sle-link:hover {
  text-decoration-color: currentColor;
}
.sle-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.sle-button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  overflow: hidden;
  white-space: nowrap;
  min-height: 44px;
  margin: 0;
  padding: 0 20px;
  border: 0;
  border-radius: 10px;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition:
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.12s ease;
}
.sle-button:active:not([aria-disabled="true"]) {
  transform: scale(0.97);
}
.sle-button--primary {
  background-color: var(--sle-cta);
  color: var(--sle-cta-ink);
}
.sle-button--primary:hover {
  background-color: #fff;
}
.sle-button--quiet {
  padding: 0 16px;
  background-color: transparent;
  color: var(--sle-ink-muted);
}
.sle-button--quiet:hover {
  background-color: color-mix(in oklab, var(--sle-ink) 12%, transparent);
  color: var(--sle-ink);
}
.sle-button[aria-disabled="true"] {
  cursor: progress;
  opacity: 0.85;
}
.sle-button-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.sle-spinner {
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  flex-shrink: 0;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: sle-spin 0.7s linear infinite;
}
@keyframes sle-spin {
  to {
    transform: rotate(360deg);
  }
}
.sle-button:focus-visible,
.sle-link:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--sle-ink) 70%, transparent);
  outline-offset: 3px;
}
.sle-pill {
  position: fixed;
  right: 16px;
  bottom: var(--sle-pill-bottom, 16px);
  z-index: 9998;
  display: flex;
  box-sizing: border-box;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  border: 1px solid color-mix(in oklab, var(--sle-ink) 16%, transparent);
  border-radius: 999px;
  background-color: var(--sle-field);
  background-image: linear-gradient(165deg, var(--sle-field) 0%, var(--sle-field-deep) 100%);
  box-shadow:
    inset 0 1px 0 color-mix(in oklab, var(--sle-ink) 22%, transparent),
    0 12px 32px -12px rgba(0, 0, 0, 0.6);
  color: var(--sle-ink);
  font-family: var(--encore-body-font-stack, var(--fallback-fonts, sans-serif));
  -webkit-font-smoothing: antialiased;
}
.sle-pill-main,
.sle-pill-stop {
  appearance: none;
  display: flex;
  align-items: center;
  min-height: 44px;
  margin: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition:
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.sle-pill-main {
  flex: 1 1 auto;
  min-width: 0;
  gap: 8px;
  padding: 0 14px 0 16px;
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
}
.sle-pill-main > svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--sle-ink-muted);
}
.sle-pill-main:hover:not([aria-disabled="true"]),
.sle-pill-stop:hover {
  background-color: color-mix(in oklab, var(--sle-ink) 10%, transparent);
}
.sle-pill-main[aria-disabled="true"] {
  cursor: default;
}
.sle-pill-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sle-pill-time {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--sle-ink-muted);
}
.sle-pill-time::before {
  content: "\\00B7";
  margin-right: 8px;
}
.sle-pill-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.sle-pill-indicator > svg {
  width: 16px;
  height: 16px;
}
.sle-pill-time[hidden],
.sle-pill-indicator[hidden],
.sle-pill-stop[hidden] {
  display: none;
}
.sle-pill-indicator > .sle-ring {
  width: 18px;
  height: 18px;
  transform: rotate(-90deg);
}
.sle-ring circle {
  fill: none;
  stroke-width: 2.5;
}
.sle-ring-track {
  stroke: color-mix(in oklab, var(--sle-ink) 22%, transparent);
}
.sle-ring-fill {
  stroke: var(--sle-cta);
  stroke-linecap: round;
}
.sle-pill-stop {
  flex-shrink: 0;
  justify-content: center;
  width: 44px;
  padding: 0;
  border-left: 1px solid color-mix(in oklab, var(--sle-ink) 14%, transparent);
  color: var(--sle-ink-muted);
}
.sle-pill-stop:hover {
  color: var(--sle-ink);
}
.sle-pill-stop > svg {
  width: 14px;
  height: 14px;
}
/* The pill clips its children, so focus rings sit inside the edge. */
.sle-pill-main:focus-visible,
.sle-pill-stop:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--sle-ink) 70%, transparent);
  outline-offset: -4px;
  border-radius: 999px;
}
.sle-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
@media (prefers-reduced-motion: reduce) {
  .sle-overlay,
  .sle-dialog,
  .sle-dialog > *,
  .sle-mark > svg {
    transition-duration: 0.01ms !important;
    transition-delay: 0s !important;
  }
  .sle-dialog,
  .sle-dialog > :not(.sle-mark) {
    transform: none !important;
  }
  .sle-server[data-state="checking"] .sle-line-text {
    animation: none;
    background: none;
    color: inherit;
  }
  .sle-spinner {
    animation-duration: 1.6s;
  }
}
`;

const ensurePopupStyles = () => {
  if (document.getElementById("spicy-lyrics-entry-styles")) return;
  const style = document.createElement("style");
  style.id = "spicy-lyrics-entry-styles";
  style.textContent = POPUP_STYLES;
  document.head.append(style);
};

const h = (tag, props, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
};

const svg = (tag, attributes, ...children) => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  node.append(...children);
  return node;
};

const brandMark = () =>
  svg(
    "svg",
    { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" },
    ...BRAND_MARK_PATHS.map((d) => svg("path", { d })),
  );

const icon = (d) =>
  svg(
    "svg",
    {
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    svg("path", { d }),
  );

const link = (href, label) => h("a", { class: "sle-link", href }, label);

const text = (...children) => h("p", { class: "sle-text" }, ...children);

const discordNote = (lead) =>
  h("p", { class: "sle-text sle-text--quiet" }, `${lead} `, link(DISCORD_URL, "Discord"), ".");

const reloadSpotify = () => window.location.reload();

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const LINE_ANIMATION = "sle-line";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const BOX_PROPS = ["paddingTop", "paddingBottom", "marginTop", "marginBottom"];

const boxFrame = (node) => {
  const style = getComputedStyle(node);
  const frame = { height: `${node.getBoundingClientRect().height}px`, opacity: style.opacity };
  for (const prop of BOX_PROPS) frame[prop] = style[prop];
  return frame;
};

// The dialog's flex gap still applies to a zero-height child, so a negative margin cancels it until [hidden] lands.
const collapsedFrame = (node) => ({
  height: "0px",
  opacity: 0,
  paddingTop: "0px",
  paddingBottom: "0px",
  marginTop: "0px",
  marginBottom: `-${getComputedStyle(node.parentElement).rowGap}`,
});

const setLineState = (node, state) => {
  if (state) node.dataset.state = state;
  else delete node.dataset.state;
};

// Lines grow, shrink, and cross-fade between messages instead of making the dialog jump.
const setLine = (node, text, state) => {
  const label = node.firstElementChild;
  if (label.textContent === text && (node.dataset.state ?? "") === (state ?? "") && node.hidden === !text) {
    return;
  }

  const animate = node.isConnected && !reducedMotion.matches;
  const from = animate ? (node.hidden ? collapsedFrame(node) : boxFrame(node)) : null;
  for (const animation of node.getAnimations({ subtree: true })) {
    if (animation.id === LINE_ANIMATION) animation.cancel();
  }

  if (!text) {
    const finish = () => {
      node.hidden = true;
      label.textContent = "";
      setLineState(node, state);
    };
    if (!animate || node.hidden) return finish();
    const collapse = node.animate([from, collapsedFrame(node)], {
      duration: 200,
      easing: EASE_OUT,
      fill: "forwards",
      id: LINE_ANIMATION,
    });
    collapse.onfinish = () => {
      finish();
      collapse.cancel();
    };
    return;
  }

  node.hidden = false;
  label.textContent = text;
  setLineState(node, state);
  if (!animate) return;

  node.animate([from, { ...boxFrame(node), opacity: 1 }], {
    duration: 320,
    easing: EASE_OUT,
    id: LINE_ANIMATION,
  });
  label.animate(
    [
      { opacity: 0, transform: "translateY(4px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 280, delay: 60, easing: EASE_OUT, fill: "backwards", id: LINE_ANIMATION },
  );
};

const line = (className, props = {}) =>
  h("p", { class: className, hidden: "", ...props }, h("span", { class: "sle-line-text" }));

// The button eases to its new width, so the button beside it slides rather than jumps.
const setButtonContent = (button, label, busy) => {
  const from = button.getBoundingClientRect().width;
  const content = h("span", { class: "sle-button-content" });
  if (busy) content.append(h("span", { class: "sle-spinner", "aria-hidden": "true" }));
  content.append(label);
  button.replaceChildren(content);
  if (!button.isConnected || reducedMotion.matches) return;

  const to = button.getBoundingClientRect().width;
  if (from !== to) {
    button.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: 260, easing: EASE_OUT });
  }
  content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE_OUT });
};

const formatWait = (ms) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const RING_LENGTH = 2 * Math.PI * 7;
const RING_DRAIN = [{ strokeDashoffset: "0" }, { strokeDashoffset: `${RING_LENGTH}` }];
const BAR_DRAIN = [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }];

// A view that opens partway through a countdown picks it up where it stands.
const drain = (node, countdown, keyframes) => {
  for (const animation of node.getAnimations()) animation.cancel();
  const duration = countdown.until - countdown.from;
  const animation = node.animate(keyframes, { duration, fill: "forwards" });
  animation.currentTime = Math.min(Date.now() - countdown.from, duration);
};

const centerOf = (rect, width = rect.width) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
  width,
});

// A uniform scale keeps the text in proportion while the dialog flies to or from the pill.
const towards = (from, to) =>
  `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.width / from.width})`;

const progressLine = () => {
  const time = h("span", { class: "sle-progress-time" });
  const fill = h("span", { class: "sle-progress-fill" });
  const node = h(
    "div",
    { class: "sle-progress", hidden: "" },
    h("span", { class: "sle-line-text" }),
    time,
    h("span", { class: "sle-progress-bar", "aria-hidden": "true" }, fill),
  );
  let shown = null;

  const set = (message, countdown, running) => {
    setLine(node, countdown ? message : "");
    if (!countdown) return;
    time.textContent = running ? "Now" : formatWait(countdown.until - Date.now());
    if (shown !== countdown) {
      shown = countdown;
      drain(fill, countdown, BAR_DRAIN);
    }
  };

  return { node, set };
};

let activePopup = null;

// tone: "lavender" while waiting on something outside the extension, "red" when its own code failed.
const showPopup = ({ tone = "lavender", title, content, primary, secondary, onDismiss, onRender, origin }) => {
  const swapping = activePopup !== null;
  activePopup?.close({ immediate: true });
  ensurePopupStyles();

  const secondaryButton = h("button", { class: "sle-button sle-button--quiet", type: "button" }, secondary);
  const primaryButton = h("button", { class: "sle-button sle-button--primary", type: "button" });
  setButtonContent(primaryButton, primary.label, false);
  const dialog = h(
    "div",
    {
      class: `sle-dialog sle-tone-${tone}`,
      role: "alertdialog",
      "aria-modal": "true",
      "aria-labelledby": "sle-brand sle-title",
      tabindex: "-1",
    },
    h("div", { class: "sle-mark" }, brandMark()),
    h(
      "div",
      { class: "sle-heading" },
      h("p", { class: "sle-brand", id: "sle-brand" }, brandMark(), "Spicy Lyrics"),
      h("h2", { class: "sle-title", id: "sle-title" }, title),
    ),
    ...content,
    h("div", { class: "sle-actions" }, secondaryButton, primaryButton),
  );
  // One popup replacing another keeps the backdrop in place, so only the dialog animates.
  const overlay = h("div", { class: swapping ? "sle-overlay sle-overlay--swap" : "sle-overlay" }, dialog);
  const previousFocus = document.activeElement;
  let closed = false;
  let busy = false;

  [...dialog.children]
    .filter((child) => !child.classList.contains("sle-mark"))
    .forEach((child, index) => child.style.setProperty("--sle-i", index));

  // to: a box the dialog shrinks into. focus: where focus follows it, instead of back to where it was.
  const close = ({ immediate = false, to = null, focus = null } = {}) => {
    if (closed) return;
    closed = true;
    if (activePopup === popup) activePopup = null;
    if (overlay.contains(document.activeElement)) {
      const target = focus ?? (previousFocus instanceof HTMLElement && previousFocus.isConnected ? previousFocus : null);
      target?.focus({ preventScroll: true });
    }
    if (immediate) {
      overlay.remove();
      return;
    }
    overlay.classList.add("is-closing");
    overlay.classList.remove("is-open");
    if (!to || reducedMotion.matches) {
      setTimeout(() => overlay.remove(), 200);
      return;
    }
    const flight = dialog.animate(
      [
        { transform: "none", opacity: 1 },
        { opacity: 1, offset: 0.3 },
        { transform: towards(centerOf(dialog.getBoundingClientRect()), centerOf(to)), opacity: 0 },
      ],
      { duration: 380, easing: "cubic-bezier(0.5, 0, 0.2, 1)", fill: "forwards" },
    );
    flight.onfinish = () => overlay.remove();
  };

  // aria-disabled instead of disabled, so the focused button keeps focus while busy.
  const setBusy = (next) => {
    if (next === busy || closed) return;
    busy = next;
    if (busy) primaryButton.setAttribute("aria-disabled", "true");
    else primaryButton.removeAttribute("aria-disabled");
    setButtonContent(primaryButton, busy ? (primary.busyLabel ?? primary.label) : primary.label, busy);
  };

  const popup = { close, setBusy };

  secondaryButton.addEventListener("click", () => onDismiss());
  primaryButton.addEventListener("click", () => {
    if (!busy && !closed) primary.action();
  });

  // Only a press that starts and ends on the backdrop dismisses, so selecting
  // the error text and releasing outside the dialog doesn't.
  let pressedBackdrop = false;
  overlay.addEventListener("pointerdown", (event) => {
    pressedBackdrop = event.target === overlay;
  });
  overlay.addEventListener("click", (event) => {
    if (pressedBackdrop && event.target === overlay) onDismiss();
  });

  // Stopping propagation keeps Spotify's own Escape shortcut from also firing.
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("a[href], button")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !focusable.includes(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !focusable.includes(current))) {
      event.preventDefault();
      first.focus();
    }
  });

  onRender?.(popup);
  document.body.append(overlay);
  overlay.getBoundingClientRect();
  overlay.classList.add("is-open");
  if (swapping) {
    overlay.getBoundingClientRect();
    overlay.classList.remove("sle-overlay--swap");
  }
  if (origin && !reducedMotion.matches) {
    const from = centerOf(dialog.getBoundingClientRect(), dialog.offsetWidth);
    dialog.animate(
      [
        { transform: towards(from, centerOf(origin)), opacity: 0 },
        { opacity: 1, offset: 0.35 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 420, easing: EASE_OUT },
    );
  }
  primaryButton.focus({ preventScroll: true });

  activePopup = popup;
  return popup;
};

let pill = null;

// Sits just above Spotify's now-playing bar so it never covers the volume controls.
const placePill = () => {
  if (!pill) return;
  const bar = document.querySelector('.Root__now-playing-bar, [data-testid="now-playing-bar"]');
  const top = bar?.getBoundingClientRect().top ?? 0;
  const bottom = top > 0 && top < window.innerHeight ? window.innerHeight - top + 12 : 16;
  pill.root.style.setProperty("--sle-pill-bottom", `${Math.max(16, bottom)}px`);
};

const PILL_INDICATORS = {
  busy: () => h("span", { class: "sle-spinner" }),
  ring: () =>
    svg(
      "svg",
      { class: "sle-ring", viewBox: "0 0 18 18" },
      svg("circle", { class: "sle-ring-track", cx: "9", cy: "9", r: "7" }),
      svg("circle", { class: "sle-ring-fill", cx: "9", cy: "9", r: "7", "stroke-dasharray": `${RING_LENGTH}` }),
    ),
  done: () => icon("M3.5 8.5l3 3 6-7"),
};

const createPill = () => {
  const view = {
    label: h("span", { class: "sle-pill-label" }),
    time: h("span", { class: "sle-pill-time", hidden: "" }),
    indicator: h("span", { class: "sle-pill-indicator", "aria-hidden": "true", hidden: "" }),
    stop: h("button", { class: "sle-pill-stop", type: "button" }, icon("M4 4l8 8M12 4l-8 8")),
    announcer: h("span", { class: "sle-visually-hidden", role: "status" }),
    kind: "",
    countdown: null,
    state: {},
  };
  view.main = h("button", { class: "sle-pill-main", type: "button" }, brandMark(), view.label, view.time, view.indicator);
  view.root = h("div", { class: "sle-pill" }, view.main, view.stop, view.announcer);
  view.main.addEventListener("click", () => view.state.onOpen?.());
  view.stop.addEventListener("click", () => view.state.onStop?.());
  return view;
};

// state: { tone, label, countdown?, busy?, done?, stopLabel?, onOpen?, onStop? }. done turns it into a toast.
const showPill = (state, { delay = 0 } = {}) => {
  ensurePopupStyles();
  const animate = !reducedMotion.matches;
  const entering = !pill;
  if (entering) {
    pill = createPill();
    document.body.append(pill.root);
    placePill();
    window.addEventListener("resize", placePill);
  }
  const view = pill;
  const fromWidth = view.root.getBoundingClientRect().width;
  view.state = state;
  view.root.className = `sle-pill sle-tone-${state.tone}`;

  if (view.label.textContent !== state.label) {
    view.label.textContent = state.label;
    if (!entering && animate) {
      view.label.animate(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 240, easing: EASE_OUT },
      );
    }
  }

  const remaining = state.countdown && !state.busy ? formatWait(state.countdown.until - Date.now()) : "";
  view.time.textContent = remaining;
  view.time.hidden = !remaining;

  const kind = state.busy ? "busy" : state.countdown ? "ring" : state.done ? "done" : "";
  if (kind !== view.kind) {
    view.kind = kind;
    view.countdown = null;
    view.indicator.replaceChildren(...(kind ? [PILL_INDICATORS[kind]()] : []));
    view.indicator.hidden = !kind;
  }
  if (kind === "ring" && view.countdown !== state.countdown) {
    view.countdown = state.countdown;
    drain(view.indicator.querySelector(".sle-ring-fill"), state.countdown, RING_DRAIN);
  }

  view.stop.hidden = Boolean(state.done);
  view.stop.setAttribute("aria-label", state.stopLabel ?? "Dismiss");
  if (state.done) {
    view.main.setAttribute("aria-disabled", "true");
    view.main.setAttribute("aria-label", `Spicy Lyrics: ${state.label}`);
    view.announcer.textContent = state.label;
  } else {
    view.main.removeAttribute("aria-disabled");
    view.main.setAttribute("aria-label", `Spicy Lyrics: ${state.label}${remaining ? `, ${remaining}` : ""}. Show details`);
  }

  if (!animate) return;
  if (entering) {
    view.root.animate(
      [
        { opacity: 0, transform: "translateY(8px) scale(0.96)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 320, delay, easing: EASE_OUT, fill: "backwards" },
    );
    return;
  }
  const toWidth = view.root.getBoundingClientRect().width;
  if (Math.abs(toWidth - fromWidth) > 0.5) {
    view.root.animate([{ width: `${fromWidth}px` }, { width: `${toWidth}px` }], { duration: 280, easing: EASE_OUT });
  }
};

// Returns where the pill was, so a dialog opening from it can grow out of that spot.
const hidePill = () => {
  const view = pill;
  if (!view) return null;
  pill = null;
  window.removeEventListener("resize", placePill);
  const rect = view.root.getBoundingClientRect();
  view.root.style.pointerEvents = "none";
  if (reducedMotion.matches) {
    view.root.remove();
    return rect;
  }
  const exit = view.root.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "translateY(8px) scale(0.96)" },
    ],
    { duration: 180, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
  );
  exit.onfinish = () => view.root.remove();
  return rect;
};

const showToast = (message, tone) => {
  showPill({ tone, label: message, done: true });
  const view = pill;
  setTimeout(() => {
    if (pill === view && view.state.done) hidePill();
  }, TOAST_MS);
};

let activeTask = null;

// A task keeps working while its dialog is hidden: dismissing shrinks the dialog into the corner pill, which reopens it.
// Starting a task ends the previous one, and the new dialog takes over the old one's dialog or pill.
const createTask = ({ tone = "lavender", dialog, pill: pillState, stopLabel }) => {
  activeTask?.end();
  let popup = null;
  let render = null;
  const cleanups = [];

  const pillProps = () => ({ ...pillState(), tone, stopLabel, onOpen: task.open, onStop: task.stop });

  const task = {
    ended: false,
    view: null,
    onEnd: (cleanup) => cleanups.push(cleanup),
    update: () => {
      if (task.ended) return;
      if (task.view === "dialog") render?.(popup);
      else if (task.view === "pill") showPill(pillProps());
    },
    open: () => {
      if (task.ended || task.view === "dialog") return;
      const spec = dialog();
      render = spec.render;
      const origin = hidePill();
      showPopup({
        ...spec,
        tone,
        origin,
        onDismiss: task.minimize,
        onRender: (created) => {
          popup = created;
          task.view = "dialog";
          render?.(created);
        },
      });
    },
    minimize: () => {
      if (task.ended || task.view !== "dialog") return;
      task.view = "pill";
      showPill(pillProps(), { delay: 200 });
      popup.close({ to: pill.root.getBoundingClientRect(), focus: pill.main });
      popup = null;
    },
    finish: (message) => {
      if (task.ended) return;
      const view = task.view;
      task.end();
      if (view === "dialog") popup.close();
      if (message) showToast(message, tone);
      else if (view === "pill") hidePill();
    },
    stop: () => {
      if (task.ended) return;
      task.end();
      hidePill();
    },
    end: () => {
      if (task.ended) return;
      task.ended = true;
      for (const cleanup of cleanups) cleanup();
      if (activeTask === task) activeTask = null;
    },
  };

  const ticker = setInterval(task.update, 1000);
  task.onEnd(() => clearInterval(ticker));
  activeTask = task;
  return task;
};

const CHECKING_STATUS = "Checking our server status…";

// Background tries only ask the status API and skip the load while it reports an outage. "Try again" always loads.
const startReconnect = () => {
  let apiStatus = null;
  let checking = false;
  let loading = false;
  let current = null;
  let failed = false;
  let countdown = null;
  let timer = 0;

  const schedule = () => {
    const from = Date.now();
    countdown = { from, until: from + BACKGROUND_RETRY_MS };
    clearTimeout(timer);
    timer = setTimeout(() => cycle("auto"), BACKGROUND_RETRY_MS);
  };

  const checkStatus = async () => {
    checking = true;
    task.update();
    try {
      apiStatus = await fetchApiStatus();
    } catch (error) {
      apiStatus = null;
      console.warn(`${LOG_PREFIX} Couldn't check server status:`, error);
    }
    checking = false;
    task.update();
  };

  const load = async () => {
    loading = true;
    task.update();
    const result = await attemptLoad(BACKGROUND_VERSION_ATTEMPTS);
    loading = false;
    return result;
  };

  // mode: "status" only refreshes the server line, "auto" is a background try, "manual" is the button.
  const cycle = async (mode) => {
    if (task.ended) return;
    if (current) {
      // A press during a status check loads as soon as the check answers.
      if (mode === "manual" && current !== "manual") {
        current = "manual";
        clearTimeout(timer);
        task.update();
      }
      return;
    }
    current = mode;
    if (mode !== "status") clearTimeout(timer);
    const status = checkStatus();
    let pending = mode === "manual" ? load() : null;
    await status;
    if (!pending && (current === "manual" || (current === "auto" && !OUTAGE_STATUSES.has(apiStatus)))) {
      pending = load();
    }
    const result = await pending;
    const finished = current;
    current = null;
    if (task.ended) return;
    if (result?.ok) return task.finish("Spicy Lyrics is back");
    if (result?.kind === "startup") return startFixWatch(result);
    if (result) failed = true;
    if (finished !== "status") schedule();
    task.update();
  };

  const progressMessage = () => {
    if (OUTAGE_STATUSES.has(apiStatus)) return "Waiting for our API to come back before trying again.";
    if (failed) return "Still can't reach the servers. Trying again automatically.";
    return "Spicy Lyrics keeps trying in the background.";
  };

  const task = createTask({
    stopLabel: "Stop retrying",
    pill: () => {
      if (loading || current === "manual") return { label: "Connecting…", busy: true };
      if (checking) return { label: "Checking status…", busy: true };
      return { label: OUTAGE_LABELS[apiStatus] ?? "Reconnecting", countdown };
    },
    dialog: () => {
      const server = line("sle-server", { "aria-live": "polite" });
      const progress = progressLine();
      return {
        title: "Couldn't connect",
        content: [
          text(
            "The lyrics servers didn't answer after several tries. Check your internet connection, or see the ",
            link(STATUS_URL, "status page"),
            " for ongoing maintenance.",
          ),
          server,
          progress.node,
          discordNote("Still not working? Ask on our"),
        ],
        primary: { label: "Try again", busyLabel: "Connecting…", action: () => cycle("manual") },
        secondary: "Retry in background",
        render: (popup) => {
          setLine(
            server,
            checking ? CHECKING_STATUS : (API_STATUS_NOTES[apiStatus] ?? ""),
            checking ? "checking" : undefined,
          );
          progress.set(progressMessage(), countdown, current === "auto" || current === "manual");
          popup.setBusy(loading || current === "manual");
        },
      };
    },
  });

  const onOnline = () => cycle("auto");
  window.addEventListener("online", onOnline);
  task.onEnd(() => {
    clearTimeout(timer);
    window.removeEventListener("online", onOnline);
  });

  // The server line starts in its checking state, so it enters with the dialog instead of growing in after it.
  checking = true;
  schedule();
  task.open();
  cycle("status");
  return task;
};

// A crashed bundle won't fix itself, but a newer version might, so this watches for one.
const startFixWatch = ({ version, error }) => {
  let checking = false;
  let countdown = null;
  let timer = 0;

  const schedule = () => {
    const from = Date.now();
    countdown = { from, until: from + FIX_CHECK_MS };
    timer = setTimeout(check, FIX_CHECK_MS);
  };

  const check = async () => {
    checking = true;
    task.update();
    let latest = null;
    try {
      latest = await fetchVersion();
    } catch (checkError) {
      console.warn(`${LOG_PREFIX} Couldn't check for a fixed version:`, checkError);
    }
    checking = false;
    if (task.ended) return;
    if (latest && latest !== version) {
      showFixReady(latest);
      return;
    }
    schedule();
    task.update();
  };

  const task = createTask({
    tone: "red",
    stopLabel: "Stop checking for a fix",
    pill: () => (checking ? { label: "Checking for a fix…", busy: true } : { label: "Waiting for a fix", countdown }),
    dialog: () => {
      const progress = progressLine();
      return {
        title: "Couldn't start",
        content: [
          text(
            "The extension downloaded but crashed while starting up. Reloading Spotify usually fixes this. If it keeps happening, update Spicetify.",
          ),
          h("p", { class: "sle-detail" }, describeError(error)),
          progress.node,
          discordNote("Still not working? Share the error above on our"),
        ],
        primary: { label: "Reload Spotify", action: reloadSpotify },
        secondary: "Watch for a fix",
        render: () => progress.set("Checking for a fixed version in the background.", countdown, checking),
      };
    },
  });
  task.onEnd(() => clearTimeout(timer));

  schedule();
  task.open();
  return task;
};

// Loading the fix in place could trip over whatever the crashed version left behind, so this asks for a reload.
const showFixReady = (version) => {
  const task = createTask({
    stopLabel: "Dismiss",
    pill: () => ({ label: "Fix available" }),
    dialog: () => ({
      title: "Fix available",
      content: [
        text(
          `Spicy Lyrics ${version} is out. Reload Spotify to start it. Reloading also clears anything the crashed version left half set up.`,
        ),
      ],
      primary: { label: "Reload Spotify", action: reloadSpotify },
      secondary: "Later",
    }),
  });
  task.open();
  return task;
};

const startSpicetifyWait = () => {
  let starting = false;
  const task = createTask({
    stopLabel: "Hide",
    pill: () => ({ label: starting ? "Starting…" : "Waiting for Spicetify", busy: true }),
    dialog: () => ({
      title: "Waiting for Spicetify",
      content: [
        text(
          "Spicetify is taking longer than usual to load. Spicy Lyrics keeps waiting in the background and starts on its own once it's ready.",
        ),
        text("If nothing changes, reload Spotify. If that doesn't help, update Spicetify."),
      ],
      primary: { label: "Reload Spotify", action: reloadSpotify },
      secondary: "Wait in background",
    }),
  });
  task.open();

  return {
    // An open dialog closes the moment Spicetify arrives. A pill stays to report how the load went.
    ready: () => {
      if (task.view === "dialog") {
        task.finish();
        return;
      }
      starting = true;
      task.update();
    },
    loaded: () => task.finish("Spicy Lyrics is ready"),
  };
};

const run = async () => {
  const spicetifyWait = await waitForSpicetify();
  spicetifyWait?.ready();
  const result = await attemptLoad();
  if (result.ok) spicetifyWait?.loaded();
  else if (result.kind === "startup") startFixWatch(result);
  else startReconnect();
};

run().catch((error) => console.error(`${LOG_PREFIX} Loader crashed:`, error));
