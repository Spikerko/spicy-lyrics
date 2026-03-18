export default function ScrollIntoTopView(
  container: HTMLElement,
  element: HTMLElement,
  duration: number = 150, // Duration in milliseconds
  offset: number = 0, // Offset in pixels
  instantScroll: boolean = false // Instant scroll without animation
) {
  // Calculate the target scroll position with offset using container-relative metrics
  const elementOffsetTop = element.offsetTop;
  const targetScrollTop = elementOffsetTop - offset;

  const startScrollTop = container.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  if (instantScroll) {
    container.classList.add("InstantScroll");
  }

  function smoothScroll(currentTime: number) {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1); // Progress between 0 and 1

    // Smooth cubic easing in-out
    const easing =
      progress < 0.5 ? 4 * progress * progress * progress : 1 - (-2 * progress + 2) ** 3 / 2;

    // Update container scroll position
    const newScrollTop = startScrollTop + distance * easing;
    container.scrollTop = newScrollTop;

    // Continue animation until complete
    if (progress < 1) {
      requestAnimationFrame(smoothScroll);
    } else if (instantScroll) {
      container.classList.remove("InstantScroll");
    }
  }

  requestAnimationFrame(smoothScroll);
}

/**
 * A simpler version of ScrollIntoTopView that uses CSS for smooth scrolling
 * This function relies on the CSS scroll-behavior: smooth property
 * @param container The container element to scroll
 * @param element The element to scroll to
 * @param offset Vertical offset in pixels (negative values move the element up)
 * @param instantScroll Whether to use instant scrolling (no animation)
 */
export function ScrollIntoTopViewCSS(
  container: HTMLElement,
  element: HTMLElement,
  offset: number = 0,
  instantScroll: boolean = false
) {
  // Calculate the target position (top aligned) using container-relative metrics
  const elementOffsetTop = element.offsetTop;
  const targetScrollTop = elementOffsetTop - offset;

  // Toggle instant scroll mode if needed
  if (instantScroll) {
    container.classList.add("InstantScroll");
  }

  // Let CSS handle the smooth scrolling
  container.scrollTop = targetScrollTop;

  // Remove the instant scroll class after a short delay
  if (instantScroll) {
    setTimeout(() => {
      container.classList.remove("InstantScroll");
    }, 50); // Small delay to allow the scroll to happen
  }
}
