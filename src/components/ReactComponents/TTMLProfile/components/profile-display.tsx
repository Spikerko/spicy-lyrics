import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Query } from "../../../../utils/API/Query.ts";
import { Spicetify } from "@spicetify/bundler";
import { PopupModal } from "../../../Modal.ts";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    // @ts-ignore
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    // @ts-ignore
    if (this.state.error) {
      return <div className="ttml-profile-error">Error: {String((this as any).state.error)}</div>;
    }
    // @ts-ignore
    return this.props.children;
  }
}

type SpotifyImage = { url: string; height: number | null; width: number | null };
type SpotifyArtist = { id: string; name: string; uri: string; [key: string]: any };
type SpotifyAlbum = { id: string; name: string; images: SpotifyImage[]; release_date: string; [key: string]: any };
type SpotifyTrack = { id: string; name: string; artists: SpotifyArtist[]; album: SpotifyAlbum; uri: string; [key: string]: any };
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
type TTMLProfileResponse = { profile?: TTMLProfileData; perUser?: TTMLProfileUserList };
type SongRowProps = { trackId: string; trackMap: Map<string, SpotifyTrack>; viewCount?: number };
type ProfileDisplayProps = { userId: string; hasProfileBanner: boolean };
type Connection = { type: string; url: string };
type TrackItem = { id: string; view_count: number };

// ─── Deduplication helpers ───

const VARIANT_RE = /\b(remaster(?:ed)?|remix|version|edit|live|acoustic|extended|mono|stereo|mix|deluxe|demo|radio)\b/i;

function normalizeTitle(title: string): string {
  let t = title.toLowerCase().trim().replace(/\s+/g, " ");
  for (let i = 0; i < 5; i++) {
    const prev = t;
    // Strip: " - <suffix containing variant keyword>"
    t = t.replace(/\s+[-–—]\s+\(?[^)]*?\)?\s*$/i, (m) => VARIANT_RE.test(m) ? "" : m).trim();
    // Strip: " (<suffix containing variant keyword>)" or " [...]"
    t = t.replace(/\s+[\(\[][^\)\]]*[\)\]]\s*$/i, (m) => VARIANT_RE.test(m) ? "" : m).trim();
    if (t === prev) break;
  }
  return t;
}

function artistsMatch(a: SpotifyArtist[], b: SpotifyArtist[]): boolean {
  const normA = new Set(a.map((x) => x.name.toLowerCase().trim()));
  const normB = new Set(b.map((x) => x.name.toLowerCase().trim()));
  const [smaller, larger] = normA.size <= normB.size ? [normA, normB] : [normB, normA];
  for (const artist of smaller) {
    if (!larger.has(artist)) return false;
  }
  return larger.size - smaller.size <= 3;
}

function songsMatch(a: SpotifyTrack, b: SpotifyTrack): boolean {
  return normalizeTitle(a.name) === normalizeTitle(b.name) && artistsMatch(a.artists, b.artists);
}

function deduplicateSection(items: TrackItem[], trackMap: Map<string, SpotifyTrack>): TrackItem[] {
  const result: (TrackItem & { track: SpotifyTrack | null })[] = [];
  for (const item of items) {
    const track = trackMap.get(item.id) ?? null;
    if (track) {
      const existing = result.find((r) => r.track && songsMatch(track, r.track));
      if (existing) {
        existing.view_count += item.view_count;
        continue;
      }
    }
    result.push({ ...item, track });
  }
  return result.map(({ id, view_count }) => ({ id, view_count }));
}

function crossSectionDedup(
  makes: TrackItem[],
  uploads: TrackItem[],
  trackMap: Map<string, SpotifyTrack>
): { makes: TrackItem[]; uploads: TrackItem[] } {
  const finalMakes = makes.map((m) => ({ ...m }));
  const finalUploads: TrackItem[] = [];
  for (const upload of uploads) {
    const uploadTrack = trackMap.get(upload.id) ?? null;
    if (uploadTrack) {
      const makeIdx = finalMakes.findIndex((m) => {
        const mt = trackMap.get(m.id);
        return mt && songsMatch(uploadTrack, mt);
      });
      if (makeIdx >= 0) {
        finalMakes[makeIdx].view_count += upload.view_count;
        continue;
      }
    }
    finalUploads.push({ ...upload });
  }
  return { makes: finalMakes, uploads: finalUploads };
}

