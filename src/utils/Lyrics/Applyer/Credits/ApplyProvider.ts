const ProviderMap = {
    "spt": "Spotify",
    "aml": "Apple Music",
    "spl": "Spicy Lyrics",
    "ldb": "Local DB",
}

export function ApplyLyricsProvider(data: any, LyricsContainer: HTMLElement): void {
  if (!data?.source || !LyricsContainer) return;

  const ProviderElement = document.createElement("div");
  ProviderElement.classList.add("LyricsProvider");

  let providerLabel = "";
  if (
    typeof data.source === "string" &&
    Object.prototype.hasOwnProperty.call(ProviderMap, data.source)
  ) {
    providerLabel = ProviderMap[data.source];
  } else {
    providerLabel = "Unknown";
  }
  ProviderElement.textContent = `Provided by: ${providerLabel}`;
  LyricsContainer.appendChild(ProviderElement);
}
