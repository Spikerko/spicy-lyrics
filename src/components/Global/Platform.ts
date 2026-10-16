import { getRemoteConfig } from "../../utils/remoteConfig.ts";

// Spotify Types
type TokenProviderResponse = {
  accessToken: string;
  expiresAtTime: number;
  tokenType: "Bearer";
};

/** Shape returned by `Spicetify.Platform.AuthorizationAPI.getState()`. */
type AuthorizationState = {
  isAuthorized?: boolean;
  token?: {
    accessToken?: string;
    accessTokenExpirationTimestampMs?: number;
    tokenType?: string;
    isAnonymous?: boolean;
  } | null;
};

// Store all our Spotify Services
const Spotify: typeof Spicetify = (globalThis as any).Spicetify;
let SpotifyPlatform: typeof Spicetify.Platform;
let SpotifyInternalFetch: typeof Spicetify.CosmosAsync;

// Spotify Ready Promise
const OnSpotifyReady = new Promise<void>((resolve) => {
  const CheckForServices = () => {
    SpotifyPlatform = Spotify.Platform;
    SpotifyInternalFetch = Spotify.CosmosAsync;

    if (!SpotifyPlatform || !SpotifyInternalFetch) {
      requestAnimationFrame(() => setTimeout(CheckForServices, 0));
      return;
    }

    resolve();
  };

  CheckForServices();
});

// Get Spotify Access Token Function
let tokenProviderResponse: TokenProviderResponse | undefined;
let accessTokenPromise: Promise<string> | undefined;

/**
 * The token the API has told us it will not accept, if any.
 *
 * Cleared as soon as a *different* token is adopted, so it never outlives the
 * rotation it was waiting for. See `InvalidateSpotifyAccessToken`.
 */
let rejectedAccessToken: string | undefined;

/**
 * How long before its stated expiry a token stops being trusted
 * (`token.expiryMarginMs` in the remote config).
 *
 * Clients hand out tokens that are already dead a little before their own
 * `accessTokenExpirationTimestampMs` says they should be, and that timestamp is
 * the client's clock rather than the server's either way. Re-reading costs a
 * synchronous property lookup, so a wide margin is nearly free — while using a
 * dead token costs the user their lyrics.
 */
const tokenExpiryMarginMs = () => getRemoteConfig().token.expiryMarginMs;

function isUsable(response: TokenProviderResponse | undefined): boolean {
  if (!response?.accessToken) return false;
  if (response.accessToken === rejectedAccessToken) return false;
  // Some sources don't report an expiry — treat those as usable and let a 401
  // from the API drive the next refresh.
  if (typeof response.expiresAtTime !== "number" || !Number.isFinite(response.expiresAtTime)) {
    return true;
  }
  return response.expiresAtTime - Date.now() > tokenExpiryMarginMs();
}

/** Take a token as the current one, retiring any rejection it supersedes. */
function adopt(response: TokenProviderResponse): string {
  tokenProviderResponse = response;
  if (rejectedAccessToken && rejectedAccessToken !== response.accessToken) {
    rejectedAccessToken = undefined;
  }
  return response.accessToken;
}

/**
 * Preferred source on current Spotify clients: the platform's own authorization
 * store. `getState()` is a plain synchronous getter over the cached state.
 */
function tokenFromAuthorizationAPI(): TokenProviderResponse | undefined {
  try {
    const api = (SpotifyPlatform as any)?.AuthorizationAPI;
    if (typeof api?.getState !== "function") return undefined;

    const state: AuthorizationState = api.getState();
    const token = state?.token;
    if (!token?.accessToken) return undefined;
    if (state.isAuthorized === false) return undefined;

    return {
      accessToken: token.accessToken,
      expiresAtTime: token.accessTokenExpirationTimestampMs as number,
      tokenType: "Bearer",
    };
  } catch (error) {
    console.warn("AuthorizationAPI.getState() failed, falling back", error);
    return undefined;
  }
}

type SpotifyToken = {
  accessToken: string;
  accessTokenExpirationTimestampMs?: number;
};

/** Spotify's desktop token provider (TokenProviderDesktop in xpui-modules). */
type SpotifyTokenProvider = {
  getToken(options?: { preferCached?: boolean; forceRefresh?: boolean }): Promise<SpotifyToken | null>;
  /** The native login5 AccessTokenClient. */
  _client?: { getToken(request: { renew?: boolean }): Promise<unknown> };
};

