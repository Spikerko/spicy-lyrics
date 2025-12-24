import Platform from "./Platform.ts";
import { Spicetify } from "@spicetify/bundler"

export const SpotifyFetch = (url: string): Promise<Response> => {
	return (
		Platform.GetSpotifyAccessToken()
		.then(
			accessToken => fetch(
				url,
				{
					headers: {
						"Accept": "application/json",
						"Authorization": `Bearer ${accessToken}`,
						"Spotify-App-Version": Spicetify.Platform.version,
						"App-Platform": Spicetify.Platform.PlatformData.app_platform
					}
				}
			)
		)
	)
}
