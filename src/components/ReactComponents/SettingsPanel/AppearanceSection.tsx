import { useStore } from "@nanostores/react";
import React from "react";
import { $oldStyleFont, $skipSpicyFont } from "../../../utils/stores.ts";
import { matches, Row, SectionTitle, Toggle } from "./components.tsx";

const SECTION_NAME = "Appearance";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function AppearanceSection({ query, sectionFilter }: Props) {
  const skipSpicyFont = useStore($skipSpicyFont);
  const oldStyleFont = useStore($oldStyleFont);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Use System Font", "Disable the custom Spicy Lyrics font and fall back to your system font.");
  const r2 = matches(query, "Use Classic Font Style", "Use the older font style. Ignored when Use System Font is enabled.");

  if (!r1 && !r2) return null;

  return (
    <>
      <SectionTitle>Appearance</SectionTitle>

      {r1 && (
        <Row label="Use System Font" description="Disable the custom Spicy Lyrics font and fall back to your system font.">
          <Toggle checked={skipSpicyFont} onChange={(v) => $skipSpicyFont.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row label="Use Classic Font Style" description="Use the older font style. Ignored when Use System Font is enabled.">
          <Toggle checked={oldStyleFont} onChange={(v) => $oldStyleFont.set(v)} />
        </Row>
      )}
    </>
  );
}
