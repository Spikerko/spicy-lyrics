import Platform from "../../../Global/Platform";

export type OnlineTrackCoverSource = {
	height: number;
	width: number;
	url: string;
};

export type OnlineTrackArtistItem = {
	uri: string;
	profile: {
		name: string;
	};
};

export type OnlineTrackInput = {
	__typename?: string;
	uri: string;
	name: string;
	albumOfTrack?: {
		uri?: string;
		name?: string;
		coverArt?: {
			sources?: OnlineTrackCoverSource[];
		};
	};
	artists?: {
		items?: OnlineTrackArtistItem[];
	};
	duration?: {
		totalMilliseconds: number;
	};
	playability?: {
		playable?: boolean;
	};
	relinkingInformation?: unknown;
};

export type LocalTrackImage = {
	url: string;
	label: string;
};

export type LocalTrackAlbum = {
	type?: string;
	uri: string;
	name: string;
	artist?: {
		type?: string;
		uri: string;
		name: string;
	};
	images?: LocalTrackImage[];
};

export type LocalTrackArtist = {
	type?: string;
	uri: string;
	name: string;
};

export type LocalTrackInput = {
	type?: string;
	uid?: string;
	addedAt?: string;
	uri: string;
	name: string;
	album?: LocalTrackAlbum;
	artists?: LocalTrackArtist[];
	discNumber?: number;
	trackNumber?: number;
	duration?: {
		milliseconds: number;
	};
	isExplicit?: boolean;
	isLocal?: boolean;
	isPlayable?: boolean;
	is19PlusOnly?: boolean;
	isBanned?: boolean;
};

export type ProcessedTrackArtist = {
	name: string;
	uri: string;
};

export type ProcessedTrackCoverArt = {
	size: string;
	uri: string;
};

export type ProcessedTrack = {
	name: string;
	artists: ProcessedTrackArtist[];
	durationMs: number;
	uri: string;
	coverArt: ProcessedTrackCoverArt[];
};

export type GetTracksOptions = {
	/** When aborted, the partner `fetch` is cancelled; local library load cannot be cancelled via this API. */
	signal?: AbortSignal;
};

type PartnerLookupEntity = {
	typedEntity?: {
		data?: OnlineTrackInput;
	};
};

type PartnerTracksResponse = {
	data?: {
		lookupEntities?: PartnerLookupEntity[];
	};
	errors?: { message?: string }[];
};

function onlineCoverArtSize(width: number, height: number): string {
	const d = Math.max(width, height);
	if (d <= 64) return "small";
	if (d <= 300) return "standard";
	if (d <= 640) return "large";
	return "xlarge";
}

function onlineUrlToSpotifyImageUri(url: string): string {
	const id = url.split("/").pop() ?? "";
	return `spotify:image:${id}`;
}

export function ProcessData(data: OnlineTrackInput, type: "online"): ProcessedTrack;
export function ProcessData(data: LocalTrackInput, type: "local"): ProcessedTrack;
export function ProcessData(
	data: OnlineTrackInput | LocalTrackInput,
	type: "local" | "online"
): ProcessedTrack {
	if (type === "online") {
		const d = data as OnlineTrackInput;
		const sources = d.albumOfTrack?.coverArt?.sources ?? [];
		return {
			name: d.name,
			uri: d.uri,
			durationMs: d.duration?.totalMilliseconds ?? 0,
			artists: (d.artists?.items ?? []).map((item) => ({
				name: item.profile?.name ?? "",
				uri: item.uri
			})),
			coverArt: sources.map((s) => ({
				size: onlineCoverArtSize(s.width, s.height),
				uri: onlineUrlToSpotifyImageUri(s.url)
			}))
		};
	}

	const d = data as LocalTrackInput;
	const images = d.album?.images ?? [];
	return {
		name: d.name,
		uri: d.uri,
		durationMs: d.duration?.milliseconds ?? 0,
		artists: (d.artists ?? []).map((a) => ({
			name: a.name,
			uri: a.uri
		})),
		coverArt: images.map((img) => ({
			size: img.label,
			uri: img.url
		}))
	};
}

