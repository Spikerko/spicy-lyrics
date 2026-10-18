/** Label and value as separate spans, so each look can tone them apart and the old one can join them with a colon. */
export function CreditsRow(row: HTMLElement, label: string, value: string): HTMLElement {
  const labelElement = document.createElement("span");
  labelElement.classList.add("CreditsLabel");
  labelElement.textContent = label;

  const valueElement = document.createElement("span");
  valueElement.classList.add("CreditsValue");
  valueElement.textContent = value;

  row.append(labelElement, " ", valueElement);
  return valueElement;
}
