import { Defer, Timeout } from "@socali/modules/Scheduler";
import { Spicetify } from "@spicetify/bundler";

// Spotify Types
type TokenProviderResponse = {
  accessToken: string;
  expiresAtTime: number;
  tokenType: "Bearer";
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
      Defer(CheckForServices);
      return;
    }

    resolve();
  };

  CheckForServices();
});

// Get Spotify Access Token Function
let tokenProviderResponse: TokenProviderResponse | undefined;
let accessTokenPromise: Promise<string> | undefined;

const GetSpotifyAccessToken = (): Promise<string> => {
  if (tokenProviderResponse) {
    const timeUntilRefresh = (tokenProviderResponse.expiresAtTime - Date.now()) / 1000;
    if (timeUntilRefresh <= 2) {
      tokenProviderResponse = undefined;
      accessTokenPromise = new Promise((resolve) => Timeout(timeUntilRefresh, resolve)).then(() => {
        accessTokenPromise = undefined;
        return GetSpotifyAccessToken();
      });
      return accessTokenPromise;
    }
  }

  if (accessTokenPromise) {
    return accessTokenPromise;
  }

  accessTokenPromise = SpotifyInternalFetch.get("sp://oauth/v2/token")
    .then((result: TokenProviderResponse) => {
      tokenProviderResponse = result;
      accessTokenPromise = Promise.resolve(result.accessToken);
      return GetSpotifyAccessToken();
    })
    .catch((error: Error) => {
      if (error.message.includes("Resolver not found")) {
        if (!SpotifyPlatform.Session) {
          console.warn("Failed to find SpotifyPlatform.Session for fetching token");
        } else {
          tokenProviderResponse = {
            accessToken: SpotifyPlatform.Session.accessToken,
            expiresAtTime: SpotifyPlatform.Session.accessTokenExpirationTimestampMs,
            tokenType: "Bearer",
          };
          accessTokenPromise = Promise.resolve(tokenProviderResponse.accessToken);
        }
      }
      return GetSpotifyAccessToken();
    });

  return accessTokenPromise;
};

const Platform = {
  OnSpotifyReady,
  GetSpotifyAccessToken,
  get SpotifyVersion(): number[] {
    return Spicetify.Platform.version.split(".").map((i) => Number.parseInt(i, 10));
  }
};

export default Platform;
