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
 * How long before its stated expiry a token stops being trusted.
 *
 * Clients hand out tokens that are already dead a little before their own
 * `accessTokenExpirationTimestampMs` says they should be, and that timestamp is
 * the client's clock rather than the server's either way. Re-reading costs a
 * synchronous property lookup, so a wide margin is nearly free — while using a
 * dead token costs the user their lyrics.
 */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

function isUsable(response: TokenProviderResponse | undefined): boolean {
  if (!response?.accessToken) return false;
  if (response.accessToken === rejectedAccessToken) return false;
  // Some sources don't report an expiry — treat those as usable and let a 401
  // from the API drive the next refresh.
  if (typeof response.expiresAtTime !== "number" || !Number.isFinite(response.expiresAtTime)) {
    return true;
  }
  return response.expiresAtTime - Date.now() > TOKEN_EXPIRY_MARGIN_MS;
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

/**
 * Legacy path, kept as the fallback: the Cosmos oauth resolver, and — on clients
 * where that resolver is gone — `Platform.Session`.
 */
async function tokenFromLegacySources(): Promise<TokenProviderResponse | undefined> {
  try {
    const result: TokenProviderResponse = await SpotifyInternalFetch.get("sp://oauth/v2/token");
    if (result?.accessToken) {
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

  const fromLegacy = await tokenFromLegacySources();
  if (fromLegacy && isUsable(fromLegacy)) return adopt(fromLegacy);

  // Every source gave back something expired, or the very token we were just
  // told is bad. A doubtful token still beats no token — the request will come
  // back 401 and we will ask again — so hand back the best of what we have and
  // drop the rejection, rather than sending nothing until the client rotates.
  const lastResort = fromLegacy ?? fromAuthorizationAPI;
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

  const pending = resolveAccessToken().finally(() => {
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
