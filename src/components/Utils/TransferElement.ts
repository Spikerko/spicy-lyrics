import Logger from "../../utils/Logger.ts";

const transferLogger = new Logger("Transfer Element");

/**
 * Transfer an element to a target container at a specified index
 * @param element - The element to transfer
 * @param targetContainer - The container to transfer the element to
 * @param index - The index at which to insert the element (-1 to append at the end)
 */
export default function TransferElement(
  element: HTMLElement,
  targetContainer: HTMLElement,
  index = -1
): void {
  if (!element || !targetContainer) {
    transferLogger.error("Both element and target container must be provided.");
    return;
  }

  try {
    // If index is out of bounds, append the element at the end
    if (index < 0 || index >= targetContainer.children.length) {
      targetContainer.appendChild(element);
    } else {
      // Insert before the element at the specified index
      targetContainer.insertBefore(element, targetContainer.children[index]);
    }
  } catch (error) {
    transferLogger.error("Error transferring element:", error);
  }
}
