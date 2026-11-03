#!/bin/bash
# Exercise install-mac.sh end to end without a Mac.
#
# A sandbox HOME, a fake /Applications/Spotify.app (via a path rewrite), and a
# fake `spicetify` on PATH that records every call and keeps a real
# config-xpui.ini. Checks: the theme file lands in the Extensions folder
# byte-identical, the extension is enabled once (not twice on re-run), apply
# runs, and the missing-Spotify path stops with a clear message.
set -u
PKG="$1"            # folder holding install-mac.sh and spicy-lyrics.js
ROOT="$(mktemp -d)"
export HOME="$ROOT/home"; mkdir -p "$HOME"
FAKEAPP="$ROOT/Applications/Spotify.app/Contents/Resources"; mkdir -p "$FAKEAPP"
BIN="$ROOT/bin"; mkdir -p "$BIN"
LOG="$ROOT/calls.log"
CFG="$HOME/.config/spicetify/config-xpui.ini"

cat > "$BIN/spicetify" <<EOF
#!/bin/bash
echo "\$*" >> "$LOG"
mkdir -p "$(dirname "$CFG")"; touch "$CFG"
case "\$1" in
  -c) echo "$CFG" ;;
  config)
    if [ "\$2" = extensions ] && [ \$# -eq 2 ]; then grep '^extensions' "$CFG" | cut -d= -f2- | tr '|' '\n' | sed 's/^ *//'
    elif [ "\$2" = extensions ]; then
      cur=\$(grep '^extensions' "$CFG" | cut -d= -f2- | sed 's/^ *//'); sed -i '/^extensions/d' "$CFG"
      echo "extensions = \${cur:+\$cur|}\$3" >> "$CFG"
    fi ;;
esac
exit 0
EOF
chmod +x "$BIN/spicetify"

# Script copy with /Applications pointed at the sandbox.
sed "s#/Applications/Spotify.app#$ROOT/Applications/Spotify.app#" "$PKG/install-mac.sh" > "$ROOT/install-mac.sh"
cp "$PKG/spicy-lyrics.js" "$ROOT/"

pass=0; fail=0
check() { if eval "$2"; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1"; fail=$((fail+1)); fi; }

PATH="$BIN:$PATH" sh "$ROOT/install-mac.sh" > "$ROOT/run1.out" 2>&1; rc1=$?
check "run 1 exits 0" "[ $rc1 -eq 0 ]"
check "theme file installed byte-identical" "cmp -s '$PKG/spicy-lyrics.js' '$HOME/.config/spicetify/Extensions/spicy-lyrics.js'"
check "spotify_path set to the app" "grep -q 'config spotify_path $FAKEAPP' '$LOG'"
check "extension enabled" "grep -q '^extensions = spicy-lyrics.js$' '$CFG'"
check "apply ran" "grep -Eq '^(backup apply|apply)$' '$LOG'"

PATH="$BIN:$PATH" sh "$ROOT/install-mac.sh" > "$ROOT/run2.out" 2>&1; rc2=$?
check "run 2 (re-install) exits 0" "[ $rc2 -eq 0 ]"
check "not enabled twice on re-run" "[ \$(grep -o 'spicy-lyrics.js' '$CFG' | wc -l) -eq 1 ]"

rm -rf "$ROOT/Applications"
PATH="$BIN:$PATH" sh "$ROOT/install-mac.sh" > "$ROOT/run3.out" 2>&1; rc3=$?
check "missing Spotify stops with exit 1" "[ $rc3 -eq 1 ]"
check "missing Spotify message shown" "grep -q 'Spotify not found' '$ROOT/run3.out'"

echo "--- calls:"; cat "$LOG"; echo "--- config:"; cat "$CFG"
echo "$pass passed, $fail failed"
rm -rf "$ROOT"
[ $fail -eq 0 ]
