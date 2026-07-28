import { useStore } from "@nanostores/react";
import {
  $hideNpvLyricsWhenUnavailable,
  $lockedMediaBox,
  $popupLyricsAllowed,
  $timelineOutsideMediaContent,
  $viewControlsPosition,
} from "../../../utils/stores.ts";
import { $isGlobalNav } from "../../../utils/uiState.ts";
import { matches, Row, Select, SectionTitle, Toggle } from "./components.tsx";

const SECTION_NAME = "Interface";
const vcPositionOptions = ["Top", "Bottom"];

interface Props {
  query: string;
  sectionFilter: string;
}

export default function InterfaceSection({ query, sectionFilter }: Props) {
  const lockedMediaBox = useStore($lockedMediaBox);
  const popupLyricsAllowed = useStore($popupLyricsAllowed);
  const viewControlsPosition = useStore($viewControlsPosition);
  const timelineOutsideMediaContent = useStore($timelineOutsideMediaContent);
  const hideNpvLyricsWhenUnavailable = useStore($hideNpvLyricsWhenUnavailable);
  const isGlobalNav = useStore($isGlobalNav);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r2 = matches(query, "Lock Media Box Size in Compact Mode", "Prevent the media box from resizing when Forced Compact Mode is active.");
  const r3 = matches(query, "Disable Popup Lyrics Window", "Prevent lyrics from opening in a floating popup window.");
  const r4 = matches(query, "Lyrics Controls Position", "Where the lyrics view controls (play, scroll, etc.) appear.");
  const r5 = matches(query, "Timeline Outside Media Box", "Display the playback timeline outside the media box, in the NowBar header. Stays inside the media box in Compact Mode or PIP.");
  const r6 = matches(query, "Hide NPV Lyrics When No Lyrics Are Available", "Remove the lyrics card from the Now Playing sidebar while the current song has no lyrics, instead of showing a notice. It comes back on the next song that has them.");

  if (!r2 && !r3 && !r4 && !r5 && !r6) return null;

  return (
    <>
      <SectionTitle>Interface</SectionTitle>

      {r2 && (
        <Row
          label="Lock Media Box Size in Compact Mode"
          description="Prevent the media box from resizing when Forced Compact Mode is active."
        >
          <Toggle checked={lockedMediaBox} onChange={(v) => $lockedMediaBox.set(v)} />
        </Row>
      )}

      {r3 && (
        <Row label="Disable Popup Lyrics Window" description="Prevent lyrics from opening in a floating popup window.">
          <Toggle
            checked={!popupLyricsAllowed}
            onChange={(v) => $popupLyricsAllowed.set(!v)}
          />
        </Row>
      )}

      {r4 && (
        <Row
          label="View Controls Position"
          description="Where the view controls (play, scroll, etc.) appear."
          disabled={!isGlobalNav}
          disabledReason="Only available in Spotify's new navigation layout"
        >
          <Select
            value={viewControlsPosition}
            options={vcPositionOptions}
            onChange={(v) => $viewControlsPosition.set(v)}
          />
        </Row>
      )}

      {r5 && (
        <Row
          label="Timeline Outside Media Box"
          description="Display the playback timeline outside the media box, in the NowBar header. Stays inside the media box in Compact Mode or PIP."
        >
          <Toggle
            checked={timelineOutsideMediaContent}
            onChange={(v) => $timelineOutsideMediaContent.set(v)}
          />
        </Row>
      )}

      {r6 && (
        <Row
          label="Hide NPV Lyrics When No Lyrics Are Available"
          description="Remove the lyrics card from the Now Playing sidebar while the current song has no lyrics, instead of showing a notice. It comes back on the next song that has them."
        >
          <Toggle
            checked={hideNpvLyricsWhenUnavailable}
            onChange={(v) => $hideNpvLyricsWhenUnavailable.set(v)}
          />
        </Row>
      )}
    </>
  );
}
