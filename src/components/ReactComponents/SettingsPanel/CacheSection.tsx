import React from "react";
import {
  RemoveCurrentLyrics_AllCaches,
  RemoveCurrentLyrics_StateCache,
  RemoveLyricsCache,
} from "../../../utils/LyricsCacheTools.ts";
import { matches, Row, SectionTitle } from "./components.tsx";

const SECTION_NAME = "Cache";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function CacheSection({ query, sectionFilter }: Props) {
  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Clear All Caches for Current Song", "Remove all cached lyrics data for the currently playing track.");
  const r2 = matches(query, "Clear Stored Lyrics Cache", "Delete lyrics that have been cached for up to 3 days.");
  const r3 = matches(query, "Clear Current Song from Internal State", "Remove the current song's lyrics from the in-memory state only.");

  if (!r1 && !r2 && !r3) return null;

  return (
    <>
      <SectionTitle>Cache</SectionTitle>

      {r1 && (
        <Row
          label="Clear All Caches for Current Song"
          description="Remove all cached lyrics data for the currently playing track."
        >
          <button className="sl-sp-btn" onClick={() => RemoveCurrentLyrics_AllCaches(true)}>
            Clear
          </button>
        </Row>
      )}

      {r2 && (
        <Row label="Clear Stored Lyrics Cache" description="Delete lyrics that have been cached for up to 3 days.">
          <button className="sl-sp-btn" onClick={() => RemoveLyricsCache(true)}>
            Clear Cache
          </button>
        </Row>
      )}

      {r3 && (
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
  );
}
