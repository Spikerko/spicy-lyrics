"""Negative controls for tools/windows/test_install.ps1: break one behaviour
of install-windows.ps1 at a time, expect the guarding check to fail.

Uses the installer in this folder and dist/spicy-lyrics.js (run `bun run
build` first). Scratch copies go to tools/windows/_negctl (git-ignored).
"""

import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(REPO, "dist", "spicy-lyrics.js")
SCRATCH = os.path.join(HERE, "_negctl")
TEST = os.path.join(HERE, "test_install.ps1")
src = open(os.path.join(HERE, "install-windows.ps1"), encoding="utf-8").read()

CONTROLS = [
    ("no duplicate guard", "if ($enabled -notmatch 'spicy-lyrics\\.js') { & spicetify config extensions spicy-lyrics.js | Out-Null }",
     "& spicetify config extensions spicy-lyrics.js | Out-Null", "not enabled twice on re-run"),
    ("theme file not copied", "Copy-Item -Force (Join-Path $here 'spicy-lyrics.js') (Join-Path $ext 'spicy-lyrics.js')", "", "theme file installed byte-identical"),
    ("no Spotify check", "if (-not (Test-Path $spotifyExe)) {", "if ($false) {", "missing Spotify stops with exit 1"),
]
if not os.path.exists(BUILD):
    raise SystemExit(f"build first: {BUILD} not found")
ok_all = True
for name, old, new, expect in CONTROLS:
    assert old in src, f"pattern for '{name}' not found"
    shutil.rmtree(SCRATCH, ignore_errors=True)
    os.makedirs(SCRATCH)
    shutil.copy(BUILD, os.path.join(SCRATCH, "spicy-lyrics.js"))
    open(os.path.join(SCRATCH, "install-windows.ps1"), "w", encoding="utf-8").write(src.replace(old, new))
    out = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", TEST, "-Pkg", SCRATCH],
                         capture_output=True, text=True).stdout
    failed = [l[6:] for l in out.splitlines() if l.startswith("FAIL  ")]
    caught = expect in failed
    ok_all &= caught
    print(f"{'CAUGHT' if caught else 'MISSED'}  {name}: failing checks {failed}")
shutil.rmtree(SCRATCH, ignore_errors=True)
print("all controls caught" if ok_all else "SOME CONTROLS MISSED")
raise SystemExit(0 if ok_all else 1)
