import React, { useState } from "react";
import type { ProcessedTrack } from "../utils/getTracks";
import { IconButton } from "./IconButton";
import { PlayIcon, TrashIcon, DownloadIcon } from "./Icons";

function spotifyImageUriToUrl(uri: string): string {
  if (uri.startsWith("spotify:image:")) {
    const id = uri.slice("spotify:image:".length);
    return `https://i.scdn.co/image/${id}`;
  }
  return uri;
}

function pickCoverUrl(track: ProcessedTrack): string {
  const preferred = ["small", "standard", "large", "xlarge"];
  for (const size of preferred) {
    const art = track.coverArt.find((c) => c.size === size);
    if (art) return spotifyImageUriToUrl(art.uri);
  }
  if (track.coverArt.length > 0) return spotifyImageUriToUrl(track.coverArt[0].uri);
  return "https://images.spikerko.org/SongPlaceholderFull.png";
}

type TrackRowProps = {
  uri: string;
  track: ProcessedTrack | null;
  loading: boolean;
  isCurrentlyPlaying?: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

export function TrackRow({ uri, track, loading, isCurrentlyPlaying, onPlay, onDownload, onDelete }: TrackRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  if (track == null && loading) {
    return (
      <div className="sl-ldb-row sl-ldb-row--skeleton">
        <div className="sl-ldb-row__cover sl-ldb-skeleton" />
        <div className="sl-ldb-row__info">
          <div className="sl-ldb-skeleton sl-ldb-skeleton--title" />
          <div className="sl-ldb-skeleton sl-ldb-skeleton--artist" />
        </div>
        <div className="sl-ldb-row__actions" />
      </div>
    );
  }

  const title = track?.name ?? uri;
  const artists = track ? track.artists.map((a) => a.name).join(", ") : "";
  const coverUrl = track ? pickCoverUrl(track) : "https://images.spikerko.org/SongPlaceholderFull.png";

  return (
    <div className={`sl-ldb-row${isCurrentlyPlaying ? " sl-ldb-row--playing" : ""}`}>
      <img
        className="sl-ldb-row__cover"
        src={coverUrl}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = "https://images.spikerko.org/SongPlaceholderFull.png";
        }}
      />
      <div className="sl-ldb-row__info">
        <div className="sl-ldb-row__title-row">
          {isCurrentlyPlaying && (
            <span
              className="sl-ldb-row__playing-dot"
              role="img"
              aria-label="Currently playing"
              title="Currently playing"
            />
          )}
          <span className="sl-ldb-row__title" title={title}>{title}</span>
        </div>
        {artists && <span className="sl-ldb-row__artists" title={artists}>{artists}</span>}
      </div>
      <div className="sl-ldb-row__actions">
        <IconButton icon={<PlayIcon size={14} />} onClick={onPlay} title="Play" variant="default" />
        <IconButton icon={<DownloadIcon size={14} />} onClick={onDownload} title="Download TTML" variant="default" />
        <IconButton
          icon={<TrashIcon size={14} />}
          onClick={handleDeleteClick}
          title={confirmDelete ? "Confirm delete" : "Delete"}
          variant={confirmDelete ? "danger" : "default"}
          label={confirmDelete ? "Confirm" : undefined}
        />
      </div>
    </div>
  );
}
