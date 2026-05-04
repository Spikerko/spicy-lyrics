import { useStore } from "@nanostores/react";
import React from "react";
import { $developerMode, $ttmlMakerMode } from "../../../utils/stores.ts";
import {
  RemoveCurrentLyrics_AllCaches,
  RemoveCurrentLyrics_StateCache,
  RemoveLyricsCache,
} from "../../../utils/LyricsCacheTools.ts";
import { matches, Row, SectionTitle, Toggle } from "./components.tsx";

const SECTION_NAME = "Developer";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function DeveloperSection({ query, sectionFilter }: Props) {
  const ttmlMakerMode = useStore($ttmlMakerMode);
  const developerMode = useStore($developerMode);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "TTML Maker Mode", "Enable tools for importing/managing TTML lyric files.");
  const r2 = matches(query, "Developer Mode", "Enable extra logging and debug utilities.");
  const r3 = matches(query, "Clear All Caches for Current Song", "Remove all cached lyrics data for the currently playing track.");
  const r4 = matches(query, "Clear Stored Lyrics Cache", "Delete lyrics that have been cached for up to 3 days.");
  const r5 = matches(query, "Clear Current Song from Internal State", "Remove the current song's lyrics from the in-memory state only.");

  const hasDevRows = r1 || r2;
  const hasCacheRows = r3 || r4 || r5;

  if (!hasDevRows && !hasCacheRows) return null;

  return (
    <>
      {hasDevRows && (
        <>
          <SectionTitle>Developer</SectionTitle>

          {r1 && (
            <Row label="TTML Maker Mode" description="Enable tools for importing/managing TTML lyric files.">
              <Toggle checked={ttmlMakerMode} onChange={(v) => $ttmlMakerMode.set(v)} />
            </Row>
          )}

          {r2 && (
            <Row label="Developer Mode" description="Enable extra logging and debug utilities.">
              <Toggle checked={developerMode} onChange={(v) => $developerMode.set(v)} />
            </Row>
          )}
        </>
      )}

      {hasCacheRows && (
        <>
          <SectionTitle>Cache</SectionTitle>

          {r3 && (
            <Row
              label="Clear All Caches for Current Song"
              description="Remove all cached lyrics data for the currently playing track."
            >
              <button className="sl-sp-btn" onClick={() => RemoveCurrentLyrics_AllCaches(true)}>
                Clear
              </button>
            </Row>
          )}

          {r4 && (
            <Row label="Clear Stored Lyrics Cache" description="Delete lyrics that have been cached for up to 3 days.">
              <button className="sl-sp-btn" onClick={() => RemoveLyricsCache(true)}>
                Clear Cache
              </button>
            </Row>
          )}

          {r5 && (
            <Row
              label="Clear Current Song from Internal State"
              description="Remove the current song's lyrics from the in-memory state only."
            >
              <button className="sl-sp-btn" onClick={() => RemoveCurrentLyrics_StateCache(true)}>
                Clear State
              </button>
            </Row>
          )}
        </>
      )}
    </>
  );
}
