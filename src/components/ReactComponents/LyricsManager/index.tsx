import React, { useState } from "react";
import { toast } from "sonner";
import { useLyricsDB } from "./hooks/useLyricsDB";
import { useTracks } from "./hooks/useTracks";
import { useCurrentUri } from "./hooks/useCurrentUri";
import { SearchBar } from "./components/SearchBar";
import { TrackRow } from "./components/TrackRow";
import { IconButton } from "./components/IconButton";
import { UploadIcon, ResetIcon } from "./components/Icons";
import { SpotifyPlayer } from "../../Global/SpotifyPlayer";
import fetchLyrics from "../../../utils/Lyrics/fetchLyrics";
import ApplyLyrics from "../../../utils/Lyrics/Global/Applyer";
import { $currentLyricsData } from "../../../utils/stores";

type LyricsDBPanelProps = {
  onUploadClick: () => void;
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- .]/g, "_").slice(0, 100);
}

export default function LyricsDBPanel({ onUploadClick }: LyricsDBPanelProps) {
  const [query, setQuery] = useState("");
  const { uris, loading: dbLoading, remove, getRaw } = useLyricsDB();
  const { tracksByUri, loading: tracksLoading } = useTracks(uris);
  const currentUri = useCurrentUri();

  const loading = dbLoading || (uris.length > 0 && tracksLoading && tracksByUri.size === 0);

  function matchesQuery(uri: string): boolean {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    const track = tracksByUri.get(uri);
    if (track) {
      if (track.name.toLowerCase().includes(q)) return true;
      if (track.artists.some((a) => a.name.toLowerCase().includes(q))) return true;
    }
    return uri.toLowerCase().includes(q);
  }

  const filtered = uris.filter(matchesQuery);

  async function handleDownload(uri: string) {
    const ttml = await getRaw(uri);
    if (!ttml) {
      toast.error("Could not retrieve TTML for this track.", { duration: 4000 });
      return;
    }
    const track = tracksByUri.get(uri);
    const filename = track
      ? `${sanitizeFilename(track.name)}.ttml`
      : `${sanitizeFilename(uri)}.ttml`;
    const blob = new Blob([ttml], { type: "application/ttml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(uri: string) {
    try {
      await remove(uri);
      toast.success("Removed from Local DB.", { duration: 3000 });
    } catch {
      toast.error("Failed to remove entry.", { duration: 4000 });
    }
  }

  function handlePlay(uri: string) {
    Spicetify.Player.playUri(uri);
  }

  function handleResetTTML() {
    const uri = SpotifyPlayer.GetUri();
    if (!uri) {
      toast.error("No track is currently playing.", { duration: 4000 });
      return;
    }
    $currentLyricsData.set("");
    toast("TTML has been reset.", { duration: 4000 });
    setTimeout(() => {
      fetchLyrics(uri)
        .then(ApplyLyrics)
        .catch((err) => {
          toast.error("Error applying lyrics", { duration: 4000 });
          console.error("Error applying lyrics:", err);
        });
    }, 25);
  }

  return (
    <div className="sl-ldb-root">
      <div className="sl-ldb-toolbar">
        <SearchBar value={query} onChange={setQuery} placeholder="Search saved lyrics…" />
        <IconButton
          icon={<ResetIcon size={14} />}
          label="Reset TTML"
          variant="danger"
          onClick={handleResetTTML}
          title="Clear loaded TTML for the currently playing song"
        />
        <IconButton
          icon={<UploadIcon size={14} />}
          label="Upload TTML"
          variant="primary"
          onClick={onUploadClick}
        />
      </div>

      <div className="sl-ldb-list">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <TrackRow
              key={i}
              uri=""
              track={null}
              loading={true}
              onPlay={() => {}}
              onDownload={() => {}}
              onDelete={() => {}}
            />
          ))
        ) : filtered.length === 0 ? (
          <div className="sl-ldb-empty">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M20 8v14M20 27.5v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="20" cy="20" r="16.5" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <p>{query.trim() ? "No matching entries" : "No lyrics saved yet"}</p>
          </div>
        ) : (
          filtered.map((uri) => (
            <TrackRow
              key={uri}
              uri={uri}
              track={tracksByUri.get(uri) ?? null}
              loading={tracksLoading}
              isCurrentlyPlaying={uri === currentUri}
              onPlay={() => handlePlay(uri)}
              onDownload={() => handleDownload(uri)}
              onDelete={() => handleDelete(uri)}
            />
          ))
        )}
      </div>
    </div>
  );
}
