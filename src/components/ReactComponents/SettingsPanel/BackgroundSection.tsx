import { useStore } from "@nanostores/react";
import { $showNpvDynamicBg, $staticBackgroundMode, $showLyricsBg } from "../../../utils/stores.ts";
import { matches, Row, Select, SectionTitle, Toggle } from "./components.tsx";

const SECTION_NAME = "Background";
const bgModeOptions = ["off", "auto", "artistHeader", "coverArt", "color"];
const bgModeLabels = ["Off", "Auto", "Artist Header", "Cover Art", "Color"];

interface Props {
  query: string;
  sectionFilter: string;
}

export default function BackgroundSection({ query, sectionFilter }: Props) {
  const staticBackgroundMode = useStore($staticBackgroundMode);
  const showNpvDynamicBg = useStore($showNpvDynamicBg);
  const showLyricsBg = useStore($showLyricsBg);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Static Background", "Pin the background to a fixed image or color instead of animating it.");
  const r2 = matches(query, "Display Dynamic Background in Now Playing View", "Show the animated background in the Now Playing panel.");
  const r3 = matches(query, "Show Lyrics Background", "Show the dynamic background behind the lyrics view.");

  if (!r1 && !r2 && !r3) return null;

  return (
    <>
      <SectionTitle>Background</SectionTitle>
      {r3 && (
        <Row label="Show Lyrics Background" description="Show the dynamic background behind the lyrics view.">
          <Toggle checked={showLyricsBg} onChange={(v) => $showLyricsBg.set(v)} />
        </Row>
      )}
{r1 && (
  <Row
    label="Static Background"
    description="Pin the background to a fixed image or color instead of animating it."
    disabled={!showLyricsBg}
    disabledReason="Enable Show Lyrics Background first."
  >
    <Select
      value={staticBackgroundMode}
      options={bgModeOptions}
      labels={bgModeLabels}
      onChange={(v) => $staticBackgroundMode.set(v)}
    />
  </Row>
)}
{r2 && (
  <Row
    label="Display Dynamic Background in Now Playing View"
    description="Show the animated background in the Now Playing panel."
    disabled={!showLyricsBg}
    disabledReason="Enable Show Lyrics Background first."
  >
    <Toggle checked={showNpvDynamicBg} onChange={(v) => $showNpvDynamicBg.set(v)} />
  </Row>
)}
    </>
  );
}