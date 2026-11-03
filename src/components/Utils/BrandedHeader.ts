/**
 * ─── Branded Header ───────────────────────────────────────────────────────────
 *
 * A logo pill pinned to the top-centre of the fullscreen / cinema view.
 *
 * Gated by the `brandedHeader` experiment, with `brandedHeaderGlass` choosing
 * the skin:
 *
 *   glass (default) — Liquid Glass built from tokens.css, so the pill reads as
 *                     part of the app. Mono marks are recoloured white and sit
 *                     on the material; colour marks keep their palette and get
 *                     a light chip of their own.
 *   plate           — opaque white capsule.
 *
 * Both skins live in BrandedHeader.css and are selected by page class (the
 * CSS-first rule in CLAUDE.md), so toggling needs no rebuild.
 *
 * The pill sits over an artwork-derived background that changes every track,
 * so contrast must be guaranteed. Glass does that by darkening what is behind
 * it, but only for marks that can be recoloured white. A full-colour mark
 * cannot, so it keeps a light chip.
 */

import { GIK_UGM_ASPECT, GIK_UGM_LOGO, PJS_ASPECT, PJS_LOGO } from "./BrandedHeaderAssets.ts";

/**
 * "mono"  — flat single-colour art, recoloured to white on the glass skin.
 * "color" — art whose palette must survive (pixel art, photos); never
 *           recoloured, gets a light chip instead.
 */
export type BrandedLogoKind = "mono" | "color";

export type BrandedLogo = {
  /** Image URL, or `null` for a placeholder. */
  src: string | null;
  /** Accessible label; also the placeholder caption. */
  alt: string;
  kind?: BrandedLogoKind;
  /** Width / height of the trimmed artwork. Sizes the slot so nothing is cropped. */
  aspect?: number;
  /**
   * Optical size correction, 1 = none. A dense, full-bleed mark reads heavier
   * than an airy wordmark of equal height, so it can be pulled back slightly.
   */
  scale?: number;
};

/** The logos, left to right. */
export const BRANDED_LOGOS: BrandedLogo[] = [
  { src: GIK_UGM_LOGO, alt: "GIK UGM", kind: "mono", aspect: GIK_UGM_ASPECT, scale: 1 },
  {
    src: PJS_LOGO,
    alt: "Perayaan Jumat Sporty GIK UGM",
    kind: "color",
    aspect: PJS_ASPECT,
    scale: 0.92,
  },
];

const DEFAULT_ASPECT = 2;
/** No logo may exceed this many pill-heights in width. */
const MAX_ASPECT = 3.2;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function LogoSlot(logo: BrandedLogo, index: number): string {
  const alt = escapeAttr(logo.alt);
  const kind = logo.kind ?? "mono";
  const ratio = Math.min(logo.aspect ?? DEFAULT_ASPECT, MAX_ASPECT);
  const scale = logo.scale ?? 1;

  const inner =
    logo.src === null
      ? `<span class="BrandedHeader__Placeholder">${alt}</span>`
      : `<img class="BrandedHeader__Image" src="${escapeAttr(logo.src)}" alt="${alt}" draggable="false" />`;

  // --logo-index staggers the entrance animation.
  const style = `--logo-aspect: ${ratio.toFixed(3)}; --logo-scale: ${scale}; --logo-index: ${index}`;
  return `<div class="BrandedHeader__Logo" data-kind="${kind}" style="${style}">${inner}</div>`;
}

/** The full pill, as a string for the PageView template. */
export function BrandedHeaderHTML(): string {
  if (BRANDED_LOGOS.length === 0) return "";
  const slots = BRANDED_LOGOS.map((logo, i) => {
    // A hairline between marks reads as one lockup rather than two stickers.
    const divider = i > 0 ? `<span class="BrandedHeader__Divider"></span>` : "";
    return divider + LogoSlot(logo, i);
  }).join("");
  return `<div class="BrandedHeader" aria-hidden="true">${slots}</div>`;
}
