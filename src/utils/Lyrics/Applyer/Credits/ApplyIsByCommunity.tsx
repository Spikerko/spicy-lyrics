import { Spicetify } from "@spicetify/bundler";
import { IsPIP } from "../../../../components/Utils/PopupLyrics.ts";
import { actions } from "../../../../actions.ts";
import { Query } from "../../../../utils/API/Query.ts";


let isByCommunityAbortController: AbortController | null = null;
let madeTippys = new Set<any>();

export function CleanUpIsByCommunity() {
  if (isByCommunityAbortController) {
    isByCommunityAbortController.abort();
    isByCommunityAbortController = null;
  }

  madeTippys.forEach((tippy) => {
    if (tippy && typeof tippy.destroy === "function") {
      tippy.destroy();
    }
  });
  madeTippys.clear();
}

// Kept for any external callers that may still reference this export
export const unmountTTMLProfileReactRoot = () => {};

let _profileOverlay: HTMLElement | null = null;

function closeProfileOverlay() {
  if (_profileOverlay) { _profileOverlay.remove(); _profileOverlay = null; }
}

const IFRAME_ORIGIN = "https://spicylyrics.org";

async function showProfileModal(userId: string | undefined) {
  if (!userId) return;

  closeProfileOverlay();

  // Full-screen overlay: dims everything, blocks all interaction, click outside closes
  const overlay = document.createElement("div");
  overlay.style.cssText = [
    "position:fixed;inset:0;z-index:2147483645;",
    "background:rgba(0,0,0,0.6);",
    "display:flex;align-items:center;justify-content:center;",
  ].join("");
  overlay.addEventListener("click", closeProfileOverlay);
  document.body.appendChild(overlay);
  _profileOverlay = overlay;

  // Panel — inside the overlay, stops clicks from bubbling to the dim layer
  const panel = document.createElement("div");
  panel.style.cssText = [
    "position:relative;",
    "background:#0e0e0e;",
    "border:1px solid rgba(255,255,255,0.12);",
    "border-radius:12px;",
    "overflow:hidden;",
    "box-shadow:0 16px 60px rgba(0,0,0,0.8);",
    "display:flex;flex-direction:column;",
  ].join("");
  panel.addEventListener("click", (e) => e.stopPropagation());

  function position() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const w = Math.max(Math.min(Math.round(W * 0.67), W - 60), Math.min(900, W - 40));
    const h = Math.max(Math.round(H * 0.65), Math.min(560, H - 40));
    panel.style.width = `${w}px`;
    panel.style.height = `${h}px`;
  }
  position();
  window.addEventListener("resize", position);

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M31.098 29.794L16.955 15.65 31.097 1.51 29.683.093 15.54 14.237 1.4.094-.016 1.508 14.126 15.65-.016 29.795l1.414 1.414L15.54 17.065l14.144 14.143" fill="currentColor" fill-rule="evenodd"/></svg>`;
  closeBtn.style.cssText = [
    "position:absolute;top:12px;right:12px;z-index:1;",
    "width:28px;height:28px;",
    "display:flex;align-items:center;justify-content:center;",
    "background:rgba(255,255,255,0.08);",
    "border:none;border-radius:50%;cursor:pointer;",
    "color:rgba(255,255,255,0.7);",
    "transition:background 0.15s,color 0.15s;",
  ].join("");
  closeBtn.onmouseenter = () => { closeBtn.style.background = "rgba(255,255,255,0.15)"; closeBtn.style.color = "#fff"; };
  closeBtn.onmouseleave = () => { closeBtn.style.background = "rgba(255,255,255,0.08)"; closeBtn.style.color = "rgba(255,255,255,0.7)"; };
  closeBtn.onclick = closeProfileOverlay;

  // Loading indicator
  const loading = document.createElement("div");
  loading.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.35);font-size:0.85rem;font-family:sans-serif;";
  loading.textContent = "Loading profile…";

  panel.appendChild(closeBtn);
  panel.appendChild(loading);
  overlay.appendChild(panel);

  // Fetch username
  let username: string | undefined;
  try {
    const req = await Query([{
      operation: "ttmlProfile",
      variables: { userId, referrer: "lyricsCreditsView" },
    }]);
    username = req.get("0")?.data?.profile?.data?.username;
  } catch (_) {}

  if (_profileOverlay !== overlay) return; // closed while fetching

  loading.remove();

  if (!username) {
    const err = document.createElement("div");
    err.style.cssText = "flex:1;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.35);font-size:0.85rem;font-family:sans-serif;";
    err.textContent = "Failed to load profile.";
    panel.appendChild(err);
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.src = `https://spicylyrics.org/embed/${encodeURIComponent(username)}`;
  iframe.style.cssText = "flex:1;width:100%;border:none;display:block;min-height:0;";
  iframe.allow = "clipboard-write";
  panel.appendChild(iframe);

  // Listen for events from the iframe
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== IFRAME_ORIGIN) return;
    if (e.data?.type !== "events") return;
    for (const event of (e.data?.data?.events ?? [])) {
      if (event.action === "PATCH_PLAYBACK") {
        const uri = event.patches?.[0]?.playback_uri;
        if (typeof uri === "string") {
          closeProfileOverlay();
          Spicetify.Player.playUri(uri);
        }
      } else if (
        event.action === "MODIFY_APP_STATE" &&
        event.patches?.some((p: any) => p.ttml_profile_modal_open_state === false)
      ) {
        closeProfileOverlay();
      }
    }
  };
  window.addEventListener("message", onMessage);

  // Clean up resize + message listeners when overlay is removed
  const observer = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      window.removeEventListener("resize", position);
      window.removeEventListener("message", onMessage);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}


