import React from "react";
import { useQuery } from "@tanstack/react-query";
import { SendJob } from "../../../../utils/API/SendJob.ts";
import { Spicetify } from "@spicetify/bundler";

// Types
type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};
type SpotifyArtist = {
  id: string;
  name: string;
  uri: string;
  [key: string]: any;
};
type SpotifyAlbum = {
  id: string;
  name: string;
  images: SpotifyImage[];
  release_date: string;
  [key: string]: any;
};
type SpotifyTrack = {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  uri: string;
  [key: string]: any;
};
type TTMLProfileData = {
  data?: {
    banner?: string;
    avatar?: string;
    displayName?: string;
    username?: string;
    id?: string;
  };
  type?: "maker" | "uploader" | "mixed";
};
type TTMLProfileUserList = {
  makes: { id: string; views_count?: number }[];
  uploads: { id: string; view_count?: number }[];
};
type TTMLProfileResponse = {
  profile?: TTMLProfileData;
  perUser?: TTMLProfileUserList;
};
type SongRowProps = {
  trackId: string;
  trackMap: Map<string, SpotifyTrack>;
};
type ProfileDisplayProps = { userId: string; hasProfileBanner: boolean };

// Utility to filter valid track IDs
function validTrackIds(ids: string[]): string[] {
  const base62Regex = /^[0-9A-Za-z]+$/;
  return ids.filter(
    (id) => base62Regex.test(id) && Spicetify.URI.isTrack(`spotify:track:${id}`)
  );
}

// Fetch tracks from Spotify API in batches of 50
async function fetchAllSpotifyTracks(allIds: string[]): Promise<SpotifyTrack[]> {
  const batchSize = 50;
  const batches: string[][] = [];
  for (let i = 0; i < allIds.length; i += batchSize) {
    batches.push(allIds.slice(i, i + batchSize));
  }
  const trackArrays: SpotifyTrack[][] = await Promise.all(
    batches.map(async (ids) => {
      const response = await Spicetify.CosmosAsync.get(
        `https://api.spotify.com/v1/tracks?ids=${ids.join(",")}`
      );
      return response.tracks && Array.isArray(response.tracks)
        ? response.tracks
        : [];
    })
  );
  return trackArrays.flat();
}

// Sort array of objects by view_count descending
function sortByViewsDesc<T extends { view_count?: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
}

