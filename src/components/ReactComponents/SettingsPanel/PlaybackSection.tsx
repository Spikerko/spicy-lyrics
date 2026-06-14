import { useStore } from "@nanostores/react";
import React from "react";
import { $playbackOffset } from "../../../utils/stores.ts";
import { matches, Row, SectionTitle, Slider } from "./components.tsx";

const SECTION_NAME = "Playback";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function PlaybackSection({ query, sectionFilter }: Props) {
  const playbackOffset = useStore($playbackOffset);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(
    query,
    "Playback Offset",
    "Shift lyrics timing earlier or later, in milliseconds."
  );

  if (!r1) return null;

  return (
    <>
      <SectionTitle>{SECTION_NAME}</SectionTitle>

      {r1 && (
        <Row
          label="Playback Offset"
          description="Shift lyrics timing in milliseconds. Negative values show lyrics earlier; positive values delay them."
          stacked
        >
          <Slider
            value={playbackOffset}
            min={-5000}
            max={5000}
            step={10}
            defaultValue={0}
            unit="ms"
            onChange={(v) => $playbackOffset.set(v)}
          />
        </Row>
      )}
    </>
  );
}
