interface LyricsData {
  SongWriters?: string[];
  Type?: string;
  Content?: any;
  classes?: string;
  styles?: Record<string, string>;
}

export function ApplyLyricsCredits(data: LyricsData, LyricsContainer: HTMLElement): void {
  if (!data?.SongWriters || !LyricsContainer) return;

  const CreditsElement = document.createElement("div");
  CreditsElement.classList.add("Credits");

  const SongWriters = data.SongWriters.join(", ");
  CreditsElement.textContent = `Written by: ${SongWriters}`;
  LyricsContainer.appendChild(CreditsElement);
}