// ----- Skeleton Loader Components -----
function ProfileSkeleton({ hasProfileBanner }: { hasProfileBanner: boolean }) {
  return (
    <div
      className={
        "ttml-profile-container ttml-profile-root-sort-of-skeleton" +
        (hasProfileBanner ? " ttml-profile-container-has-banner" : "")
      }
    >
      <div className="slm w-60 h-92 hidden-modal-header-style"></div>
      <div className="ttml-profile-header-styled profile-skeleton-header">
        {hasProfileBanner && (
          <div className="ttml-profile-banner-skeleton skeleton"></div>
        )}
        <div className="ttml-profile-avatar-container-styled">
          <div className="ttml-profile-avatar-skeleton skeleton"></div>
        </div>
        <div className="ttml-profile-meta-styled">
          <div className="ttml-profile-displayname-skeleton skeleton"></div>
          <div className="ttml-profile-username-skeleton skeleton"></div>
        </div>
      </div>
      <div className="ttml-profile-columns">
        <div className="ttml-profile-section ttml-profile-column ttml-profile-column-wide">
          <div className="ttml-profile-columns-display-top">
            <div className="ttml-profile-title-skeleton skeleton"></div>
            <div className="ttml-profile-length-skeleton skeleton"></div>
          </div>
          <div
            className="ttml-profile-songlist"
            style={{
              maxHeight: "100%",
              overflowY: "auto",
              minWidth: 0,
            }}
          >
            {[...Array(15)].map((_, i) => (
              <SongRowSkeleton key={i} />
            ))}
          </div>
        </div>
        <div className="ttml-profile-section ttml-profile-column ttml-profile-column-wide">
          <div className="ttml-profile-columns-display-top">
            <div className="ttml-profile-title-skeleton skeleton"></div>
            <div className="ttml-profile-length-skeleton skeleton"></div>
          </div>
          <div
            className="ttml-profile-songlist"
            style={{
              maxHeight: "100%",
              overflowY: "auto",
              minWidth: 0,
            }}
          >
            {[...Array(15)].map((_, i) => (
              <SongRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SongRowSkeleton() {
  return (
    <div className="ttml-profile-songrow ttml-profile-songrow-skeleton">
      <div className="ttml-profile-songart-skeleton skeleton"></div>
      <div className="ttml-profile-songinfo">
        <div className="ttml-profile-songname-skeleton skeleton"></div>
        <div className="ttml-profile-songartist-skeleton skeleton"></div>
      </div>
      <div className="ttml-profile-songlink-skeleton skeleton"></div>
    </div>
  );
}

// Main Profile Display
export default function ProfileDisplay({ userId, hasProfileBanner }: ProfileDisplayProps) {
  // Query the profile data
  const userQuery = useQuery<TTMLProfileResponse, Error>({
    queryKey: ["ttml-user-query", userId],
    queryFn: async () => {
      const req = await SendJob([
        {
          handler: "ttmlProfile",
          args: {
            userId,
            referrer: "lyricsCreditsView",
          },
        },
      ]);
      const profile = req.get("ttmlProfile");
      if (profile === undefined)
        throw new Error("ttmlProfile not found in response");
      if (profile.status !== 200)
        throw new Error(`ttmlProfile returned status ${profile.status}`);
      if (profile.type !== "json")
        throw new Error(
          `ttmlProfile returned type ${profile.type}, expected json`
        );
      if (!profile.responseData)
        throw new Error("ttmlProfile responseData is missing");
      return profile.responseData;
    },
    retry: 500,
  });

  // Defensive: normalize makes and uploads so both have view_count property
  const perUser: TTMLProfileUserList = userQuery.data?.perUser ?? {
    uploads: [],
    makes: [],
  };
  // Normalize "makes"
  const normalizedMakes = (perUser.makes ?? []).map((item) => ({
    id: item.id,
    view_count: typeof item.views_count === "number" ? item.views_count : 0,
  }));
  // Normalize "uploads"
  const normalizedUploads = (perUser.uploads ?? []).map((item) => ({
    id: item.id,
    view_count: typeof item.view_count === "number" ? item.view_count : 0,
  }));

  // Sort by view_count descending for UI display
  const sortedMakes = sortByViewsDesc(normalizedMakes);
  const sortedUploads = sortByViewsDesc(normalizedUploads);

  // Filter to only valid tracks for display, but keep view_count for render
  const sortedValidMakes = sortedMakes.filter(item =>
    validTrackIds([item.id]).length > 0
  );
  const sortedValidUploads = sortedUploads.filter(item =>
    validTrackIds([item.id]).length > 0
  );

  // Build a sorted, unique track ID list for *queryKey* (do not change order unless actual IDs change!)
  const allIds: string[] = React.useMemo(() => {
    const uniqSet = new Set<string>();
    [...normalizedMakes, ...normalizedUploads].forEach(({id}) => {
      validTrackIds([id]).forEach((vId) => uniqSet.add(vId));
    });
    return Array.from(uniqSet).sort();
  }, [perUser.makes, perUser.uploads]); // dependency: only changes if IDs list changes

  // Fetch tracks: will only re-run if real track IDs change!
  const tracksQuery = useQuery<SpotifyTrack[], Error>({
    queryKey: ["spotify-tracks", allIds],
    queryFn: () =>
      allIds.length > 0 ? fetchAllSpotifyTracks(allIds) : Promise.resolve([]),
    enabled: userQuery.isSuccess && allIds.length > 0,
    retry: 500,
    staleTime: 120 * 60 * 1000,
  });

  // Build track lookup
  const trackMap = React.useMemo(() => {
    const map = new Map<string, SpotifyTrack>();
    tracksQuery.data?.forEach((t) => t?.id && map.set(t.id, t));
    return map;
  }, [tracksQuery.data]);

  const profile: TTMLProfileData = userQuery.data?.profile || {};

  React.useEffect(() => {
    if (profile?.data?.banner) {
      const modalContainer = document.querySelector(
        ".GenericModal .main-embedWidgetGenerator-container:has(.ttml-profile-container .ttml-profile-banner-styled)"
      ) as HTMLElement | null;
      if (modalContainer) {
        modalContainer.style.setProperty("--banner-url-bg", `url(${String(profile.data.banner)})`);
      }
    }
  }, [profile?.data?.banner]);

  if (userQuery.isLoading) {
    // Skeleton loader for profile + tracks
    return <ProfileSkeleton hasProfileBanner={hasProfileBanner} />;
  }
  if (userQuery.isError) {
    return (
      <div className="ttml-profile-error">
        <div>
          Error:{" "}
          {userQuery.error instanceof Error
            ? userQuery.error.message
            : String(userQuery.error)}
        </div>
      </div>
    );
  }

  // Render helper
  function renderTrackList(items: {id: string, view_count?: number}[], listKey: string) {
    if (tracksQuery.isLoading)
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[...Array(Math.max(items.length, 15))].map((_, i) => (
            <SongRowSkeleton key={i} />
          ))}
        </div>
      );
    if (tracksQuery.isError)
      return <div>Error loading songs: {tracksQuery.error?.message}</div>;
    if (items.length === 0) {
      return <div className="ttml-profile-song-missing">No songs found.</div>;
    }
    return items.map(({id}) =>
      // @ts-ignore
      <SongRow key={`${listKey}-${id}`} trackId={id} trackMap={trackMap} />
    );
  }

  return (
    <div className={`ttml-profile-container ${tracksQuery.isLoading ? "ttml-profile-root-sort-of-skeleton" : ""}`}>
      <div className="slm w-60 h-92 hidden-modal-header-style"></div>
      {/* Banner/Profile Layout */}
      <div className="ttml-profile-header-styled">
        {profile?.data?.banner && (
          <img
            src={profile.data.banner}
            className="ttml-profile-banner-styled"
            alt="Banner"
          />
        )}
        <div className="ttml-profile-avatar-container-styled">
          <img
            src={profile?.data?.avatar}
            className="ttml-profile-avatar-styled"
            alt="Avatar"
          />
        </div>
        <div className="ttml-profile-meta-styled">
          <div className="ttml-profile-displayname-styled">
            {profile?.data?.displayName}
          </div>
          <div className="ttml-profile-username-styled">
            {profile?.data?.username}{" "}
            <span className="ttml-profile-id-styled">
              ({profile?.data?.id})
            </span>
          </div>
        </div>
      </div>
      {/* Two-column Song Layout */}
      <div className="ttml-profile-columns">
        {profile.type !== "uploader" ? (
          <div className="ttml-profile-section ttml-profile-column ttml-profile-column-wide">
            <div className="ttml-profile-columns-display-top">
              <h3>Makes</h3>
              <span className="ttml-profile-columns-display-subtext-length-count">
                ({sortedValidMakes.length})
              </span>
            </div>
            <div
              className="ttml-profile-songlist"
              style={{ maxHeight: "100%", overflowY: "auto", minWidth: 0 }}
            >
              {renderTrackList(sortedValidMakes, "makes")}
            </div>
          </div>
        ) : null}
        {profile.type !== "maker" ? (
          <div className="ttml-profile-section ttml-profile-column ttml-profile-column-wide">
            <div className="ttml-profile-columns-display-top">
              <h3>Uploads</h3>
              <span className="ttml-profile-columns-display-subtext-length-count">
                ({sortedValidUploads.length})
              </span>
            </div>
            <div
              className="ttml-profile-songlist"
              style={{ maxHeight: "100%", overflowY: "auto", minWidth: 0 }}
            >
              {renderTrackList(sortedValidUploads, "uploads")}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ----- SongRow -----
function SongRow({ trackId, trackMap }: SongRowProps) {
  const track = trackMap.get(trackId);
  if (!track)
    return (
      <div className="ttml-profile-song-missing">Unknown Song ({trackId})</div>
    );
  return (
    <div className="ttml-profile-songrow">
      <img
        src={
          track.album?.images && track.album.images.length > 0
            ? track.album.images.reduce((minImg, img) =>
                img.width < minImg.width ? img : minImg
              ).url
            : undefined
        }
        alt={track.name}
        className="ttml-profile-songart"
      />
      <div className="ttml-profile-songinfo">
        <div className="ttml-profile-songname">{track.name}</div>
        <div className="ttml-profile-songartist">
          {track.artists.map((a) => a.name).join(", ")}
        </div>
      </div>
      <a
        onClick={() => {
          const uri = `spotify:track:${trackId}`;
          if (Spicetify.URI.isTrack(uri)) {
            Spicetify.Player.playUri(uri);
            Spicetify.PopupModal.hide();
          }
        }}
        target="_blank"
        rel="noopener noreferrer"
        className="ttml-profile-songlink"
      >
        Listen
      </a>
    </div>
  );
}