// ─── Misc helpers ───

function hexToRgb(hex: string, cssFormat: boolean = false): string | [number, number, number] | null {
  if (typeof hex !== "string") return null;
  let cleanHex = hex.trim().replace(/^#/, "");
  if (cleanHex.length === 3) cleanHex = cleanHex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) return null;
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return cssFormat ? `${r}, ${g}, ${b}` : [r, g, b];
}

function validTrackIds(ids: string[]): string[] {
  const base62Regex = /^[0-9A-Za-z]+$/;
  return ids.filter((id) => base62Regex.test(id) && Spicetify.URI.isTrack(`spotify:track:${id}`));
}

async function fetchAllSpotifyTracks(userId: string): Promise<any> {
  const data = await Query([{ operation: "ttmlProfileTracks", variables: { userId } }]);
  return data.get("0").data;
}

function sortByViewsDesc<T extends { view_count?: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
}

// ─── Connection icons ───

function ConnectionIcon({ type }: { type: string }) {
  switch (type.toLowerCase()) {
    case "genius":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" role="img" fill="currentColor">
          <path d="M12.897 1.235c-.36.001-.722.013-1.08.017-.218-.028-.371.225-.352.416-.035 1.012.023 2.025-.016 3.036-.037.841-.555 1.596-1.224 2.08-.5.345-1.118.435-1.671.663.121.78.434 1.556 1.057 2.07 1.189 1.053 3.224.86 4.17-.426.945-1.071.453-2.573.603-3.854.286-.48.937-.132 1.317-.49-.34-1.249-.81-2.529-1.725-3.472a11.125 11.125 0 00-1.08-.04zm-10.42.006C.53 2.992-.386 5.797.154 8.361c.384 2.052 1.682 3.893 3.45 4.997.134-.23.23-.476.09-.73-.95-2.814-.138-6.119 1.986-8.19.014-.986.043-1.976-.003-2.961l-.188-.214c-1.003-.051-2.008 0-3.01-.022zm17.88.055l-.205.356c.265.938.6 1.862.72 2.834.58 3.546-.402 7.313-2.614 10.14-1.816 2.353-4.441 4.074-7.334 4.773-2.66.66-5.514.45-8.064-.543-.068.079-.207.237-.275.318 2.664 2.629 6.543 3.969 10.259 3.498 3.075-.327 5.995-1.865 8.023-4.195 1.935-2.187 3.083-5.07 3.125-7.992.122-3.384-1.207-6.819-3.636-9.19z" />
        </svg>
      );
    case "spotify":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 496 512" fill="currentColor">
          <path d="M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8zm100.7 364.9c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 2.6-11.9 2.6-9.7 0-15.8-7.7-15.8-15.8 0-10.3 6.1-15.2 13.6-16.8 81.9-18.1 165.6-16.5 237 26.2 6.1 3.9 9.7 7.4 9.7 16.5s-7.1 15.4-15.2 15.4zm26.9-65.6c-5.2 0-8.7-2.3-12.3-4.2-62.5-37-155.7-51.9-238.6-29.4-4.8 1.3-7.4 2.6-11.9 2.6-10.7 0-19.4-8.7-19.4-19.4s5.2-17.8 15.5-20.7c27.8-7.8 56.2-13.6 97.8-13.6 64.9 0 127.6 16.1 177 45.5 8.1 4.8 11.3 11 11.3 19.7-.1 10.8-8.5 19.5-19.4 19.5zm31-76.2c-5.2 0-8.4-1.3-12.9-3.9-71.2-42.5-198.5-52.7-280.9-29.7-3.6 1-8.1 2.6-12.9 2.6-13.2 0-23.3-10.3-23.3-23.6 0-13.6 8.4-21.3 17.4-23.9 35.2-10.3 74.6-15.2 117.5-15.2 73 0 149.5 15.2 205.4 47.8 7.8 4.5 12.9 10.7 12.9 22.6 0 13.6-11 23.3-23.2 23.3z" />
        </svg>
      );
    case "twitter":
    case "x":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z" />
        </svg>
      );
    case "youtube":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8" />
          <path d="M10 9l5 3l-5 3l0 -6" />
        </svg>
      );
    default:
      return null;
  }
}