/**
 * The object behind `AuthorizationAPI`. Its `getState()` is only a snapshot,
 * updated when something calls `getToken()` on this provider. Spotify's own
 * transport does that only when it needs a token itself, so the snapshot can
 * sit on an expired or revoked token for a long time.
 */
function getTokenProvider(): SpotifyTokenProvider | undefined {
  let provider: SpotifyTokenProvider | undefined;
  try {
    provider = (SpotifyPlatform as any)?.Registry?.resolve(Symbol.for("TokenProvider"));
  } catch {
    // Not registered under that name on this client.
  }
  provider ??= (SpotifyPlatform as any)?.AuthorizationAPI?._tokenProvider;
  return typeof provider?.getToken === "function" ? provider : undefined;
}

function toResponse(token: SpotifyToken | null | undefined): TokenProviderResponse | undefined {
  if (!token?.accessToken) return undefined;
  return {
    accessToken: token.accessToken,
    expiresAtTime: token.accessTokenExpirationTimestampMs as number,
    tokenType: "Bearer",
  };
}

const TIMED_OUT = Symbol("timed out");

/** Settle with `TIMED_OUT` if `promise` hasn't settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Ask the provider to load the native client's current token.
 *
 * Bounded on its own (`token.sourceTimeoutMs`): a provider that stops answering
 * must leave time for the legacy sources and the last-resort token, rather than
 * running out the whole lookup's deadline.
 */
async function tokenFromProvider(
  provider: SpotifyTokenProvider
): Promise<TokenProviderResponse | undefined | typeof TIMED_OUT> {
  try {
    const token = await withTimeout(provider.getToken(), getRemoteConfig().token.sourceTimeoutMs);
    if (token === TIMED_OUT) {
      console.warn("TokenProvider.getToken() timed out");
      return TIMED_OUT;
    }
    return toResponse(token);
  } catch (error) {
    console.warn("TokenProvider.getToken() failed", error);
    return undefined;
  }
}

let renewPromise: Promise<TokenProviderResponse | undefined> | undefined;
let lastRenewAt = 0;

/**
 * Make the native client fetch a brand-new token from login5.
 *
 * `getToken({forceRefresh: true})` alone isn't enough: Spotify's provider
 * always asks the native client with `renew: false`, which hands back the same
 * token until its own expiry, revoked or not. The old token keeps working after
 * a renew, so this doesn't disturb anything else holding it. The follow-up
 * `forceRefresh` load puts the new token into `AuthorizationAPI`'s state.
 */
function renewToken(provider: SpotifyTokenProvider): Promise<TokenProviderResponse | undefined> {
  if (renewPromise) return renewPromise;
  if (typeof provider._client?.getToken !== "function") return Promise.resolve(undefined);
  if (Date.now() - lastRenewAt < getRemoteConfig().token.renewCooldownMs) return Promise.resolve(undefined);

  lastRenewAt = Date.now();
  const renew = (async () => {
    try {
      await provider._client!.getToken({ renew: true });
      return toResponse(await provider.getToken({ forceRefresh: true }));
    } catch (error) {
      console.warn("Token renew failed", error);
      return undefined;
    }
  })();
  // Every GetSpotifyAccessToken caller waits on this, so a native call that
  // never answers (offline, bridge gone) must not hold them forever.
  const pending = withTimeout(renew, getRemoteConfig().token.renewTimeoutMs)
    .then((result) => {
      if (result !== TIMED_OUT) return result;
      console.warn("Token renew timed out");
      return undefined;
    })
    .finally(() => {
      if (renewPromise === pending) renewPromise = undefined;
    });
  renewPromise = pending;
  return pending;
}

/**
 * Legacy path, kept as the fallback: the Cosmos oauth resolver, and — on clients
 * where that resolver is gone — `Platform.Session`.
 */
async function tokenFromLegacySources(): Promise<TokenProviderResponse | undefined> {
  try {
    const result = await withTimeout<TokenProviderResponse>(
      SpotifyInternalFetch.get("sp://oauth/v2/token"),
      getRemoteConfig().token.sourceTimeoutMs
    );
    if (result === TIMED_OUT) {
      console.warn("sp://oauth/v2/token timed out, falling back to Platform.Session");
    } else if (result?.accessToken) {
      return {
        accessToken: result.accessToken,
        expiresAtTime: result.expiresAtTime,
        tokenType: "Bearer",
      };
    }
  } catch (error) {
    console.warn("sp://oauth/v2/token failed, falling back to Platform.Session", error);
  }

  const session = (SpotifyPlatform as any)?.Session;
  if (!session?.accessToken) {
    console.warn("Failed to find SpotifyPlatform.Session for fetching token");
    return undefined;
  }

  return {
    accessToken: session.accessToken,
    expiresAtTime: session.accessTokenExpirationTimestampMs,
    tokenType: "Bearer",
  };
}

