// deno-lint-ignore no-unused-vars
import React from "react";
import { Spicetify } from "@spicetify/bundler";
import TTMLProfile from "../../../../components/ReactComponents/TTMLProfile/ttml-profile.tsx";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { reactQueryClient } from "../../../../app.tsx";
import { IsPIP } from "../../../../components/Utils/PopupLyrics.ts";
import { PopupModal } from "../../../../components/Modal.ts";
import { actions } from "../../../../actions.ts";


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


let ttmlProfileReactRoot: ReactDOM.Root | null = null;

// Unmount the React root and clear reference
export const unmountTTMLProfileReactRoot = () => {
  if (ttmlProfileReactRoot) {
    ttmlProfileReactRoot.unmount();
    ttmlProfileReactRoot = null;
  }
};

function showProfileModal(userId: string | undefined, hasProfileBanner: boolean) {
  if (!userId) return;

  // Set content to a placeholder div, React will mount into modal's <main> container instead
  const placeholder = document.createElement("div");

  // This function will mount React after the modal inserts its structure into DOM
  const onModalDisplayed = () => {
    // Find the modal's main element where content should go
    const mainElement = PopupModal.querySelector("main.main-trackCreditsModal-originalCredits");
    if (!mainElement) return;

    // Clear any existing content in mainElement
    mainElement.innerHTML = "";

    // Create React root on the main element
    ttmlProfileReactRoot = ReactDOM.createRoot(mainElement);

    // Render React content
    ttmlProfileReactRoot.render(
      <QueryClientProvider client={reactQueryClient}>
        <TTMLProfile userId={userId} hasProfileBanner={hasProfileBanner} />
      </QueryClientProvider>
    );
  };

  PopupModal.display({
    title: "TTML Profile",
    // Pass placeholder as content so modal builds structure,
    // React rendering happens in onModalDisplayed callback
    content: placeholder,
    isLarge: true,
    onClose: () => unmountTTMLProfileReactRoot(),
  });

  // After modal DOM is ready, mount React inside it
  onModalDisplayed();
}


actions.push("lyricsProfile", (userId: string, hasProfileBanner: boolean) => {
  showProfileModal(userId, hasProfileBanner);
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
        const hasProfileBanner =
          typeof data.TTMLUploadMetadata?.Uploader?.hasProfileBanner === "boolean"
            ? data.TTMLUploadMetadata.Uploader.hasProfileBanner
            : true;
        showProfileModal(data.TTMLUploadMetadata?.Uploader?.id, hasProfileBanner);
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
        const hasProfileBanner =
          typeof data.TTMLUploadMetadata?.Maker?.hasProfileBanner === "boolean"
            ? data.TTMLUploadMetadata.Maker.hasProfileBanner
            : true;
        showProfileModal(data.TTMLUploadMetadata?.Maker?.id, hasProfileBanner);
        if (IsPIP) {
          globalThis.focus();
        }
      },
      { signal }
    );
  }
}
