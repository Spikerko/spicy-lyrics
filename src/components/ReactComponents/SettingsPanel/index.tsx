import { useState } from "react";
import AppearanceSection from "./AppearanceSection.tsx";
import BackgroundSection from "./BackgroundSection.tsx";
import CacheSection from "./CacheSection.tsx";
import DeveloperSection from "./DeveloperSection.tsx";
import InterfaceSection from "./InterfaceSection.tsx";
import LyricsSection from "./LyricsSection.tsx";
import { FilterDropdown, SearchBar } from "./components.tsx";

const SECTIONS = ["Background", "Lyrics Display", "Appearance", "Interface", "Developer", "Cache"];

export default function SettingsPanel() {
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("All");

  return (
    <div style={{ padding: "8px 0" }} className="slm w-40">
      <div className="sl-sp-toolbar">
        <SearchBar value={query} onChange={setQuery} />
        <FilterDropdown sections={SECTIONS} value={sectionFilter} onChange={setSectionFilter} />
      </div>

      <BackgroundSection query={query} sectionFilter={sectionFilter} />
      <LyricsSection query={query} sectionFilter={sectionFilter} />
      <AppearanceSection query={query} sectionFilter={sectionFilter} />
      <InterfaceSection query={query} sectionFilter={sectionFilter} />
      <DeveloperSection query={query} sectionFilter={sectionFilter} />
      <CacheSection query={query} sectionFilter={sectionFilter} />
    </div>
  );
}
