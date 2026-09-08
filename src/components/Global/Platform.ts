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

/** A cached token is reusable until it's within this margin of expiring. */
const TOKEN_EXPIRY_MARGIN_MS = 2;

function isUsable(response: TokenProviderResponse | undefined): response is TokenProviderResponse {
  if (!response?.accessToken) return false;
  // Some sources don't report an expiry — treat those as usable and let a 401
  // from the API drive the next refresh.
  if (typeof response.expiresAtTime !== "number" || !Number.isFinite(response.expiresAtTime)) {
    return true;
  }
  return response.expiresAtTime - Date.now() > TOKEN_EXPIRY_MARGIN_MS;
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

  const response = tokenFromAuthorizationAPI() ?? (await tokenFromLegacySources());

  if (!response?.accessToken) {
    throw new Error("Unable to obtain a Spotify access token");
  }

  tokenProviderResponse = response;
  return response.accessToken;
}

const GetSpotifyAccessToken = (): Promise<string> => {
  if (isUsable(tokenProviderResponse)) {
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

const Platform = {
  OnSpotifyReady,
  GetSpotifyAccessToken,
  get SpotifyVersion(): number[] {
    return Spicetify.Platform.version.split(".").map((i) => Number.parseInt(i, 10));
  }
};

export default Platform;
