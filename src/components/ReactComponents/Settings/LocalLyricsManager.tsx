import { startTransition, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import fetchLyrics from "../../../utils/Lyrics/fetchLyrics.ts";
import ApplyLyrics from "../../../utils/Lyrics/Global/Applyer.ts";
import {
  clearLocalTTML,
  getAllLocalLyricsRecords,
  removeLocalTTML,
  type LocalLyricsRecord,
} from "../../../utils/Lyrics/LocalTTML.ts";
import storage from "../../../utils/storage.ts";
import { SpotifyPlayer } from "../../Global/SpotifyPlayer.ts";
import { PopupModal } from "../../Modal.ts";
import { ShowNotification } from "../../Pages/PageView.ts";

const BUTTON_CLASS_NAME =
  "spicy-local-lyrics-manager__button encore-text-body-small-bold";

async function refreshLyricsIfCurrentTrackWasRemoved(trackIds: string[]) {
  const currentTrackId = SpotifyPlayer.GetId();
  if (!currentTrackId || !trackIds.includes(currentTrackId)) {
    return;
  }

  const uri = SpotifyPlayer.GetUri();
  storage.set("currentLyricsData", "");

  if (!uri) {
    return;
  }

  try {
    const lyrics = await fetchLyrics(uri);
    ApplyLyrics(lyrics);
  } catch (error) {
    console.error(
      "Error refreshing lyrics after removing a local TTML:",
      error,
    );
    ShowNotification(
      "Removed local lyrics, but refreshing the page failed.",
      "warning",
      5000,
    );
  }
}

function getDisplayTrackName(record: LocalLyricsRecord) {
  return record.trackName?.trim() || "Unknown song";
}

function getDisplayArtistName(record: LocalLyricsRecord) {
  return record.artistNames?.trim() || "Unknown artist";
}

function getTrackTypeLabel(record: LocalLyricsRecord) {
  return record.isLocal ? "Local" : "Spotify";
}

export function openLocalLyricsManagerModal() {
  const container = document.createElement("div");
  container.className = "spicy-local-lyrics-manager__modal-root";
  const reactRoot = ReactDOM.createRoot(container);

  reactRoot.render(<LocalLyricsManager />);

  PopupModal.display({
    title: "Local Lyrics",
    content: container,
    isLarge: true,
    onClose: () => {
      reactRoot.unmount();
    },
  });
}

export default function LocalLyricsManager() {
  const [records, setRecords] = useState<LocalLyricsRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [pendingRemovalTrackId, setPendingRemovalTrackId] = useState<
    string | null
  >(null);
  const [pendingClearAllStartedAt, setPendingClearAllStartedAt] = useState<
    number | null
  >(null);
  const [clearAllCountdown, setClearAllCountdown] = useState(0);

  const loadRecords = async () => {
    setIsLoading(true);

    try {
      const nextRecords = await getAllLocalLyricsRecords();
      startTransition(() => {
        setRecords(nextRecords);
      });
    } catch (error) {
      console.error("Error loading local TTML records:", error);
      ShowNotification("Error loading saved local lyrics.", "error", 5000);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  useEffect(() => {
    if (!pendingRemovalTrackId) {
      return;
    }

    const pendingRecordStillExists = records.some(
      (record) => record.trackId === pendingRemovalTrackId,
    );
    if (!pendingRecordStillExists) {
      setPendingRemovalTrackId(null);
    }
  }, [pendingRemovalTrackId, records]);

  useEffect(() => {
    if (!pendingRemovalTrackId || isWorking) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setPendingRemovalTrackId((currentPendingTrackId) => {
        return currentPendingTrackId === pendingRemovalTrackId
          ? null
          : currentPendingTrackId;
      });
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [isWorking, pendingRemovalTrackId]);

  useEffect(() => {
    if (!pendingClearAllStartedAt) {
      setClearAllCountdown(0);
      return;
    }

    const readyAt = pendingClearAllStartedAt + 3000;

    const tick = () => {
      const remainingMs = readyAt - Date.now();
      if (remainingMs <= 0) {
        setClearAllCountdown(0);
        return;
      }

      setClearAllCountdown(Math.ceil(remainingMs / 1000));
    };

    tick();
    const intervalId = window.setInterval(tick, 200);
    return () => window.clearInterval(intervalId);
  }, [pendingClearAllStartedAt]);

  const isClearAllArmed = pendingClearAllStartedAt !== null;
  const isClearAllReady = isClearAllArmed && clearAllCountdown === 0;
  const hasRecords = records.length > 0;

  const handleDelete = async (record: LocalLyricsRecord) => {
    if (pendingRemovalTrackId !== record.trackId) {
      setPendingRemovalTrackId(record.trackId);
      return;
    }

    setIsWorking(true);

    try {
      await removeLocalTTML(record.trackId);
      setPendingRemovalTrackId(null);
      await refreshLyricsIfCurrentTrackWasRemoved([record.trackId]);
      await loadRecords();
      ShowNotification("Local lyrics removed.", "success", 4000);
    } catch (error) {
      console.error("Error removing local TTML record:", error);
      ShowNotification("Error removing local lyrics.", "error", 5000);
    } finally {
      setIsWorking(false);
    }
  };

  const handleClearAll = async () => {
    if (!records.length) {
      return;
    }

    setIsWorking(true);

    try {
      const removedTrackIds = records.map((record) => record.trackId);
      await clearLocalTTML();
      setPendingClearAllStartedAt(null);
      setPendingRemovalTrackId(null);
      await refreshLyricsIfCurrentTrackWasRemoved(removedTrackIds);
      await loadRecords();
      ShowNotification("All local lyrics removed.", "success", 4000);
    } catch (error) {
      console.error("Error clearing local TTML records:", error);
      ShowNotification("Error clearing local lyrics.", "error", 5000);
    } finally {
      setIsWorking(false);
    }
  };

  const handleClearAllClick = () => {
    if (!records.length || isWorking) {
      return;
    }

    if (!isClearAllArmed) {
      setPendingClearAllStartedAt(Date.now());
      setClearAllCountdown(3);
      return;
    }

    if (!isClearAllReady) {
      return;
    }

    void handleClearAll();
  };

  return (
    <div className="spicy-local-lyrics-manager slm slm--local-lyrics scroll-x-hidden">
      <div className="spicy-local-lyrics-manager__toolbar">
        <div className="spicy-local-lyrics-manager__summary">
          <span className="spicy-local-lyrics-manager__count">
            {isLoading
              ? "Loading saved local lyrics..."
              : `${records.length} saved local TTML${records.length === 1 ? "" : "s"}`}
          </span>
          <span className="spicy-local-lyrics-manager__hint">
            Local TTML saved on this device appear here.
          </span>
        </div>
        {hasRecords ? (
          <div className="spicy-local-lyrics-manager__actions">
            <button
              className={`${BUTTON_CLASS_NAME} spicy-local-lyrics-manager__button--danger${
                isClearAllArmed && !isClearAllReady
                  ? " spicy-local-lyrics-manager__button--dangerPending"
                  : ""
              }`}
              disabled={isLoading || isWorking || records.length === 0}
              onClick={handleClearAllClick}
              type="button"
            >
              {isWorking
                ? "Clearing..."
                : isClearAllReady
                  ? "Click Again to Clear"
                  : isClearAllArmed
                    ? `Wait ${clearAllCountdown}s`
                    : "Clear All"}
            </button>
          </div>
        ) : null}
      </div>

      {!isLoading && !hasRecords ? (
        <div className="spicy-local-lyrics-manager__empty">
          No local lyrics have been saved yet.
        </div>
      ) : (
        <div className="spicy-local-lyrics-manager__list" role="list">
          {records.map((record) => {
            return (
              <div
                className="spicy-local-lyrics-manager__item"
                key={record.trackId}
                role="listitem"
              >
                <div className="spicy-local-lyrics-manager__item-text">
                  <div className="spicy-local-lyrics-manager__title-row">
                    <div className="spicy-local-lyrics-manager__title">
                      {getDisplayTrackName(record)}
                    </div>
                    {record.isLocal && (
                      <div className="spicy-local-lyrics-manager__badges">
                        <span className="spicy-local-lyrics-manager__badge">
                          {getTrackTypeLabel(record)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="spicy-local-lyrics-manager__artist">
                    {getDisplayArtistName(record)}
                  </div>
                </div>
                <button
                  className={`${BUTTON_CLASS_NAME} spicy-local-lyrics-manager__button--danger${
                    pendingRemovalTrackId === record.trackId
                      ? " spicy-local-lyrics-manager__button--dangerPending"
                      : ""
                  }`}
                  disabled={isWorking}
                  onClick={() => void handleDelete(record)}
                  type="button"
                >
                  {pendingRemovalTrackId === record.trackId
                    ? "Click Again"
                    : "Remove"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
