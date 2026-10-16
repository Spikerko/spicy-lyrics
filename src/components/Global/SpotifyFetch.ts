import Platform from "./Platform.ts";

/**
 * An authenticated `fetch` to a Spotify web endpoint (spclient, api.spotify.com).
 * Use it rather than `Spicetify.CosmosAsync` for https URLs: on clients where
 * Spicetify's proxy isn't on `Player.origin._cosmos`, CosmosAsync is the native
 * Cosmos bridge, which fails every https request with "Resolver not found!".
 * A 401 retires the token and retries once with a fresh one.
 * `init.signal` also bounds the token lookups, not just the requests.
 */
export const SpotifyFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
	const signal = init.signal ?? undefined;
	const getToken = (): Promise<string> => {
		const pending = Platform.GetSpotifyAccessToken();
		if (!signal) return pending;
		if (signal.aborted) return Promise.reject(signal.reason);
		return new Promise((resolve, reject) => {
			const onAbort = () => reject(signal.reason);
			signal.addEventListener("abort", onAbort, { once: true });
			pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
		});
	};

	const send = (accessToken: string) => {
		// Normalised through `Headers` so every `HeadersInit` form (object, pair
		// array, `Headers`) is honoured. The caller's headers win over these.
		const headers = new Headers(init.headers);
		const defaults: Record<string, string> = {
			"Accept": "application/json",
			"Authorization": `Bearer ${accessToken}`,
			"Spotify-App-Version": Spicetify.Platform.version,
			"App-Platform": Spicetify.Platform.PlatformData.app_platform,
		};
		for (const [name, value] of Object.entries(defaults)) {
			if (!headers.has(name)) headers.set(name, value);
		}
		return fetch(url, { ...init, headers });
	};

	const accessToken = await getToken();
	const res = await send(accessToken);
	if (res.status !== 401) return res;

	Platform.InvalidateSpotifyAccessToken(accessToken);
	const retryToken = await getToken();
	// No fresh token to be had (renew on cooldown, or the client keeps handing
	// back the same one): resending it would only earn the same 401.
	if (retryToken === accessToken) return res;
	return send(retryToken);
}
