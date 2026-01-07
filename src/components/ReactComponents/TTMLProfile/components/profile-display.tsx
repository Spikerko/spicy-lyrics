import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Query } from "../../../../utils/API/Query.ts";
import { Spicetify } from "@spicetify/bundler";
import { PopupModal } from "../../../Modal.ts";

// ErrorBoundary wrapper for safest rendering
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    // @ts-ignore aaa
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    // @ts-ignore aaa
    if (this.state.error) {
      return (
        <div style={{ color: "red" }}>
          Error: {String((this as any).state.error)}
        </div>
      );
    }
    // @ts-ignore aaa
    return this.props.children;
  }
}

// Types (unchanged)
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
    interfaceContent?: any;
  };
  type?: "maker" | "uploader" | "mixed";
};
type TTMLProfileUserList = {
  makes: { id: string; view_count?: number }[];
  uploads: { id: string; view_count?: number }[];
};
type TTMLProfileResponse = {
  profile?: TTMLProfileData;
  perUser?: TTMLProfileUserList;
};
type SongRowProps = { trackId: string; trackMap: Map<string, SpotifyTrack> };
type ProfileDisplayProps = { userId: string; hasProfileBanner: boolean };

/**
 * Converts a hex color string (e.g. "#ff00aa" or "#f0a") to an RGB array [r, g, b].
 * Returns null if the input is invalid.
 * @param hex string hex color
 */
function hexToRgb(hex: string, cssFormat: boolean = false): string | [number, number, number] | null {
  if (typeof hex !== "string") return null;
  let cleanHex = hex.trim().replace(/^#/, "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
    return null;
  }
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return (cssFormat ? `${r}, ${g}, ${b}` : [r, g, b]);
}


// Utility to filter valid track IDs
function validTrackIds(ids: string[]): string[] {
  const base62Regex = /^[0-9A-Za-z]+$/;
  return ids.filter(
    (id) => base62Regex.test(id) && Spicetify.URI.isTrack(`spotify:track:${id}`)
  );
}

// Fetch tracks from Spotify API in batches of 50 (unchanged)
async function fetchAllSpotifyTracks(
  userId: string
): Promise<any> {
  const data = await Query([
    {
      operation: "ttmlProfileTracks",
      variables: { userId },
    },
  ])
  return data.get("0").data;
}

