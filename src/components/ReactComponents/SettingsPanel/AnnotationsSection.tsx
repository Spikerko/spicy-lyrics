import { useStore } from "@nanostores/react";
import React from "react";
import { toast } from "sonner";
import {
  $annotationDebug,
  $annotationMarkersEnabled,
  $annotationProvider,
  $annotationsEnabled,
  $geniusAccessToken,
  $geniusProxyUrl,
} from "../../../utils/Annotations/AnnotationState.ts";
import { clearAll } from "../../../utils/Annotations/AnnotationCache.ts";
import {
  matches,
  Row,
  SecretInput,
  Select,
  SectionTitle,
  TextInput,
  Toggle,
} from "./components.tsx";

const SECTION_NAME = "Annotations";

interface Props {
  query: string;
  sectionFilter: string;
}

export default function AnnotationsSection({ query, sectionFilter }: Props) {
  const enabled = useStore($annotationsEnabled);
  const markersEnabled = useStore($annotationMarkersEnabled);
  const provider = useStore($annotationProvider);
  const token = useStore($geniusAccessToken);
  const proxy = useStore($geniusProxyUrl);
  const debug = useStore($annotationDebug);

  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  const r1 = matches(query, "Enable Annotations", "Show Genius annotations inside lyrics");
  const r2 = matches(query, "Annotation Provider", "Choose the annotation source");
  const r3 = matches(query, "Show Annotation Markers", "Show line markers where annotations exist");
  const r4 = matches(query, "Genius Access Token", "Stored locally in this client's settings");
  const r5 = matches(
    query,
    "Genius Proxy URL",
    "Optional proxy that can inject Genius authorization"
  );
  const r6 = matches(query, "Debug Annotation Matching", "Log annotation matcher decisions");
  const r7 = matches(query, "Clear Annotation Cache", "Remove cached annotation responses");

  if (!r1 && !r2 && !r3 && !r4 && !r5 && !r6 && !r7) return null;

  return (
    <>
      <SectionTitle>Annotations</SectionTitle>

      {r1 && (
        <Row label="Enable Annotations" description="Show Genius annotations inside lyrics">
          <Toggle checked={enabled} onChange={(v) => $annotationsEnabled.set(v)} />
        </Row>
      )}

      {r2 && (
        <Row
          label="Annotation Provider"
          description="Choose the annotation source"
          disabled={!enabled}
        >
          <Select
            value={provider}
            options={["genius"]}
            labels={["Genius"]}
            onChange={(v) => $annotationProvider.set(v)}
            disabled
          />
        </Row>
      )}

      {r3 && (
        <Row
          label="Show Annotation Markers"
          description="Show line markers where annotations exist"
          disabled={!enabled}
        >
          <Toggle
            checked={markersEnabled}
            onChange={(v) => $annotationMarkersEnabled.set(v)}
            disabled={!enabled}
          />
        </Row>
      )}

      {r4 && (
        <Row
          label="Genius Access Token"
          description="Used only when no proxy is set. Direct token requests are often blocked by the client's cross-origin rules - if annotations show a warning, use a proxy instead. The token is stored locally in this client's settings, unencrypted and readable by other extensions. Annotations are fetched only for the currently playing track; no listening history is sent to Genius."
          disabled={!enabled}
          stacked
        >
          <SecretInput
            value={token}
            onChange={(v) => $geniusAccessToken.set(v)}
            placeholder="Genius API token"
            disabled={!enabled}
          />
        </Row>
      )}

      {r5 && (
        <Row
          label="Genius Proxy URL (optional)"
          description="Recommended. Injects Genius authorization server-side and avoids the client's cross-origin restrictions. Takes the encoded Genius API URL as its query input."
          disabled={!enabled}
          stacked
        >
          <TextInput
            value={proxy}
            onChange={(v) => $geniusProxyUrl.set(v)}
            placeholder="https://your-proxy/?url="
            disabled={!enabled}
          />
        </Row>
      )}

      {r6 && (
        <Row
          label="Debug Annotation Matching"
          description="Log matcher decisions without logging Genius tokens"
          disabled={!enabled}
        >
          <Toggle
            checked={debug}
            onChange={(v) => $annotationDebug.set(v)}
            disabled={!enabled}
          />
        </Row>
      )}

      {r7 && (
        <Row label="Clear Annotation Cache" description="Remove cached annotation responses">
          <button
            className="sl-sp-btn"
            onClick={() => {
              clearAll()
                .then(() => toast.success("Annotation cache cleared"))
                .catch(() => toast.error("Could not clear annotation cache"));
            }}
          >
            Clear
          </button>
        </Row>
      )}
    </>
  );
}
