// A word sung in several syllables is one .word-group box. When its syllables
// together are wider than the line, the box would fill the whole row and the next
// word could not share its last wrapped row, so the group is dissolved
// (.WrapFlow, display: contents) and its syllables flow into the line themselves.
// Judged from the syllables' own widths, which don't change when the group does.
export const FlowWideWordGroups = (Container: HTMLElement) => {
  const groups = Container.querySelectorAll<HTMLElement>(".word-group");
  const available = new Map<HTMLElement, number>();
  const wide: HTMLElement[] = [];
  const narrow: HTMLElement[] = [];
  for (const group of groups) {
    const line = group.parentElement;
    if (!line) continue;
    let room = available.get(line);
    if (room === undefined) {
      const style = getComputedStyle(line);
      room = line.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      available.set(line, room);
    }
    let width = 0;
    for (const syllable of group.children) width += (syllable as HTMLElement).offsetWidth;
    // The space after the word's last syllable sits inside that syllable's box in flow mode.
    const last = group.lastElementChild;
    if (last) width -= parseFloat(getComputedStyle(last, "::after").marginRight) || 0;
    (width > room ? wide : narrow).push(group);
  }
  for (const group of wide) group.classList.add("WrapFlow");
  for (const group of narrow) group.classList.remove("WrapFlow");
};