// Sort by view_count descending
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
function ProfileDisplaySafe({ userId, hasProfileBanner }: ProfileDisplayProps) {
  const userQuery = useQuery<TTMLProfileResponse, Error>({
    queryKey: ["ttml-user-query", userId],
    queryFn: async () => {
      const req = await Query([
        {
          operation: "ttmlProfile",
          variables: { userId, referrer: "lyricsCreditsView" },
        },
      ]);
      const profile = req.get("0");
      if (!profile) throw new Error("ttmlProfile not found in response");
      if (profile.httpStatus !== 200)
        throw new Error(`ttmlProfile returned status ${profile.httpStatus}`);
      if (profile.format !== "json")
        throw new Error(
          `ttmlProfile returned type ${profile.format}, expected json`
        );
      if (!profile.data)
        throw new Error("ttmlProfile responseData is missing");
      if (!profile.data?.profile?.data)
        throw Object.assign(new Error("ttmlProfile doesn't exist"), {
          noRetry: true,
        });
      return profile.data;
    },
    // deno-lint-ignore no-explicit-any
    retry(failureCount, error: any) {
      // If error has noRetry, do not retry
      if (error && error.noRetry) return false;
      return failureCount < 3;
    },
  });

  // Defensive normalization
  const perUser: TTMLProfileUserList = userQuery.data?.perUser ?? {
    uploads: [],
    makes: [],
  };
  const normalizedMakes = (perUser.makes ?? [])
    .map((item) => ({
      id: item.id ?? "",
      view_count: typeof item.view_count === "number" ? item.view_count : 0,
    }))
    .filter((item) => item.id);
  const normalizedUploads = (perUser.uploads ?? [])
    .map((item) => ({
      id: item.id ?? "",
      view_count: typeof item.view_count === "number" ? item.view_count : 0,
    }))
    .filter((item) => item.id);

  // Sort by view_count descending for UI display
  const sortedMakes = sortByViewsDesc(normalizedMakes);
  const sortedUploads = sortByViewsDesc(normalizedUploads);

  const sortedValidMakes = sortedMakes.filter(
    (item) => validTrackIds([item.id]).length > 0
  );
  const sortedValidUploads = sortedUploads.filter(
    (item) => validTrackIds([item.id]).length > 0
  );

  const allIds: string[] = React.useMemo(() => {
    const uniqSet = new Set<string>();
    [...normalizedMakes, ...normalizedUploads].forEach(({ id }) => {
      validTrackIds([id]).forEach((vId) => uniqSet.add(vId));
    });
    return Array.from(uniqSet).sort();
  }, [perUser.makes, perUser.uploads]);

  const tracksQuery = useQuery<any, Error>({
    queryKey: ["spotify-tracks", userId],
    queryFn: () => fetchAllSpotifyTracks(userId),
    enabled: userQuery.isSuccess && allIds.length > 0,
    retry: 3,
    staleTime: 120 * 60 * 1000,
  });

  const trackMap = React.useMemo(() => {
    const map = new Map<string, any>();
    (tracksQuery.data?.data ?? []).forEach((t) => t && t.id && map.set(t.id, t));
    return map;
  }, [tracksQuery.data]);

  const profile: TTMLProfileData = userQuery.data?.profile || {};

  /* React.useEffect(() => {
    if (profile?.data?.banner) {
      const modalContainer = document.querySelector<HTMLElement>(
        ".GenericModal .main-embedWidgetGenerator-container:has(.ttml-profile-container .ttml-profile-banner-styled)"
      );
      if (modalContainer && typeof profile.data.banner === "string") {
        modalContainer.style.setProperty("--banner-url-bg", `url(${profile.data.banner})`);
      }
    }
  }, [profile?.data?.banner]); */

  if (userQuery.isLoading) {
    return <ProfileSkeleton hasProfileBanner={hasProfileBanner} />;
  }
  if (userQuery.isError) {
    return (
      <div className="ttml-profile-error">
        Error:{" "}
        {userQuery.error instanceof Error
          ? userQuery.error.message
          : String(userQuery.error)}
      </div>
    );
  }

  // Helper for rendering track lists
  function renderTrackList(
    items: { id: string; view_count?: number }[],
    listKey: string
  ) {
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
    if (!Array.isArray(items) || items.length === 0) {
      return <div className="ttml-profile-song-missing">No songs found.</div>;
    }
    return items.map(({ id }) => (
      // @ts-ignore aaa
      <SongRowSafe key={`${listKey}-${id}`} trackId={id} trackMap={trackMap} />
    ));
  }

  const userPronouns = profile?.data?.interfaceContent?.profileDetails?.pronouns;

  return (
    <>
      <div className="fixed-node-container">
        <div
          className={`profile-point ${
            typeof profile?.data?.banner === "string" && profile.data.banner
              ? "type-banner"
              : "type-generic"
          }`}
        >
          {typeof profile?.data?.banner === "string" && profile.data.banner && (
            <img
              src={profile.data.banner}
              className="profile-point-banner"
              alt="Banner"
            />
          )}
        </div>
      </div>
      <div
        className={`ttml-profile-container${
          tracksQuery.isLoading ? " ttml-profile-root-sort-of-skeleton" : ""
        }${profile?.data?.interfaceContent?.color_config?.type ?
            ` profile-bg-type-${profile?.data?.interfaceContent?.color_config?.type}` : ""
        }`}
        
        style={
          (profile?.data?.interfaceContent?.color_config?.type === "gradient" ? {
            "--from-color": hexToRgb(profile?.data?.interfaceContent?.color_config?.color?.from ?? `#000000`, true),
            "--to-color": hexToRgb(profile?.data?.interfaceContent?.color_config?.color?.to ?? `#000000`, true),
            "--bg-rotation": profile?.data?.interfaceContent?.color_config?.color?.rotation ?? "156deg",
          } : profile?.data?.interfaceContent?.color_config?.type === "static" ? {
            "--target-color": hexToRgb(profile?.data?.interfaceContent?.color_config?.color?.target ?? `#000000`, true),
          } : {})
        }
      >
        <div className="slm w-60 h-92 hidden-modal-header-style scroll-x-hidden"></div>

        <div
          className="modal-controls"
        >
          <div className="controls-close-modal">
            <button
              type="button"
              aria-label="Close"
              className="main-trackCreditsModal-closeBtn"
              onClick={() => PopupModal.hide()}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 32 32"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Close</title>
                <path
                  d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143"
                  fill="currentColor"
                  fillRule="evenodd"
                ></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Banner/Profile */}
        <div className="ttml-profile-header-styled">
          {typeof profile?.data?.banner === "string" && profile.data.banner && (
            <img
              src={profile.data.banner}
              className="ttml-profile-banner-styled"
              alt="Banner"
            />
          )}
          <div className="ttml-profile-avatar-container-styled">
            {typeof profile?.data?.avatar === "string" &&
              profile.data.avatar && (
                <img
                  src={profile.data.avatar}
                  className="ttml-profile-avatar-styled"
                  alt="Avatar"
                />
              )}
          </div>
          <div className="ttml-profile-meta-styled">
            <div className="ttml-profile-displayname-styled">
              {profile?.data?.displayName ?? ""}
            </div>
            <div className="ttml-profile-username-styled">
              {profile?.data?.username ?? ""}
              {/* <span className="ttml-profile-id-styled">
                ({profile?.data?.id ?? ""})
              </span> */}

              {userPronouns ? (
                <>
                  <span className="_dotSpacer_"></span>
                  <span className="ttml-profile-pronouns-styled">
                    {userPronouns}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {/* Song Lists */}
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
    </>
  );
}

// Safe SongRow rendering
function SongRowSafe({ trackId, trackMap }: SongRowProps) {
  const track = trackMap.get(trackId);
  if (!track)
    return (
      <div className="ttml-profile-song-missing">Unknown Song ({trackId})</div>
    );
  const albumImages = track.album?.images ?? [];
  const imageSrc =
    albumImages.length > 0
      ? albumImages.reduce((minImg, img) =>
          typeof img.width === "number" &&
          typeof minImg.width === "number" &&
          img.width < minImg.width
            ? img
            : minImg
        ).url
      : undefined;
  return (
    <div className="ttml-profile-songrow">
      {imageSrc ? (
        <img src={imageSrc} alt={track.name} className="ttml-profile-songart" />
      ) : (
        <div className="ttml-profile-songart-skeleton skeleton"></div>
      )}
      <div className="ttml-profile-songinfo">
        <div className="ttml-profile-songname">
          {track.name ?? "Unknown song name"}
        </div>
        <div className="ttml-profile-songartist">
          {Array.isArray(track.artists)
            ? track.artists.map((a) => a?.name ?? "Unknown").join(", ")
            : "Unknown"}
        </div>
      </div>
      <a
        onClick={() => {
          const uri = `spotify:track:${trackId}`;
          if (Spicetify.URI.isTrack(uri)) {
            Spicetify.Player.playUri(uri);
            PopupModal.hide?.();
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

// Export wrapped with error boundary for safety
const ProfileDisplayExport = (props: ProfileDisplayProps) => (
  <ErrorBoundary>
    <ProfileDisplaySafe {...props} />
  </ErrorBoundary>
);
export default ProfileDisplayExport;