async function resolveAccessToken(): Promise<string> {
  await OnSpotifyReady;

  const fromAuthorizationAPI = tokenFromAuthorizationAPI();
  if (fromAuthorizationAPI && isUsable(fromAuthorizationAPI)) {
    return adopt(fromAuthorizationAPI);
  }

  // The snapshot is expired or was refused, so ask the native client. A plain
  // load picks up a token it has already rotated to; if that is still the bad
  // one, make it renew.
  const provider = getTokenProvider();
  let fromProvider: TokenProviderResponse | undefined;
  if (provider) {
    const loaded = await tokenFromProvider(provider);
    // A provider that didn't answer won't answer the renew's follow-up load
    // either, so go straight to the legacy sources.
    if (loaded !== TIMED_OUT) {
      fromProvider = loaded;
      if (fromProvider && isUsable(fromProvider)) return adopt(fromProvider);

      const renewed = await renewToken(provider);
      if (renewed && isUsable(renewed)) return adopt(renewed);
      fromProvider = renewed ?? fromProvider;
    }
  }

  // Older clients without the provider. On 1.3.5 both of these are dead.
  const fromLegacy = await tokenFromLegacySources();
  if (fromLegacy && isUsable(fromLegacy)) return adopt(fromLegacy);

  // Every source gave back something expired, or the very token we were just
  // told is bad. A doubtful token still beats no token — the request will come
  // back 401 and we will ask again — so hand back the best of what we have and
  // drop the rejection, rather than sending nothing until the client rotates.
  const lastResort = fromProvider ?? fromLegacy ?? fromAuthorizationAPI;
  if (lastResort?.accessToken) {
    rejectedAccessToken = undefined;
    return adopt(lastResort);
  }

  throw new Error("Unable to obtain a Spotify access token");
}

const GetSpotifyAccessToken = (): Promise<string> => {
  // The platform keeps its own token fresh and `getState()` is a synchronous
  // read, so look there on every call rather than trusting our copy. A token
  // the client has already rotated away from is then never handed out.
  const fresh = tokenFromAuthorizationAPI();
  if (fresh && isUsable(fresh)) return Promise.resolve(adopt(fresh));

  if (tokenProviderResponse && isUsable(tokenProviderResponse)) {
    return Promise.resolve(tokenProviderResponse.accessToken);
  }

  // Expired (or unusable) — drop it so a failed refresh can't hand it back out.
  tokenProviderResponse = undefined;

  // De-duplicate concurrent callers, but never cache the promise past its
  // settlement: a rejection must not poison every later call.
  if (accessTokenPromise) return accessTokenPromise;

  // Bounded as a whole: every source here is a native or Cosmos call that can
  // stop answering, and every caller shares this promise.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Timed out obtaining a Spotify access token")),
      getRemoteConfig().token.resolveTimeoutMs
    );
  });
  const pending = Promise.race([resolveAccessToken(), timeout]).finally(() => {
    clearTimeout(timer);
    if (accessTokenPromise === pending) accessTokenPromise = undefined;
  });
  accessTokenPromise = pending;
  return pending;
};

/**
 * Report that the API refused `token` with a 401: it looked valid to us, and
 * the server disagrees. The server is right.
 *
 * The token is remembered as rejected rather than merely dropped, because the
 * platform's store keeps offering the same string back until it rotates —
 * without this, a "refresh and retry" would resend exactly what was refused.
 * A refresh already in flight is left alone; it is fetching a new token anyway.
 */
function InvalidateSpotifyAccessToken(token?: string): void {
  const rejected = token ?? tokenProviderResponse?.accessToken;
  if (!rejected) return;

  rejectedAccessToken = rejected;
  if (tokenProviderResponse?.accessToken === rejected) {
    tokenProviderResponse = undefined;
  }
}

const Platform = {
  OnSpotifyReady,
  GetSpotifyAccessToken,
  InvalidateSpotifyAccessToken,
  get SpotifyVersion(): number[] {
    return Spicetify.Platform.version.split(".").map((i) => Number.parseInt(i, 10));
  }
};

export default Platform;
