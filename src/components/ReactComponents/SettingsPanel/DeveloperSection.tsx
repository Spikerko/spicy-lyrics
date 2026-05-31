import { useStore } from "@nanostores/react";
import React from "react";
import { $developerMode } from "../../../utils/stores.ts";
import { matches, Row, SectionTitle, Toggle } from "./components.tsx";

const SECTION_NAME = "Developer";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function DeveloperSection({ query, sectionFilter }: Props) {
  const developerMode = useStore($developerMode);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Developer Mode", "Enable extra logging and debug utilities.");

  if (!r1) return null;

  return (
    <>
      <SectionTitle>Developer</SectionTitle>

      {r1 && (
        <Row label="Developer Mode" description="Enable extra logging and debug utilities.">
          <Toggle checked={developerMode} onChange={(v) => $developerMode.set(v)} />
        </Row>
      )}
    </>
  );
}
