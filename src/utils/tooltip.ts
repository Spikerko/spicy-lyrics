export function createTooltip(target: Element, props: Record<string, unknown>) {
  const tooltip = Spicetify.Tippy?.(target, props);
  tooltip?.popper?.classList.add("SpicyLyrics_Tooltip");
  return tooltip;
}
