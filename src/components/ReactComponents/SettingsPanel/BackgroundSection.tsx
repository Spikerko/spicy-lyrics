import { useStore } from "@nanostores/react";
import React from "react";
import {
  $showNpvDynamicBg,
  $staticBackgroundBlur,
  $staticBackgroundMode,
} from "../../../utils/stores.ts";
import { matches, Row, Select, SectionTitle, Slider, Toggle } from "./components.tsx";

const SECTION_NAME = "Background";
const bgModeOptions = ["off", "auto", "artistHeader", "coverArt", "color"];
const bgModeLabels = ["Off", "Auto", "Artist Header", "Cover Art", "Color"];

interface Props {
  query: string;
  sectionFilter: string;
}

export default function BackgroundSection({ query, sectionFilter }: Props) {
  const staticBackgroundMode = useStore($staticBackgroundMode);
  const staticBackgroundBlur = useStore($staticBackgroundBlur);
  const showNpvDynamicBg = useStore($showNpvDynamicBg);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Static Background", "Pin the background to a fixed image or color instead of animating it.");
  const r2 = matches(query, "Display Dynamic Background in Now Playing View", "Show the animated background in the Now Playing panel.");
  // Only image-based static modes have something to blur — "color" paints a gradient,
  // and "off" leaves the animated background in charge.
  const blurApplies = staticBackgroundMode !== "off" && staticBackgroundMode !== "color";
  const r3 =
    blurApplies &&
    matches(query, "Background Blur", "Soften the static background image.");

  if (!r1 && !r2 && !r3) return null;

  return (
    <>
      <SectionTitle>Background</SectionTitle>

      {r1 && (
        <Row label="Static Background" description="Pin the background to a fixed image or color instead of animating it.">
          <Select
            value={staticBackgroundMode}
            options={bgModeOptions}
            labels={bgModeLabels}
            onChange={(v) => $staticBackgroundMode.set(v)}
          />
        </Row>
      )}

      {r3 && (
        <Row label="Background Blur" description="Soften the static background image." stacked>
          <Slider
            value={staticBackgroundBlur}
            min={0}
            max={67}
            step={1}
            defaultValue={0}
            unit="px"
            onChange={(v) => $staticBackgroundBlur.set(v)}
          />
        </Row>
      )}

      {r2 && (
        <Row
          label="Display Dynamic Background in Now Playing View"
          description="Show the animated background in the Now Playing panel."
        >
          <Toggle checked={showNpvDynamicBg} onChange={(v) => $showNpvDynamicBg.set(v)} />
        </Row>
      )}
    </>
  );
}
