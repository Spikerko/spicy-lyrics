import { useStore } from "@nanostores/react";
import React from "react";
import { $scrollLeadEnabled, $scrollLeadMs, $smoothScrolling } from "../../../utils/stores.ts";
import { matches, Row, SectionTitle, Slider, Toggle } from "./components.tsx";

const SECTION_NAME = "Scrolling";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function ScrollingSection({ query, sectionFilter }: Props) {
  const scrollLeadEnabled = useStore($scrollLeadEnabled);
  const scrollLeadMs = useStore($scrollLeadMs);
  const smoothScrolling = useStore($smoothScrolling);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(
    query,
    "Early Scroll",
    "Start scrolling to the next line slightly before it becomes active."
  );
  const r2 = matches(
    query,
    "Early Scroll Time",
    "How early the next line is scrolled to, before it becomes active."
  );
  const r3 = matches(
    query,
    "Smooth Scrolling",
    "Makes the lyrics scroll smoothly."
  );

  if (!r1 && !r2 && !r3) return null;

  return (
    <>
      <SectionTitle>{SECTION_NAME}</SectionTitle>

      {r1 && (
        <Row
          label="Early Scroll"
          description="Start scrolling to the next line slightly before it becomes active, so the move feels less abrupt."
        >
          <Toggle checked={scrollLeadEnabled} onChange={(v) => $scrollLeadEnabled.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row
          label="Early Scroll Time"
          description="How early the next line is scrolled to, before it becomes active."
          disabled={!scrollLeadEnabled}
          disabledReason="Enable Early Scroll to modify this setting"
          stacked
        >
          <Slider
            value={scrollLeadMs}
            min={0}
            max={800}
            step={10}
            defaultValue={250}
            unit="ms"
            onChange={(v) => $scrollLeadMs.set(v)}
            disabled={!scrollLeadEnabled}
          />
        </Row>
      )}

      {r3 && (
        <Row
          label="Smooth Scrolling"
          description="Makes the lyrics scroll smoothly."
        >
          <Toggle checked={smoothScrolling} onChange={(v) => $smoothScrolling.set(v)} />
        </Row>
      )}
    </>
  );
}
