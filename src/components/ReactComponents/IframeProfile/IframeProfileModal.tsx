import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Spicetify } from "@spicetify/bundler";
import { Query } from "../../../utils/API/Query.ts";
import storage from "../../../utils/storage.ts";

const IFRAME_ORIGIN = "https://spicylyrics.org";

const devLog = (...args: any[]) => {
  if (storage.get("developerMode") === "true") console.log("[IframeProfile]", ...args);
};

interface IframeProfileModalProps {
  userId: string;
  onClose: () => void;
}

function IframeProfileModal({ userId, onClose }: IframeProfileModalProps) {
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  devLog("render —", { loading, username, error });

  useEffect(() => {
    devLog("mount, userId:", userId);
    let cancelled = false;
    Query([{
      operation: "ttmlProfile",
      variables: { userId, referrer: "lyricsCreditsView" },
    }])
      .then((req) => {
        if (cancelled) return;
        devLog("query result:", req.get("0"));
        const name = req.get("0")?.data?.profile?.data?.username;
        devLog("resolved username:", name);
        if (name) {
          setUsername(name);
        } else {
          setError(true);
        }
      })
      .catch((err) => {
        devLog("query error:", err);
        if (!cancelled) setError(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [userId]);

  const handleMessage = useCallback((e: MessageEvent) => {
    if (e.origin !== IFRAME_ORIGIN) return;
    if (e.data?.type !== "events") return;
    for (const event of (e.data?.data?.events ?? [])) {
      if (event.action === "PATCH_PLAYBACK") {
        const uri = event.patches?.[0]?.playback_uri;
        if (typeof uri === "string") {
          onClose();
          Spicetify.Player.playUri(uri);
        }
      } else if (
        event.action === "MODIFY_APP_STATE" &&
        event.patches?.some((p: any) => p.ttml_profile_modal_open_state === false)
      ) {
        onClose();
      }
    }
  }, [onClose]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "#0e0e0e",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 16px 60px rgba(0,0,0,0.8)",
          display: "flex",
          flexDirection: "column",
          width: "min(900px, calc(100% - 40px))",
          height: "min(85%, calc(100% - 40px))",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 1,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: "50%",
            cursor: "pointer",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
        </button>

        {loading && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)", fontSize: "0.85rem", fontFamily: "sans-serif" }}>
            Loading profile…
          </div>
        )}
        {!loading && error && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)", fontSize: "0.85rem", fontFamily: "sans-serif" }}>
            Failed to load profile.
          </div>
        )}
        {!loading && username && (
          <iframe
            src={`${IFRAME_ORIGIN}/embed/${encodeURIComponent(username)}`}
            allow="clipboard-write"
            // allow-same-origin is safe: IFRAME_ORIGIN differs from Spicetify's parent
            // origin, so the sandbox-escape cannot be triggered. Remove if the embed
            // URL ever becomes same-origin with the parent.
            sandbox="allow-scripts allow-same-origin allow-popups"
            style={{ flex: 1, width: "100%", border: "none", display: "block", minHeight: 0 }}
          />
        )}
      </div>
    </div>
  );
}

// ── Mount / unmount helpers ──────────────────────────────────────────────────

let _profileRoot: ReturnType<typeof ReactDOM.createRoot> | null = null;
let _profileContainer: HTMLElement | null = null;
let _profileHost: HTMLElement | null = null;
let _profileHostPrevPosition: string = "";

export function closeIframeProfileModal() {
  _profileRoot?.unmount();
  _profileRoot = null;
  _profileContainer?.remove();
  _profileContainer = null;
  if (_profileHost) {
    _profileHost.style.position = _profileHostPrevPosition;
    _profileHost = null;
    _profileHostPrevPosition = "";
  }
}

export function showIframeProfileModal(userId: string | undefined) {
  devLog("showIframeProfileModal called, userId:", userId);
  if (!userId) {
    devLog("userId is falsy, aborting");
    return;
  }

  closeIframeProfileModal();

  // Append inside #SpicyLyricsPage with position:absolute.
  // position:fixed is broken in Spotify's rendering context (returns 0x0 rect).
  const host = document.querySelector<HTMLElement>("#SpicyLyricsPage") ?? document.body;

  // Ensure the host is a positioning context for our absolute overlay
  _profileHost = host;
  _profileHostPrevPosition = host.style.position;
  if (!host.style.position || host.style.position === "static") {
    host.style.position = "relative";
  }

  const container = document.createElement("div");
  container.style.cssText = "position:absolute;top:0;right:0;bottom:0;left:0;z-index:9999;";
  host.appendChild(container);
  devLog("container appended to", host.id || host.tagName);

  try {
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(IframeProfileModal, { userId, onClose: closeIframeProfileModal }));
    devLog("React root created and rendered");
    _profileContainer = container;
    _profileRoot = root;

    setTimeout(() => {
      devLog("host rect:", JSON.stringify(host.getBoundingClientRect()));
      devLog("container rect:", JSON.stringify(container.getBoundingClientRect()));
      const overlay = container.firstElementChild as HTMLElement | null;
      if (overlay) {
        const cs = window.getComputedStyle(overlay);
        devLog("overlay rect:", JSON.stringify(overlay.getBoundingClientRect()));
        devLog("overlay computed — position:", cs.position, "zIndex:", cs.zIndex, "display:", cs.display, "visibility:", cs.visibility);
      } else {
        devLog("no overlay element found inside container");
      }
    }, 500);
  } catch (err) {
    devLog("ReactDOM.createRoot/render threw:", err);
    container.remove();
  }
}
