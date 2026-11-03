/**
 * ─── Halloween Theme ──────────────────────────────────────────────────────────
 *
 * PJS #13 "Spooky" night scene for the fullscreen / cinema view. Gated by the
 * `halloweenTheme` experiment (page class Exp_HalloweenTheme); all visibility
 * and layout lives in HalloweenTheme.css.
 *
 * Two layers, both inside .ContentBox so they share the page's container-query
 * units and therefore track Spicy Lyrics' own layout maths exactly:
 *
 *   .HalloweenScene  z-index 1: sky, moon, clouds, haunted house, graves,
 *                    tree, ground, characters, music notes, and the readability
 *                    scrim. Sits above the dynamic background (z auto, which it
 *                    hides) and below the lyrics (z 4) and NowBar (z 10), so it
 *                    can never draw over content.
 *   .HalloweenTop    z-index 3: bats, web and pumpkin branch, confined to the
 *                    band above the album cover. Under the lyrics (z 4).
 *   .HalloweenLogo   z-index 5: the Spooky logo alone, OVER the lyrics (design
 *                    v1.1). The lyrics fade out before reaching it (CSS mask),
 *                    so it never sits on half-hidden words. Under NowBar (z 10).
 *
 * Every element is pointer-events: none, so nothing intercepts a click.
 */

import * as A from "./HalloweenAssets.ts";

type Piece = {
  /** BEM element name, also the CSS hook. */
  part: string;
  src: string;
  aspect: number;
  /** Extra inline custom properties (animation index, variant, etc.). */
  vars?: Record<string, string | number>;
};

function img({ part, src, aspect, vars }: Piece): string {
  const style = Object.entries({ "--aspect": aspect.toFixed(4), ...vars })
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
  return `<img class="Hlw__${part}" src="${src}" alt="" draggable="false" style="${style}" />`;
}

/** Music notes rising from the lute: index drives position, size and timing in CSS. */
const NOTES: Piece[] = [0, 1, 2, 3, 4, 5].map((i) => ({
  part: "Note",
  src: i % 3 === 1 ? A.NOTE_BROWN : A.NOTE_ORANGE,
  aspect: i % 3 === 1 ? A.NOTE_BROWN_ASPECT : A.NOTE_ORANGE_ASPECT,
  vars: { "--i": i },
}));

const BATS: Piece[] = [
  { part: "Bat", src: A.BAT_1, aspect: A.BAT_1_ASPECT, vars: { "--i": 0 } },
  { part: "Bat", src: A.BAT_2, aspect: A.BAT_2_ASPECT, vars: { "--i": 1 } },
  { part: "Bat", src: A.BAT_3, aspect: A.BAT_3_ASPECT, vars: { "--i": 2 } },
  { part: "Bat", src: A.BAT_4, aspect: A.BAT_4_ASPECT, vars: { "--i": 3 } },
];

/** Markup for the whole theme, as a string for the PageView template. */
export function HalloweenThemeHTML(): string {
  const scene = [
    `<div class="Hlw__Sky"></div>`,
    `<div class="Hlw__MoonGlow"></div>`,
    img({ part: "Moon", src: A.MOON, aspect: A.MOON_ASPECT }),
    `<div class="Hlw__Clouds" style="--cloud: url('${A.CLOUDS}'); --aspect: ${A.CLOUDS_ASPECT.toFixed(4)}"></div>`,
    img({ part: "House", src: A.HOUSE, aspect: A.HOUSE_ASPECT }),
    img({ part: "Graves", src: A.GRAVES, aspect: A.GRAVES_ASPECT }),
    img({ part: "Tree", src: A.TREE, aspect: A.TREE_ASPECT }),
    `<div class="Hlw__Ground" style="--grass: url('${A.GRASS}'); --aspect: ${A.GRASS_ASPECT.toFixed(4)}"></div>`,
    img({ part: "Witch", src: A.WITCH, aspect: A.WITCH_ASPECT }),
    img({ part: "Lute", src: A.LUTE, aspect: A.LUTE_ASPECT }),
    // Rises from the graves and shambles left until it fades out, on a loop.
    // The wrapper does the walk, the image does the rise and the stagger.
    `<div class="Hlw__ZombieWalk">${img({ part: "Zombie", src: A.ZOMBIE, aspect: A.ZOMBIE_ASPECT })}</div>`,
    ...NOTES.map(img),
    `<div class="Hlw__Scrim"></div>`,
  ].join("");

  const top = [
    img({ part: "Web", src: A.WEB, aspect: A.WEB_ASPECT }),
    img({ part: "Branch", src: A.BRANCH, aspect: A.BRANCH_ASPECT }),
    ...BATS.map(img),
  ].join("");

  return (
    `<div class="HalloweenScene" aria-hidden="true">${scene}</div>` +
    `<div class="HalloweenTop" aria-hidden="true">${top}</div>` +
    `<div class="HalloweenLogo" aria-hidden="true">${img({ part: "Logo", src: A.LOGO, aspect: A.LOGO_ASPECT })}</div>`
  );
}
