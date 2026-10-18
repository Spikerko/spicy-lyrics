import { CreditsRow } from "./CreditsRow.ts";

const ProviderMap = {
    "spt": "Spotify",
    "aml": "Apple Music",
    "spl": "Spicy Lyrics",
    "ldb": "Local DB",
    "uns": "Unison",
} as const;

// `url` carries a utm_source so the source can tell visits that came from here.
const ViaMap: Record<string, { label: string; url?: string }> = {
  "lrc-red": { label: "lrc.red", url: "https://lrc.red/?utm_source=spicylyrics" },
};

export function ApplyLyricsProvider(data: any, LyricsContainer: HTMLElement): void {
  if (!data?.source || !LyricsContainer) return;

  const ProviderElement = document.createElement("div");
  ProviderElement.classList.add("LyricsProvider");

  let providerLabel = "Unknown";
  if (typeof data.source === "string") {
    const source = data.source.toLowerCase();
    const match = Object.entries(ProviderMap).find(([key]) => source.includes(key));
    if (match) providerLabel = match[1];
  }

  CreditsRow(ProviderElement, "Provided by", providerLabel);

  // Own keys only: a value such as "constructor" would otherwise find Object.prototype's.
  const via =
    typeof data.source_via === "string" && Object.hasOwn(ViaMap, data.source_via)
      ? ViaMap[data.source_via]
      : undefined;
  if (via) {
    const ViaElement = document.createElement("span");
    ViaElement.classList.add("LyricsProviderVia");
    // Its own span, so the refined credits can mute "via" without muting the link.
    const ViaLabelElement = document.createElement("span");
    ViaLabelElement.classList.add("LyricsProviderViaLabel");
    ViaLabelElement.textContent = "via ";
    ViaElement.append(ViaLabelElement);
    if (via.url) {
      const LinkElement = document.createElement("a");
      LinkElement.classList.add("LyricsProviderViaLink");
      LinkElement.href = via.url;
      LinkElement.target = "_blank";
      LinkElement.rel = "noopener";
      LinkElement.textContent = via.label;
      // Opened from the main window: followed from Popup Lyrics, the link opens an
      // in-client window instead of the browser.
      const url = via.url;
      LinkElement.addEventListener("click", (event) => {
        event.preventDefault();
        window.open(url, "_blank");
      });
      ViaElement.append(LinkElement);
    } else {
      ViaLabelElement.append(via.label);
    }
    ProviderElement.append(" ", ViaElement);
  }

  LyricsContainer.appendChild(ProviderElement);
}