actions.push("lyricsProfile", (userId: string) => {
  showProfileModal(userId);
});

export function ApplyIsByCommunity(data: any, LyricsContainer: HTMLElement): void {
  if (!data.source || !LyricsContainer) return;
  if (data.source !== "spl") return;

  // Clean up any previous listeners before adding new ones
  if (isByCommunityAbortController) {
    isByCommunityAbortController.abort();
  }

  if (madeTippys.size > 0) {
    madeTippys.forEach((tippy) => {
      if (tippy && typeof tippy.destroy === "function") {
        tippy.destroy();
      }
    });
    madeTippys.clear();
  }

  isByCommunityAbortController = new AbortController();
  const { signal } = isByCommunityAbortController;

  const songInfoElement = document.createElement("div");
  songInfoElement.classList.add("SongInfo");

  // Static copy – safe to set as text
  const providedByCommunitySpan = document.createElement("span");
  providedByCommunitySpan.style.opacity = "0.5";
  providedByCommunitySpan.textContent =
    "These lyrics have been provided by our community";
  songInfoElement.appendChild(providedByCommunitySpan);

  const makerUsername = data.TTMLUploadMetadata?.Maker?.username;
  const makerAvatar = data.TTMLUploadMetadata?.Maker?.avatar;
  const uploaderUsername = data.TTMLUploadMetadata?.Uploader?.username;
  const uploaderAvatar = data.TTMLUploadMetadata?.Uploader?.avatar;

  // Helper for creating a profile section (Maker / Uploader) safely
  const createProfileSection = (
    type: "Maker" | "Uploader",
    labelText: string,
    username: string,
    avatarUrl?: string
  ) => {
    const wrapperSpan = document.createElement("span");
    wrapperSpan.classList.add(type);

    const innerSpan = document.createElement("span");

    const labelSpan = document.createElement("span");
    labelSpan.style.opacity = "0.5";
    labelSpan.textContent = `${labelText} `;

    const profileSectionSpan = document.createElement("span");
    profileSectionSpan.classList.add("song-info-profile-section");

    // "@username"
    const atText = document.createTextNode("@");
    profileSectionSpan.appendChild(atText);

    const usernameSpan = document.createElement("span");
    usernameSpan.textContent = username;
    profileSectionSpan.appendChild(usernameSpan);

    // Optional avatar image
    if (avatarUrl) {
      const avatarWrapper = document.createElement("span");
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = `${username}'s avatar`;
      img.onerror = () => {
        img.style.display = "none";
      };
      avatarWrapper.appendChild(img);
      profileSectionSpan.appendChild(avatarWrapper);
    }

    innerSpan.appendChild(labelSpan);
    innerSpan.appendChild(profileSectionSpan);
    wrapperSpan.appendChild(innerSpan);

    songInfoElement.appendChild(wrapperSpan);
  };

  if (makerUsername) {
    createProfileSection("Maker", "Made by", makerUsername, makerAvatar);
  }

  if (uploaderUsername) {
    const labelText = makerUsername ? "Uploaded by" : "Made by";
    createProfileSection("Uploader", labelText, uploaderUsername, uploaderAvatar);
  }
  LyricsContainer.appendChild(songInfoElement);

  const uploaderSpan = songInfoElement.querySelector(".Uploader .song-info-profile-section");
  if (uploaderSpan) {
    if (!IsPIP) {
      madeTippys.add(
        Spicetify.Tippy(uploaderSpan, {
          ...Spicetify.TippyProps,
          content: `View TTML Profile`,
        })
      )
    }
    uploaderSpan.addEventListener(
      "click",
      () => {
        showProfileModal(data.TTMLUploadMetadata?.Uploader?.id);
        if (IsPIP) {
          globalThis.focus();
        }
      },
      { signal }
    );
  }

  const makerSpan = songInfoElement.querySelector(".Maker .song-info-profile-section");
  if (makerSpan) {
    if (!IsPIP) {
      madeTippys.add(
        Spicetify.Tippy(makerSpan, {
          ...Spicetify.TippyProps,
          content: `View TTML Profile`,
        })
      )
    }
    makerSpan.addEventListener(
      "click",
      () => {
        showProfileModal(data.TTMLUploadMetadata?.Maker?.id);
        if (IsPIP) {
          globalThis.focus();
        }
      },
      { signal }
    );
  }
}
