#!/bin/sh
# Install the PJS #13 Spicy Lyrics build on macOS.
# Run from this folder:  sh install-mac.sh
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
SPOTIFY="/Applications/Spotify.app/Contents/Resources"

if [ ! -d "$SPOTIFY" ]; then
  echo "Spotify not found in /Applications. Install the Spotify app from spotify.com (not the web player), open it once, then run this again."
  exit 1
fi

# 1. Spicetify, if missing.
if ! command -v spicetify >/dev/null 2>&1 && [ ! -x "$HOME/.spicetify/spicetify" ]; then
  echo "Installing Spicetify..."
  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh
fi
command -v spicetify >/dev/null 2>&1 || PATH="$HOME/.spicetify:$PATH"

# 2. Point it at Spotify and find its Extensions folder.
spicetify config spotify_path "$SPOTIFY" >/dev/null
EXT="$(dirname "$(spicetify -c)")/Extensions"
mkdir -p "$EXT"

# 3. Copy the theme build and enable it. If the Marketplace copy of Spicy
#    Lyrics is installed, remove it there first: two copies clash.
cp "$HERE/spicy-lyrics.js" "$EXT/spicy-lyrics.js"
case "$(spicetify config extensions 2>/dev/null)" in
  *spicy-lyrics.js*) ;;
  *) spicetify config extensions spicy-lyrics.js ;;
esac

# 4. Apply. First run needs a backup of the stock Spotify files.
spicetify backup apply 2>/dev/null || spicetify apply

echo
echo "Done. Spotify restarts with the PJS #13 theme."
echo "Open Spicy Lyrics, then Cinema View / Fullscreen to see the Halloween scene."
