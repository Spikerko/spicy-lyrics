import { ApplyIsByCommunity } from "./ApplyIsByCommunity.tsx";
import { ApplyLyricsProvider } from "./ApplyProvider.ts";
import { CreditsRow } from "./CreditsRow.ts";

interface LyricsData {
  SongWriters?: string[];
  Type?: string;
  Content?: any;
  classes?: string;
  styles?: Record<string, string>;
}

/**
 * Marks `container` when the song ends on a duet line sung from the right, so the
 * credits under it can follow it there (the CreditsFollowLastLine page class).
 * Read from the data: the virtualizer may not have the last line mounted.
 */
export function MarkLastLineSide(container: HTMLElement, opposite: boolean, rtl: boolean): void {
  container.classList.toggle("EndsOnOppositeLine", opposite && !rtl);
}

export function ApplyLyricsCredits(data: LyricsData, LyricsContainer: HTMLElement): void {
  if (!data?.SongWriters || !LyricsContainer) return;

  const CreditsElement = document.createElement("div");
  CreditsElement.classList.add("Credits");
  CreditsRow(CreditsElement, "Written by", data.SongWriters.join(", "));
  LyricsContainer.appendChild(CreditsElement);
}

/**
 * Songwriters, lyrics source and community credits, grouped in one element under
 * the lyrics. The virtualizer glides everything after the list, so the group moves as one.
 */
export function ApplySongCredits(data: any, LyricsContainer: HTMLElement): void {
  if (!LyricsContainer) return;

  const CreditsElement = document.createElement("div");
  CreditsElement.classList.add("SongCredits");

  ApplyLyricsCredits(data, CreditsElement);
  ApplyLyricsProvider(data, CreditsElement);
  ApplyIsByCommunity(data, CreditsElement);

  // Community lyrics name their source in the community line, so the refined look drops "Provided by".
  if (CreditsElement.querySelector(":scope > .SongInfo")) CreditsElement.classList.add("FromCommunity");

  if (CreditsElement.childElementCount > 0) LyricsContainer.appendChild(CreditsElement);
}
