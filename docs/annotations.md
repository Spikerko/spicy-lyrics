# Genius Annotations

Spicy Lyrics annotations are optional and disabled by default. Enable them from
Settings -> Annotations, then configure either a Genius access token or a proxy
URL that injects Genius authorization server-side.

## Setup

1. Create a Genius API client at https://genius.com/api-clients.
2. Copy the generated access token.
3. Open Spicy Lyrics Settings -> Annotations.
4. Enable Annotations and paste the Genius access token.

Alternatively, leave the token empty and enter a proxy URL that accepts the
encoded Genius API URL as its query input and adds authorization on the server.
No proxy URL is bundled or hardcoded.

## Privacy

The Genius token is stored locally in the Spicy Lyrics settings blob. It is not
encrypted and can be read by other extensions running in the same client. Use a
proxy if you do not want a Genius token stored client-side.

Annotations are fetched only for the currently playing track. Spicy Lyrics does
not send listening history, user identifiers, or translated lyric DOM text to
Genius.

## Limitations

Annotations are not synced lyrics. Genius referents are matched to the original
lyric payload at line level, then shown as markers on matched lines. The matcher
favors precision over recall and drops uncertain anchors. Character-range
highlighting is intentionally out of scope for this version.

The annotation card shows Genius's original fragment and plain annotation body.
It does not translate annotation text.

## Verification Checklist

- Fresh settings: annotations disabled, no button, no markers, no Genius network.
- Enabled with no token/proxy: button shows the unconfigured state and no Genius network.
- Configured track: markers attach to line, syllable, and static lyrics without row-height changes.
- Marker click opens a card or drawer and does not trigger lyric seek.
- Line, word, and emphasis clicks outside the marker still seek.
- Rapid song changes abort in-flight annotation requests and do not show stale markers.
- Bad token, offline, or provider failures keep lyrics rendering and show warning state.
- Cache clears from Settings -> Annotations -> Clear Annotation Cache.
- Translator-modified visible text does not affect marker placement.
