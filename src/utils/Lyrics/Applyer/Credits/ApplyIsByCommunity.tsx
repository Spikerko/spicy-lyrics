// deno-lint-ignore no-unused-vars
import React from "react";
import { Spicetify } from "@spicetify/bundler";
import TTMLProfile from "../../../../components/ReactComponents/TTMLProfile/ttml-profile.tsx";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { reactQueryClient } from "../../../../app.tsx";
import { IsPIP } from "../../../../components/Utils/PopupLyrics.ts";
import { PopupModal } from "../../../../components/Modal.ts";


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


export const _action_lProfile = (userId: string, hasProfileBanner: boolean) => {
  showProfileModal(userId, hasProfileBanner);
}

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

  songInfoElement.innerHTML = `
    <span style="opacity: 0.5;">
      These lyrics have been provided by our community
    </span>
    ${
      data.ttmlUploadsData?.Uploader?.username && data.ttmlUploadsData?.Uploader?.avatar
        ? `
        <span class="Uploader">
          <span><span style="opacity: 0.5;">Uploaded${!data.ttmlUploadsData.Maker?.username ? " and Made" : ""} by </span><span class="song-info-profile-section">@${data.ttmlUploadsData.Uploader.username} <span>${data.ttmlUploadsData.Uploader.avatar ? `<img src="${data.ttmlUploadsData.Uploader.avatar}" alt="${data.ttmlUploadsData.Uploader.username}'s avatar" onerror="this.style.display='none';" />` : ""}</span></span></span>
        </span>
        `.trim()
        : ""
    }
    ${
      data.ttmlUploadsData?.Maker?.username && data.ttmlUploadsData?.Maker?.avatar
        ? `
        <span class="Maker">
          <span><span style="opacity: 0.5;">Made by </span><span class="song-info-profile-section">@${data.ttmlUploadsData.Maker.username} <span>${data.ttmlUploadsData.Maker.avatar ? `<img src="${data.ttmlUploadsData.Maker.avatar}" alt="${data.ttmlUploadsData.Maker.username}'s avatar" onerror="this.style.display='none';" />` : ""}</span></span></span>
        </span>
        `.trim()
        : ""
    }
  `;
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
          typeof data.ttmlUploadsData?.Uploader?.hasProfileBanner === "boolean"
            ? data.ttmlUploadsData.Uploader.hasProfileBanner
            : true;
        showProfileModal(data.ttmlUploadsData?.Uploader?.id, hasProfileBanner);
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
          typeof data.ttmlUploadsData?.Maker?.hasProfileBanner === "boolean"
            ? data.ttmlUploadsData.Maker.hasProfileBanner
            : true;
        showProfileModal(data.ttmlUploadsData?.Maker?.id, hasProfileBanner);
        if (IsPIP) {
          globalThis.focus();
        }
      },
      { signal }
    );
  }
}
