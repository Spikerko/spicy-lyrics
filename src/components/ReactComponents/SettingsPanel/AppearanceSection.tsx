import { useStore } from "@nanostores/react";
import React from "react";
import { $maxAnimationFps, $skipSpicyFont } from "../../../utils/stores.ts";
import { matches, Row, SectionTitle, Select, Toggle } from "./components.tsx";

const SECTION_NAME = "Appearance";
const fpsOptions = ["30", "60", "120", "unlimited"];
const fpsLabels = ["30 FPS", "60 FPS", "120 FPS", "Unlimited"];

interface Props {
  query: string;
  sectionFilter: string;
}

export default function AppearanceSection({ query, sectionFilter }: Props) {
  const skipSpicyFont = useStore($skipSpicyFont);
  const maxAnimationFps = useStore($maxAnimationFps);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(
    query,
    "Use Default Font",
    "Disable the custom Spicy Lyrics font and fall back to your root font."
  );
  const r2 = matches(
    query,
    "Animation Frame Rate",
    "Limit how often the lyrics and the animated background are redrawn. Lower values use less CPU, especially on high refresh rate displays."
  );

  if (!r1 && !r2) return null;

  return (
    <>
      <SectionTitle>Appearance</SectionTitle>

      {r1 && (
        <Row
          label="Use System Font"
          description="Disable the custom Spicy Lyrics font and fall back to your system font."
        >
          <Toggle checked={skipSpicyFont} onChange={(v) => $skipSpicyFont.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row
          label="Animation Frame Rate"
          description="Limit how often the lyrics and the animated background are redrawn. Lower values use less CPU, especially on high refresh rate displays."
        >
          <Select
            value={maxAnimationFps}
            options={fpsOptions}
            labels={fpsLabels}
            onChange={(v) => $maxAnimationFps.set(v)}
          />
        </Row>
      )}
    </>
  );
}
