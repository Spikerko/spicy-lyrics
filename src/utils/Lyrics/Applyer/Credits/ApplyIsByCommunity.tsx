import { createTooltip } from "../../../tooltip.ts";
import { IsPIP } from "../../../../components/Utils/PopupLyrics.ts";

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

function openProfile(userId: string | undefined) {
  if (!userId) return;
  const url = `https://spicylyrics.org/uid/${encodeURIComponent(userId)}`;
  globalThis.open?.(url, "_blank", "noopener,noreferrer");
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

  const providedByCommunitySpan = document.createElement("span");
  providedByCommunitySpan.classList.add("SongInfoNote");
  providedByCommunitySpan.textContent =
    "These lyrics have been provided by our community";
  songInfoElement.appendChild(providedByCommunitySpan);

  // The refined credits show this shorter lead instead, with the people after it on the same line.
  const communityLeadSpan = document.createElement("span");
  communityLeadSpan.classList.add("SongInfoLead");
  communityLeadSpan.textContent = "Community lyrics";
  songInfoElement.appendChild(communityLeadSpan);

  const makerUsername = data.TTMLUploadMetadata?.Maker?.username;
  const uploaderUsername = data.TTMLUploadMetadata?.Uploader?.username;

  // One button per person: the role, "@username" and the avatar, all opening their profile.
  const createProfileSection = (type: "Maker" | "Uploader", labelText: string) => {
    const person = data.TTMLUploadMetadata[type];

    const wrapperSpan = document.createElement("span");
    wrapperSpan.classList.add(type);

    const profileButton = document.createElement("button");
    profileButton.type = "button";
    profileButton.classList.add("song-info-profile-section");

    if (person.avatar) {
      const img = document.createElement("img");
      img.src = person.avatar;
      // The name is right beside it.
      img.alt = "";
      img.onerror = () => {
        img.style.display = "none";
      };
      profileButton.appendChild(img);
    }

    const roleSpan = document.createElement("span");
    roleSpan.classList.add("SongInfoRole");
    roleSpan.textContent = labelText;

    const usernameSpan = document.createElement("span");
    usernameSpan.classList.add("SongInfoName");
    usernameSpan.textContent = `@${person.username}`;

    profileButton.append(roleSpan, " ", usernameSpan);
    wrapperSpan.appendChild(profileButton);
    songInfoElement.appendChild(wrapperSpan);

    if (!IsPIP) {
      madeTippys.add(
        createTooltip(profileButton, {
          ...Spicetify.TippyProps,
          content: `View TTML Profile`,
        })
      );
    }
    // Spotify's Space shortcut would otherwise cancel the press and toggle playback.
    profileButton.addEventListener(
      "keydown",
      (event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      },
      { signal }
    );
    profileButton.addEventListener(
      "click",
      () => {
        openProfile(person.id);
        if (IsPIP) {
          globalThis.focus();
        }
      },
      { signal }
    );
  };

  if (makerUsername) {
    createProfileSection("Maker", "Made by");
  }

  if (uploaderUsername) {
    createProfileSection("Uploader", makerUsername ? "Uploaded by" : "Made by");
  }
  LyricsContainer.appendChild(songInfoElement);
}
