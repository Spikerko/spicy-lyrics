import { useStore } from "@nanostores/react";
import React from "react";
import { $skipSpicyFont } from "../../../utils/stores.ts";
import { matches, Row, SectionTitle, Toggle } from "./components.tsx";

const SECTION_NAME = "Appearance";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function AppearanceSection({ query, sectionFilter }: Props) {
  const skipSpicyFont = useStore($skipSpicyFont);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Use Default Font", "Disable the custom Spicy Lyrics font and fall back to your root font.");

  if (!r1) return null;

  return (
    <>
      <SectionTitle>Appearance</SectionTitle>

      {r1 && (
        <Row label="Use System Font" description="Disable the custom Spicy Lyrics font and fall back to your system font.">
          <Toggle checked={skipSpicyFont} onChange={(v) => $skipSpicyFont.set(v)} />
        </Row>
      )}
    </>
  );
}
