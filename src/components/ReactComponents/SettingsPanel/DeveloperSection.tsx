import { useStore } from "@nanostores/react";
import React from "react";
import { $developerMode, $spotifyClientId, $spotifyClientSecret } from "../../../utils/stores.ts";
import { matches, Row, SectionTitle, TextInput, Toggle } from "./components.tsx";

const SECTION_NAME = "Developer";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function DeveloperSection({ query, sectionFilter }: Props) {
  const developerMode = useStore($developerMode);
  const spotifyClientId = useStore($spotifyClientId);
  const spotifyClientSecret = useStore($spotifyClientSecret);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Developer Mode", "Enable extra logging and debug utilities.");
  const r2 = matches(query, "Spotify Client ID", "Used to look up matching Spotify URIs for local tracks.");
  const r3 = matches(query, "Spotify Client Secret", "Used alongside the client ID to resolve local tracks.");

  if (!r1 && !r2 && !r3) return null;

  return (
    <>
      <SectionTitle>Developer</SectionTitle>

      {r1 && (
        <Row label="Developer Mode" description="Enable extra logging and debug utilities.">
          <Toggle checked={developerMode} onChange={(v) => $developerMode.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row
          label="Spotify Client ID"
          description="Used to look up matching Spotify URIs for local tracks."
          stacked
        >
          <TextInput
            value={spotifyClientId}
            onChange={(v) => $spotifyClientId.set(v)}
            placeholder="Spotify client ID"
          />
        </Row>
      )}

      {r3 && (
        <Row
          label="Spotify Client Secret"
          description="Used alongside the client ID to resolve local tracks."
          stacked
        >
          <TextInput
            value={spotifyClientSecret}
            onChange={(v) => $spotifyClientSecret.set(v)}
            placeholder="Spotify client secret"
            type="password"
          />
        </Row>
      )}
    </>
  );
}