function filterRequestedLocalTracks(
	allLocalTracks: LocalTrackInput[],
	wanted: Set<string>
): LocalTrackInput[] {
	if (wanted.size === 0) return [];
	return allLocalTracks.filter((t) => wanted.has(t.uri));
}

type FetchOnlineOptions = {
	signal?: AbortSignal;
	/** When set, skips an extra `GetSpotifyAccessToken()` call (e.g. after parallel prefetch). */
	accessToken?: string;
};

async function fetchOnlineTracksProcessed(
	uris: string[],
	options?: FetchOnlineOptions
): Promise<ProcessedTrack[]> {
	if (uris.length === 0) return [];

	const accessToken =
		options?.accessToken ?? (await Platform.GetSpotifyAccessToken());

	const res = await fetch("https://api-partner.spotify.com/pathfinder/v1/query", {
		method: "POST",
		signal: options?.signal,
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			variables: { uris },
			extensions: {
				persistedQuery: {
					version: 1,
					sha256Hash: "f952da037440f694cc6925b9e3f649d39077a744c4db7dfba01cb883723f4f77"
				}
			}
		})
	});

	if (!res.ok) {
		throw new Error(`Spotify pathfinder request failed: ${res.status} ${res.statusText}`);
	}

	const payload = (await res.json()) as PartnerTracksResponse;
	const graphQlMsg = payload.errors?.map((e) => e.message).filter(Boolean).join("; ");
	if (graphQlMsg) {
		throw new Error(`Spotify pathfinder GraphQL: ${graphQlMsg}`);
	}

	const entities = payload.data?.lookupEntities;
	if (!Array.isArray(entities)) {
		throw new Error("Spotify pathfinder response missing lookupEntities");
	}

	return entities
		.map((entity) => entity.typedEntity?.data)
		.filter((d): d is OnlineTrackInput => d != null && typeof d.uri === "string")
		.map((d) => ProcessData(d, "online"));
}

export const GetTracks = async (uris: string[], options?: GetTracksOptions): Promise<ProcessedTrack[]> => {
	const { signal } = options ?? {};

	if (uris.length === 0) return [];

	const uriBuckets = {
		localTracks: new Set<string>(),
		tracks: new Set<string>()
	};

	for (const uri of uris) {
		if (uri.startsWith("spotify:local:")) {
			uriBuckets.localTracks.add(uri);
			continue;
		}
		uriBuckets.tracks.add(uri);
	}

	const needLocal = uriBuckets.localTracks.size > 0;
	const needOnline = uriBuckets.tracks.size > 0;

	if (!needLocal && !needOnline) return [];

	const onlineUris = Array.from(uriBuckets.tracks);

	let requestedLocalTracks: LocalTrackInput[] = [];

	if (needLocal && needOnline) {
		const [allLocalTracks, accessToken] = await Promise.all([
			Spicetify.Platform.LocalFilesAPI.getTracks(),
			Platform.GetSpotifyAccessToken()
		]);
		requestedLocalTracks = filterRequestedLocalTracks(allLocalTracks, uriBuckets.localTracks);
		const onlineMapped = await fetchOnlineTracksProcessed(onlineUris, { signal, accessToken });
		const localMapped = requestedLocalTracks.map((track) => ProcessData(track, "local"));
		return [...onlineMapped, ...localMapped];
	}

	if (needLocal) {
		const allLocalTracks = await Spicetify.Platform.LocalFilesAPI.getTracks();
		requestedLocalTracks = filterRequestedLocalTracks(allLocalTracks, uriBuckets.localTracks);
		return requestedLocalTracks.map((track) => ProcessData(track, "local"));
	}

	const onlineMapped = await fetchOnlineTracksProcessed(onlineUris, { signal });
	return onlineMapped;
};
