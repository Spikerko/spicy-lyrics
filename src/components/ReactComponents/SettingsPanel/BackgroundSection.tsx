import { useStore } from "@nanostores/react";
import React from "react";
import { $hideNpvBg, $staticBackground, $staticBackgroundType } from "../../../utils/stores.ts";
import { matches, Row, Select, SectionTitle, Toggle } from "./components.tsx";

const SECTION_NAME = "Background";
const bgTypeOptions = ["Auto", "Artist Header Visual", "Cover Art", "Color"];

interface Props {
  query: string;
  sectionFilter: string;
}

export default function BackgroundSection({ query, sectionFilter }: Props) {
  const staticBackground = useStore($staticBackground);
  const staticBackgroundType = useStore($staticBackgroundType);
  const hideNpvBg = useStore($hideNpvBg);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Static Background", "Keep the background fixed instead of animating it.");
  const r2 = matches(query, "Static Background Source", "What image or color to use as the static background.");
  const r3 = matches(query, "Hide Dynamic Background in Now Playing View", "Remove the animated background from the Now Playing panel.");

  if (!r1 && !r2 && !r3) return null;

  return (
    <>
      <SectionTitle>Background</SectionTitle>

      {r1 && (
        <Row label="Static Background" description="Keep the background fixed instead of animating it.">
          <Toggle checked={staticBackground} onChange={(v) => $staticBackground.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row label="Static Background Source" description="What image or color to use as the static background.">
          <Select
            value={staticBackgroundType}
            options={bgTypeOptions}
            onChange={(v) => $staticBackgroundType.set(v)}
          />
        </Row>
      )}

      {r3 && (
        <Row
          label="Hide Dynamic Background in Now Playing View"
          description="Remove the animated background from the Now Playing panel."
        >
          <Toggle checked={hideNpvBg} onChange={(v) => $hideNpvBg.set(v)} />
        </Row>
      )}
    </>
  );
}
