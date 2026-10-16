// project/config has no imports of its own, so this keeps the module a leaf.
import { ProjectVersion } from "../../../project/config.ts";

const EDGE_SERVICE_URL = "https://api.spicylyrics.org/bp/svc";
const EDGE_INIT_URL = "https://api.spicylyrics.org/bp/init";

export type EdgeLookupName = "config" | "experimentsState" | "version";

export type EdgeLookupOptions = {
  /** Abort the request after this long, token fetch included. */
  timeoutMs: number;
};

/** Lookups sent without a token. Config is one so it never depends on /bp/init. */
const TOKENLESS_LOOKUPS: ReadonlySet<EdgeLookupName> = new Set(["config"]);

/** Fetch a fresh token once this share of its lifetime has passed. */
const TOKEN_REFRESH_AT = 0.8;

type EdgeToken = {
  value: string;
  /** performance.now() time to refresh at; monotonic, so clock changes can't affect it. */
  refreshAt: number;
};

let currentToken: EdgeToken | null = null;
let pendingToken: Promise<EdgeToken | Response> | null = null;

function versionHeader(): Record<string, string> {
  // Same source as $spicyLyricsVersion, read here to avoid importing stores.
  return {
    "SpicyLyrics-Version": (window as any)._spicy_lyrics_metadata?.LoadedVersion ?? ProjectVersion,
  };
}

/** Build the URL for a lookup. */
export function EdgeLookupUrl(lookup: EdgeLookupName): string {
  return `${EDGE_SERVICE_URL}?selector=${encodeURIComponent(lookup)}`;
}

/** Resolves with the token, or with the failed /bp/init response. */
async function requestToken(timeoutMs: number): Promise<EdgeToken | Response> {
  const res = await fetch(`${EDGE_INIT_URL}?_=${Date.now()}`, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    headers: versionHeader(),
  });
  if (!res.ok) return res;

  const body = await res.json().catch(() => null);
  if (typeof body?.token !== "string" || typeof body.expiresIn !== "number" || !(body.expiresIn > 0)) {
    return new Response(null, { status: 502, statusText: "Malformed edge token" });
  }
  currentToken = {
    value: body.token,
    refreshAt: performance.now() + body.expiresIn * 1000 * TOKEN_REFRESH_AT,
  };
  return currentToken;
}

/** Settle with `promise`, or reject once `signal` aborts, whichever is first. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Current token, fetching one if needed. Concurrent callers share one /bp/init. */
function ensureToken(timeoutMs: number, signal: AbortSignal): Promise<EdgeToken | Response> {
  if (currentToken && performance.now() < currentToken.refreshAt) {
    return Promise.resolve(currentToken);
  }
  pendingToken ??= requestToken(timeoutMs).finally(() => {
    pendingToken = null;
  });
  return untilAborted(pendingToken, signal);
}

/** ensureToken, but a shared init that hit another caller's shorter deadline is retried on ours. */
async function tokenWithin(timeoutMs: number, signal: AbortSignal): Promise<EdgeToken | Response> {
  try {
    return await ensureToken(timeoutMs, signal);
  } catch (error) {
    if (signal.aborted || (error as Error)?.name !== "TimeoutError") throw error;
    return ensureToken(timeoutMs, signal);
  }
}

function fetchLookup(lookup: EdgeLookupName, signal: AbortSignal, token?: string): Promise<Response> {
  return fetch(EdgeLookupUrl(lookup), {
    signal,
    cache: "no-store",
    headers: token ? { ...versionHeader(), Authorization: `Bearer ${token}` } : versionHeader(),
  });
}

/**
 * Fetch a lookup, uncached. Resolves with the raw response, whatever its
 * status (a failed /bp/init response stands in for the lookup's); rejects on
 * network failure or timeout.
 */
export async function EdgeLookup(lookup: EdgeLookupName, { timeoutMs }: EdgeLookupOptions): Promise<Response> {
  const signal = AbortSignal.timeout(timeoutMs);
  if (TOKENLESS_LOOKUPS.has(lookup)) return fetchLookup(lookup, signal);

  const token = await tokenWithin(timeoutMs, signal);
  if (token instanceof Response) return token;
  const res = await fetchLookup(lookup, signal, token.value);
  if (res.status !== 401) return res;

  // Rejected: drop it, unless another lookup already replaced it, and retry
  // once with a fresh one.
  if (currentToken === token) currentToken = null;
  const retryToken = await tokenWithin(timeoutMs, signal);
  if (retryToken instanceof Response) return retryToken;
  return fetchLookup(lookup, signal, retryToken.value);
}
