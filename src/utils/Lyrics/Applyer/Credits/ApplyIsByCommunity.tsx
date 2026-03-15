import { Spicetify } from "@spicetify/bundler";
import { IsPIP } from "../../../../components/Utils/PopupLyrics.ts";
import { actions } from "../../../../actions.ts";
import storage from "../../../../utils/storage.ts";
import {
  showIframeProfileModal,
  closeIframeProfileModal,
} from "../../../../components/ReactComponents/IframeProfile/IframeProfileModal.tsx";

const devLog = (...args: any[]) => {
  if (storage.get("developerMode") === "true") console.log("[IsByCommunity]", ...args);
};


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

actions.push("lyricsProfile", (userId: string) => {
  showIframeProfileModal(userId);
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
        devLog("uploader click, id:", data.TTMLUploadMetadata?.Uploader?.id);
        showIframeProfileModal(data.TTMLUploadMetadata?.Uploader?.id);
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
        devLog("maker click, id:", data.TTMLUploadMetadata?.Maker?.id);
        showIframeProfileModal(data.TTMLUploadMetadata?.Maker?.id);
        if (IsPIP) {
          globalThis.focus();
        }
      },
      { signal }
    );
  }
}
