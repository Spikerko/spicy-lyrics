import { parseTTML, type ParsedTTMLLyrics } from "../ttml/parser";

export function ParseTTML(ttml: unknown): ParsedTTMLLyrics | null {
  if (typeof ttml !== "string") return null;
  return parseTTML(ttml);
}
