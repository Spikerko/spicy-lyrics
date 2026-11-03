"""Apply (or check) the three integration hooks for the branded header.

Idempotent and line-ending aware. Each hook asserts its anchor exists exactly
once, so an upstream change that moves an anchor fails loudly instead of
silently skipping. Re-run after every `git pull`.

Usage:
  python tools/branded-header/integrate.py          apply
  python tools/branded-header/integrate.py --check  report only, exit 1 if missing
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

EXPERIMENTS_BLOCK = """  {
    id: "brandedHeader",
    label: "Branded Header",
    description:
      "Shows a logo pill at the top of the fullscreen and cinema views. Disable to leave the top of the screen clear.",
    default: true,
    pageClass: "Exp_BrandedHeader",
  },
  {
    id: "brandedHeaderGlass",
    label: "Branded Header: Glass",
    description:
      "Renders the branded header as frosted Liquid Glass with monochrome logos recoloured white. Disable for an opaque white plate.",
    default: true,
    pageClass: "Exp_BrandedHeaderGlass",
  },
"""

HALLOWEEN_BLOCK = """  {
    id: "halloweenTheme",
    label: "Halloween Theme (PJS #13)",
    description:
      "Replaces the fullscreen and cinema-view background with an animated PJS #13 Spooky night scene. Disable to bring back the normal album-colour background.",
    default: true,
    pageClass: "Exp_HalloweenTheme",
  },
"""

HOOKS = [
    {
        "name": "css import",
        "file": "src/app.tsx",
        "marker": 'import "./css/BrandedHeader.css";',
        "anchor": 'import "./css/ContentBox.css";',
        "insert": "after",
        "text": 'import "./css/BrandedHeader.css";',
    },
    {
        "name": "module import",
        "file": "src/components/Pages/PageView.ts",
        "marker": 'import { BrandedHeaderHTML } from "../Utils/BrandedHeader.ts";',
        "anchor": '} from "../../utils/experiments.ts";',
        "insert": "after",
        "text": 'import { BrandedHeaderHTML } from "../Utils/BrandedHeader.ts";',
    },
    {
        "name": "template slot",
        "file": "src/components/Pages/PageView.ts",
        "marker": "${BrandedHeaderHTML()}",
        "anchor": '        <div class="ContentBox">',
        "insert": "after",
        "text": "            ${BrandedHeaderHTML()}",
    },
    {
        "name": "halloween css",
        "file": "src/app.tsx",
        "marker": 'import "./css/HalloweenTheme.css";',
        "anchor": 'import "./css/ContentBox.css";',
        "insert": "after",
        "text": 'import "./css/HalloweenTheme.css";',
    },
    {
        "name": "halloween import",
        "file": "src/components/Pages/PageView.ts",
        "marker": 'import { HalloweenThemeHTML } from "../Utils/HalloweenTheme.ts";',
        "anchor": '} from "../../utils/experiments.ts";',
        "insert": "after",
        "text": 'import { HalloweenThemeHTML } from "../Utils/HalloweenTheme.ts";',
    },
    {
        # First child of .ContentBox, so it paints under every content sibling.
        "name": "halloween slot",
        "file": "src/components/Pages/PageView.ts",
        "marker": "${HalloweenThemeHTML()}",
        "anchor": '        <div class="ContentBox">',
        "insert": "after",
        "text": "            ${HalloweenThemeHTML()}",
    },
    {
        "name": "experiments",
        "file": "src/utils/experiments.ts",
        "marker": 'id: "brandedHeader",',
        "anchor": "] as const satisfies readonly Experiment[];",
        "insert": "before",
        "text": EXPERIMENTS_BLOCK.rstrip("\n"),
    },
    {
        # Upgrades an existing install that only has the branded-header entries.
        "name": "halloween exp",
        "file": "src/utils/experiments.ts",
        "marker": 'id: "halloweenTheme",',
        "anchor": "] as const satisfies readonly Experiment[];",
        "insert": "before",
        "text": HALLOWEEN_BLOCK.rstrip("\n"),
    },
]


def main():
    check_only = "--check" in sys.argv
    missing = []

    for hook in HOOKS:
        path = os.path.join(REPO, hook["file"])
        raw = open(path, "rb").read().decode("utf-8")
        eol = "\r\n" if "\r\n" in raw else "\n"
        text = raw.replace("\r\n", "\n")

        if hook["marker"] in text:
            print(f"ok       {hook['name']:14} ({hook['file']})")
            continue

        count = text.count(hook["anchor"])
        if count != 1:
            sys.exit(
                f"FAIL     {hook['name']}: anchor found {count}x in {hook['file']}, "
                f"expected 1. Upstream changed; update integrate.py.\n  anchor: {hook['anchor']!r}"
            )

        if check_only:
            missing.append(hook["name"])
            print(f"MISSING  {hook['name']:14} ({hook['file']})")
            continue

        if hook["insert"] == "after":
            text = text.replace(hook["anchor"], hook["anchor"] + "\n" + hook["text"], 1)
        else:
            text = text.replace(hook["anchor"], hook["text"] + "\n" + hook["anchor"], 1)

        with open(path, "wb") as fh:
            fh.write(text.replace("\n", eol).encode("utf-8"))
        print(f"applied  {hook['name']:14} ({hook['file']}, {'CRLF' if eol == chr(13) + chr(10) else 'LF'})")

    if check_only and missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
