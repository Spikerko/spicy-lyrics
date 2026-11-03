"""Negative controls for tools/mac/test_install.sh.

Each control breaks one behaviour of install-mac.sh (in this folder), runs the
sandbox test with dist/spicy-lyrics.js, and expects the check that guards that
behaviour to fail. Needs bash (Git Bash on Windows; set BASH=... if it is not
on PATH). Scratch copies go to tools/mac/_negctl (git-ignored).
"""

import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(REPO, "dist", "spicy-lyrics.js")
SCRATCH = os.path.join(HERE, "_negctl")
BASH = os.environ.get("BASH") or shutil.which("bash") or r"C:\Program Files\Git\bin\bash.exe"


def posix(p):
    """Windows path -> Git Bash path (D:\\a\\b -> /d/a/b); unchanged elsewhere."""
    if os.name != "nt":
        return p
    drive, rest = os.path.splitdrive(os.path.abspath(p))
    return "/" + drive.rstrip(":").lower() + rest.replace("\\", "/")


src = open(os.path.join(HERE, "install-mac.sh"), newline="").read()
GUARD = 'case "$(spicetify config extensions 2>/dev/null)" in\n  *spicy-lyrics.js*) ;;\n  *) spicetify config extensions spicy-lyrics.js ;;\nesac'
CONTROLS = [
    ("no duplicate guard", GUARD, "spicetify config extensions spicy-lyrics.js", "not enabled twice on re-run"),
    ("theme file not copied", 'cp "$HERE/spicy-lyrics.js" "$EXT/spicy-lyrics.js"', ":", "theme file installed byte-identical"),
    ("no Spotify check", 'if [ ! -d "$SPOTIFY" ]; then', "if false; then", "missing Spotify stops with exit 1"),
]
if not os.path.exists(BUILD):
    raise SystemExit(f"build first: {BUILD} not found")
ok_all = True
for name, old, new, expect in CONTROLS:
    assert old in src, f"pattern for '{name}' not found in install-mac.sh"
    shutil.rmtree(SCRATCH, ignore_errors=True)
    os.makedirs(SCRATCH)
    shutil.copy(BUILD, os.path.join(SCRATCH, "spicy-lyrics.js"))
    open(os.path.join(SCRATCH, "install-mac.sh"), "w", newline="\n").write(src.replace(old, new))
    out = subprocess.run([BASH, posix(os.path.join(HERE, "test_install.sh")), posix(SCRATCH)],
                         capture_output=True, text=True).stdout
    failed = [l[6:] for l in out.splitlines() if l.startswith("FAIL  ")]
    caught = expect in failed
    ok_all &= caught
    print(f"{'CAUGHT' if caught else 'MISSED'}  {name}: failing checks {failed}")
shutil.rmtree(SCRATCH, ignore_errors=True)
print("all controls caught" if ok_all else "SOME CONTROLS MISSED")
raise SystemExit(0 if ok_all else 1)
