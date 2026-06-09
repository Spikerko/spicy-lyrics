export function getLyricsIdentity(uri: string): string {
  if (uri.startsWith("spotify:local:")) {
    return uri;
  }

  return uri.split(":")[2] ?? uri;
}