// ─── Skeleton ───

function ProfileSkeleton({ hasProfileBanner }: { hasProfileBanner: boolean }) {
  return (
    <div className={`ttml-profile-container ttml-profile-root-sort-of-skeleton${hasProfileBanner ? " ttml-profile-container-has-banner" : ""}`}>
      {hasProfileBanner && (
        <div className="ttml-profile-banner-wrapper">
          <div className="ttml-profile-banner-skeleton skeleton" style={{ width: "100%", height: "100%" }} />
        </div>
      )}
      <div className="ttml-profile-layout">
        <div className="ttml-profile-left">
          <div className="profile-skeleton-header">
            <div className="ttml-profile-avatar-container-styled">
              <div className="ttml-profile-avatar-skeleton skeleton" />
            </div>
            <div className="ttml-profile-meta-styled">
              <div className="ttml-profile-displayname-skeleton skeleton" />
              <div className="ttml-profile-username-skeleton skeleton" />
            </div>
          </div>
        </div>
        <div className="ttml-profile-right">
          <div className="ttml-profile-content-viewport">
            <div className="ttml-profile-content-slide-panel ttml-profile-content-column">
              <div className="ttml-profile-section ttml-profile-column-wide">
                <div className="ttml-profile-columns-display-top">
                  <div className="ttml-profile-title-skeleton skeleton" />
                  <div className="ttml-profile-length-skeleton skeleton" />
                </div>
                <div className="ttml-profile-songlist">
                  {[...Array(12)].map((_, i) => <SongRowSkeleton key={i} />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SongRowSkeleton() {
  return (
    <div className="ttml-profile-songrow ttml-profile-songrow-skeleton">
      <div className="ttml-profile-songart-skeleton skeleton" />
      <div className="ttml-profile-songinfo">
        <div className="ttml-profile-songname-skeleton skeleton" />
        <div className="ttml-profile-songartist-skeleton skeleton" />
      </div>
      <div className="ttml-profile-songlink-skeleton skeleton" />
    </div>
  );
}

// ─── Main ───

function ProfileDisplaySafe({ userId, hasProfileBanner }: ProfileDisplayProps) {
  const [activeTab, setActiveTab] = React.useState<"makes" | "uploads">("makes");

  const userQuery = useQuery<TTMLProfileResponse, Error>({
    queryKey: ["ttml-user-query", userId],
    queryFn: async () => {
      const req = await Query([{ operation: "ttmlProfile", variables: { userId, referrer: "lyricsCreditsView" } }]);
      const profile = req.get("0");
      if (!profile) throw new Error("ttmlProfile not found in response");
      if (profile.httpStatus !== 200) throw new Error(`ttmlProfile returned status ${profile.httpStatus}`);
      if (profile.format !== "json") throw new Error(`ttmlProfile returned type ${profile.format}, expected json`);
      if (!profile.data) throw new Error("ttmlProfile responseData is missing");
      if (!profile.data?.profile?.data) throw Object.assign(new Error("ttmlProfile doesn't exist"), { noRetry: true });
      return profile.data;
    },
    // deno-lint-ignore no-explicit-any
    retry(failureCount, error: any) {
      if (error && error.noRetry) return false;
      return failureCount < 3;
    },
  });

  const perUser: TTMLProfileUserList = userQuery.data?.perUser ?? { uploads: [], makes: [] };

  const normalizedMakes: TrackItem[] = (perUser.makes ?? [])
    .map((item) => ({ id: item.id ?? "", view_count: typeof item.view_count === "number" ? item.view_count : 0 }))
    .filter((item) => item.id);
  const normalizedUploads: TrackItem[] = (perUser.uploads ?? [])
    .map((item) => ({ id: item.id ?? "", view_count: typeof item.view_count === "number" ? item.view_count : 0 }))
    .filter((item) => item.id);

  const sortedValidMakes = sortByViewsDesc(normalizedMakes).filter((item) => validTrackIds([item.id]).length > 0);
  const sortedValidUploads = sortByViewsDesc(normalizedUploads).filter((item) => validTrackIds([item.id]).length > 0);

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
    const map = new Map<string, SpotifyTrack>();
    (tracksQuery.data?.data ?? []).forEach((t: any) => t && t.id && map.set(t.id, t));
    return map;
  }, [tracksQuery.data]);

  // ── Deduplication ──
  const { dedupedMakes, dedupedUploads } = React.useMemo(() => {
    if (trackMap.size === 0) {
      return { dedupedMakes: sortedValidMakes, dedupedUploads: sortedValidUploads };
    }
    const dMakes = deduplicateSection(sortedValidMakes, trackMap);
    const dUploadsRaw = deduplicateSection(sortedValidUploads, trackMap);
    const { makes, uploads } = crossSectionDedup(dMakes, dUploadsRaw, trackMap);
    const byViewsDesc = (a: TrackItem, b: TrackItem) => (b.view_count ?? 0) - (a.view_count ?? 0);
    return { dedupedMakes: makes.sort(byViewsDesc), dedupedUploads: uploads.sort(byViewsDesc) };
  }, [trackMap, sortedValidMakes, sortedValidUploads]);

  const profile: TTMLProfileData = userQuery.data?.profile || {};
  const profileData = profile?.data;
  const userPronouns = profileData?.interfaceContent?.profileDetails?.pronouns;
  const colorConfig = profileData?.interfaceContent?.color_config;
  const connections: Connection[] = profileData?.interfaceContent?.connections ?? [];

  const showMakes = profile.type !== "uploader";
  const showUploads = profile.type !== "maker";
  const showBoth = showMakes && showUploads;

  const sliderOffset = showBoth && activeTab === "uploads" ? -100 : 0;

  const makesViews = React.useMemo(
    () => dedupedMakes.reduce((s, { view_count }) => s + (view_count ?? 0), 0),
    [dedupedMakes]
  );
  const uploadsViews = React.useMemo(
    () => dedupedUploads.reduce((s, { view_count }) => s + (view_count ?? 0), 0),
    [dedupedUploads]
  );

  function renderTrackList(items: TrackItem[], listKey: string) {
    if (tracksQuery.isLoading) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[...Array(Math.max(items.length, 12))].map((_, i) => <SongRowSkeleton key={i} />)}
        </div>
      );
    }
    if (tracksQuery.isError) return <div>Error loading songs: {tracksQuery.error?.message}</div>;
    if (!Array.isArray(items) || items.length === 0) {
      return <div className="ttml-profile-song-missing">No songs found.</div>;
    }
    return items.map(({ id, view_count }) => (
      // @ts-ignore
      <SongRowSafe key={`${listKey}-${id}`} trackId={id} trackMap={trackMap} viewCount={view_count} />
    ));
  }

  if (userQuery.isLoading) return <ProfileSkeleton hasProfileBanner={hasProfileBanner} />;
  if (userQuery.isError) {
    return (
      <div className="ttml-profile-error">
        Error: {userQuery.error instanceof Error ? userQuery.error.message : String(userQuery.error)}
      </div>
    );
  }

  const hasBanner = !!profileData?.banner;

  const containerClass = [
    "ttml-profile-container",
    hasBanner ? "ttml-profile-container-has-banner" : "",
    tracksQuery.isLoading ? "ttml-profile-root-sort-of-skeleton" : "",
    colorConfig?.type ? `profile-bg-type-${colorConfig.type}` : "",
  ].filter(Boolean).join(" ");

  const containerStyle: any = colorConfig?.type === "gradient"
    ? {
        "--from-color": hexToRgb(colorConfig.color?.from ?? "#000000", true),
        "--to-color": hexToRgb(colorConfig.color?.to ?? "#000000", true),
        "--bg-rotation": colorConfig.color?.rotation ?? "156deg",
      }
    : colorConfig?.type === "static"
    ? { "--target-color": hexToRgb(colorConfig.color?.target ?? "#000000", true) }
    : {};

  const usernameDisplay = userPronouns
    ? `${profileData?.username ?? ""} · ${userPronouns}`
    : (profileData?.username ?? "");

  return (
    <div className={containerClass} style={containerStyle}>

      {/* X button */}
      <div className="modal-controls">
        <div className="controls-close-modal">
          <button
            type="button"
            aria-label="Close"
            className="main-trackCreditsModal-closeBtn"
            onClick={() => PopupModal.hide()}
          >
            <svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <title>Close</title>
              <path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill="currentColor" fillRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Banner — full width, before layout */}
      {hasBanner && (
        <div className="ttml-profile-banner-wrapper" style={{ "--clip-percentage": "0%" } as React.CSSProperties}>
          <img src={profileData!.banner} className="ttml-profile-banner-styled" alt="" loading="lazy" />
        </div>
      )}

      <div className="ttml-profile-layout">

        {/* ── Left panel ── */}
        <div className="ttml-profile-left">

          <div className="ttml-profile-content-switch-sentinel" aria-hidden="true" />

          {showBoth && (
            <div className="ttml-profile-content-switch" role="tablist" aria-label="Content type">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "makes"}
                aria-controls="ttml-profile-content-panel"
                id="ttml-profile-tab-makes"
                className="ttml-profile-content-switch-tab"
                onClick={() => setActiveTab("makes")}
              >
                <span className="ttml-profile-content-switch-tab-label">Makes</span>
                <span className="ttml-profile-content-switch-tab-count" aria-label={`${dedupedMakes.length} valid tracks`}>
                  {dedupedMakes.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "uploads"}
                aria-controls="ttml-profile-content-panel"
                id="ttml-profile-tab-uploads"
                className="ttml-profile-content-switch-tab"
                onClick={() => setActiveTab("uploads")}
              >
                <span className="ttml-profile-content-switch-tab-label">Uploads</span>
                <span className="ttml-profile-content-switch-tab-count" aria-label={`${dedupedUploads.length} valid tracks`}>
                  {dedupedUploads.length}
                </span>
              </button>
            </div>
          )}

          <header className="ttml-profile-header-styled" role="banner" aria-label="Profile">
            <div className="ttml-profile-avatar-container-styled">
              {profileData?.avatar && (
                <img src={profileData.avatar} className="ttml-profile-avatar-styled" alt="Avatar" />
              )}
            </div>
            <div className="ttml-profile-meta-styled">
              <div className="ttml-profile-displayname-styled" title={profileData?.displayName ?? ""}>
                {profileData?.displayName ?? ""}
              </div>
              <div className="ttml-profile-username-styled" title={usernameDisplay}>
                {usernameDisplay}
              </div>
            </div>
            {connections.length > 0 && (
              <div className="ttml-profile-connections">
                {connections.map((conn) => {
                  const icon = <ConnectionIcon type={conn.type} />;
                  if (!icon) return null;
                  return (
                    <a
                      key={conn.type}
                      href={conn.url}
                      className="ttml-profile-connection-btn"
                      title={conn.type}
                      onClick={(e) => { e.preventDefault(); window.open(conn.url, "_blank"); }}
                    >
                      {icon}
                    </a>
                  );
                })}
              </div>
            )}
          </header>

          {(makesViews > 0 || uploadsViews > 0) && (
            <div className="ttml-profile-view-stats" aria-label="Total view counts">
              <div className="ttml-profile-view-stats-title-block">
                <span className="ttml-profile-view-stats-heading">Total views</span>
                <span className="ttml-profile-view-stats-subheading">Lifetime views across user's makes and uploads</span>
              </div>
              {showMakes && makesViews > 0 && (
                <div className="ttml-profile-view-stats-item" aria-label="Total views on makes">
                  <span className="ttml-profile-view-stats-label">Makes</span>
                  <span className="ttml-profile-view-stats-value">{makesViews.toLocaleString()}</span>
                </div>
              )}
              {showUploads && uploadsViews > 0 && (
                <div className="ttml-profile-view-stats-item" aria-label="Total views on uploads">
                  <span className="ttml-profile-view-stats-label">Uploads</span>
                  <span className={`ttml-profile-view-stats-value${uploadsViews >= 100000 ? " ttml-profile-view-stats-value--sm" : ""}`}>
                    {uploadsViews.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Right panel ── */}
        <div className="ttml-profile-right">
          <div id="ttml-profile-content-panel" className="ttml-profile-content-viewport" role="tabpanel" aria-label="Track lists">
            <div
              className="ttml-profile-content-slider"
              data-active={activeTab}
              style={{ transform: `translateX(${sliderOffset}%)` }}
            >

              {showMakes && (
                <section
                  className="ttml-profile-content-slide-panel ttml-profile-content-column"
                  aria-label="Makes"
                  aria-hidden={activeTab !== "makes"}
                >
                  <div className="ttml-profile-section ttml-profile-column-wide">
                    <div className="ttml-profile-columns-display-top">
                      <h3>Makes</h3>
                      <span className="ttml-profile-columns-display-subtext-length-count">({dedupedMakes.length})</span>
                    </div>
                    <div className="ttml-profile-songlist">
                      {renderTrackList(dedupedMakes, "makes")}
                    </div>
                  </div>
                </section>
              )}

              {showUploads && (
                <section
                  className="ttml-profile-content-slide-panel ttml-profile-content-column"
                  aria-label="Uploads"
                  aria-hidden={activeTab !== "uploads"}
                >
                  <div className="ttml-profile-section ttml-profile-column-wide">
                    <div className="ttml-profile-columns-display-top">
                      <h3>Uploads</h3>
                      <span className="ttml-profile-columns-display-subtext-length-count">({dedupedUploads.length})</span>
                    </div>
                    <div className="ttml-profile-songlist">
                      {renderTrackList(dedupedUploads, "uploads")}
                    </div>
                  </div>
                </section>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function SongRowSafe({ trackId, trackMap, viewCount }: SongRowProps) {
  const track = trackMap.get(trackId);
  if (!track) return <div className="ttml-profile-song-missing">Unknown Song ({trackId})</div>;

  const albumImages = track.album?.images ?? [];
  const imageSrc = albumImages.length > 0
    ? albumImages.reduce((minImg, img) =>
        typeof img.width === "number" && typeof minImg.width === "number" && img.width < minImg.width ? img : minImg
      ).url
    : undefined;

  return (
    <div className="ttml-profile-songrow">
      {imageSrc
        ? <img src={imageSrc} alt={track.name} className="ttml-profile-songart" />
        : <div className="ttml-profile-songart-skeleton skeleton" />
      }
      <div className="ttml-profile-songinfo">
        <div className="ttml-profile-songname">{track.name ?? "Unknown song name"}</div>
        <div className="ttml-profile-songartist">
          {Array.isArray(track.artists) ? track.artists.map((a) => a?.name ?? "Unknown").join(", ") : "Unknown"}
        </div>
      </div>
      {viewCount !== undefined && viewCount > 0 && (
        <span className="ttml-profile-songrow-viewcount" aria-label={`View count: ${viewCount.toLocaleString()}`}>
          <span className="ttml-profile-songrow-viewcount-value">{viewCount.toLocaleString()}</span>
          <span className="ttml-profile-songrow-viewcount-label">views</span>
        </span>
      )}
      <a
        onClick={() => {
          const uri = `spotify:track:${trackId}`;
          if (Spicetify.URI.isTrack(uri)) {
            Spicetify.Player.playUri(uri);
            PopupModal.hide?.();
          }
        }}
        className="ttml-profile-songlink flex items-center justify-center"
      >
        Listen
      </a>
    </div>
  );
}

const ProfileDisplayExport = (props: ProfileDisplayProps) => (
  <ErrorBoundary>
    <ProfileDisplaySafe {...props} />
  </ErrorBoundary>
);
export default ProfileDisplayExport;
