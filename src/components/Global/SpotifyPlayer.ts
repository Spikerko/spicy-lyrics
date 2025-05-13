// eslint-disable-next-line @typescript-eslint/no-unused-vars
import SpicyFetch from "../../utils/API/SpicyFetch";
import GetProgress, { _DEPRECATED___GetProgress } from "../../utils/Gets/GetProgress";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
//type ArtworkSize = "s" | "l" | "xl" | "d";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
//const TrackData_Map = new Map();

/* const old_SpotifyPlayer = {
    IsPlaying: false,
    GetTrackPosition: GetProgress,
    GetTrackDuration: (): number => {
        if (Spicetify.Player.data.item.duration?.milliseconds) {
            return Spicetify.Player.data.item.duration.milliseconds;
        }
        return 0;
    },
    Track: {
        GetTrackInfo: async () => {
            const spotifyHexString = SpicyHasher.spotifyHex(SpotifyPlayer.GetSongId());
            if (TrackData_Map.has(spotifyHexString)) return TrackData_Map.get(spotifyHexString);
            const URL = `https://spclient.wg.spotify.com/metadata/4/track/${spotifyHexString}?market=from_token`;
            const [data, status] = await SpicyFetch(URL, true, true, false);
            if (status !== 200) return null;
            const parsedData = ((data.startsWith(`{"`) || data.startsWith("{"))
                                    ? JSON.parse(data)
                                    : data);
            TrackData_Map.set(spotifyHexString, parsedData);
            return parsedData;
        },
        SortImages: (images: any[]) => {
            // Define size thresholds
            const sizeMap = {
                s: "SMALL",
                l: "DEFAULT",
                xl: "LARGE"
            };

            // Sort the images into categories based on their size
            const sortedImages = images.reduce((acc, image) => {
                const { size } = image;

                if (size === sizeMap.s) {
                    acc.s.push(image);
                } else if (size === sizeMap.l) {
                    acc.l.push(image);
                } else if (size === sizeMap.xl) {
                    acc.xl.push(image);
                }

                return acc;
            }, { s: [], l: [], xl: [] });


            return sortedImages;
        }
    },
    Seek: (position: number) => {
        Spicetify.Player.origin.seekTo(position);
    },
    Artwork: {
        Get: async (size: ArtworkSize): Promise<string> => {
            const psize = (size === "d" ? null : (size?.toLowerCase() ?? null));
            const Data = await SpotifyPlayer.Track.GetTrackInfo();
            const Images = SpotifyPlayer.Track.SortImages(Data.album.cover_group.image);
            switch (psize) {
                case "s":
                    return `spotify:image:${Images.s[0].file_id}`;
                case "l":
                    return `spotify:image:${Images.l[0].file_id}`;
                case "xl":
                    return `spotify:image:${Images.xl[0].file_id}`;
                default:
                    return `spotify:image:${Images.l[0].file_id}`;
            }
        }
    },
    GetSongName: async (): Promise<string> => {
        const Data = await SpotifyPlayer.Track.GetTrackInfo();
        return Data.name;
    },
    GetAlbumName: (): string => {
        return Spicetify.Player.data.item.metadata.album_title;
    },
    GetSongId: (): string => {
        return Spicetify.Player.data.item.uri?.split(":")[2] ?? null;
    },
    GetArtists: async (): Promise<string[]> => {
        const data = await SpotifyPlayer.Track.GetTrackInfo();
        return data?.artist?.map(a => a.name) ?? [];
    },
    JoinArtists: (artists: string[]): string => {
        return artists?.join(", ") ?? null;
    },
    IsPodcast: false,
    _DEPRECATED_: {
        GetTrackPosition: _DEPRECATED___GetProgress
    },
    Pause: Spicetify.Player.pause,
    Play: Spicetify.Player.play,
    TogglePlayState: Spicetify.Player.togglePlay,
    Skip: {
        Next: Spicetify.Player.next,
        Prev: Spicetify.Player.back
    },
    LoopType: "none",
    ShuffleType: "none",
} */

const GetContentType = (): string => {
    if (
        Spicetify &&
        Spicetify.Player &&
        Spicetify.Player.data &&
        Spicetify.Player.data.item &&
        Spicetify.Player.data.item.type
    ) {
        return Spicetify.Player.data.item?.type
    }
    return "unknown";
};

export type CoverSizes = "standard" | "small" | "large" | "xlarge";
export type Artist = {
    type: "artist";
    name: string;
    uri: string;
}

export const SpotifyPlayer = {
    IsPlaying: false,
    _DEPRECATED_: {
        GetTrackPosition: _DEPRECATED___GetProgress
    },
    GetPosition: GetProgress,
    GetContentType: GetContentType,
    GetDuration: (): number => {
        if (
            Spicetify.Player.data &&
            Spicetify.Player.data.item &&
            Spicetify.Player.data.item.duration &&
            Spicetify.Player.data.item.duration.milliseconds
        
        ) {
            return Spicetify.Player.data.item.duration.milliseconds;
        }
        return 0;
    },
    Seek: (position: number): void => {
        Spicetify.Player.origin.seekTo(position);
    },
    GetCover: (size: CoverSizes): string | undefined => {
        if (
            Spicetify.Player.data &&
            Spicetify.Player.data.item &&
            Spicetify.Player.data.item.images
        ) {
            const covers = Spicetify.Player.data.item?.images;
            const cover = covers?.find(cover => cover.label === size) ?? undefined;
            return cover?.url ?? "https://images.spikerko.org/SongPlaceholderFull.png";
        }
        return "https://images.spikerko.org/SongPlaceholderFull.png";
    },
    GetName: () => {
        return Spicetify.Player.data.item?.name ?? undefined;
    },
    GetAlbumName: (): string | undefined => {
        return Spicetify.Player.data.item?.metadata.album_title ?? undefined;
    },
    GetId: (): string | undefined => {
        return Spicetify.Player.data.item?.uri?.split(":")[2] ?? undefined;
    },
    GetArtists: (): Artist[] | undefined => {
        return Spicetify.Player.data.item?.artists as Artist[] ?? undefined;
    },
    GetUri: (): string | undefined => {
        return Spicetify.Player.data.item?.uri ?? undefined;
    },
    Pause: Spicetify.Player.pause,
    Play: Spicetify.Player.play,
    TogglePlayState: Spicetify.Player.togglePlay,
    Skip: {
        Next: Spicetify.Player.next,
        Prev: Spicetify.Player.back
    },
    LoopType: "none",
    ShuffleType: "none",
    IsDJ: (): boolean => {
        return (
                Spicetify.Player.data?.item?.provider &&
                Spicetify.Player.data?.item?.provider?.startsWith("narration")
               ) ||
               (
                Spicetify.Player.data?.item?.artists &&
                Spicetify.Player.data?.item?.artists?.length > 0 &&
                Spicetify.Player.data?.item?.artists[0].name.includes("DJ")
               ) || (
                Spicetify.Player.data?.restrictions?.disallowSeekingReasons &&
                Spicetify.Player.data?.restrictions?.disallowSeekingReasons?.length > 0 &&
                Spicetify.Player.data?.restrictions?.disallowSeekingReasons[0].includes("narration")
               ) ||
               (
                Spicetify.Player.data?.item?.type &&
                Spicetify.Player.data?.item?.type === "unknown"
               ) ? true : false;
    },
    IsLiked: () => Spicetify.Player.getHeart(),
    ToggleLike: () => Spicetify.Player.toggleHeart(),
};