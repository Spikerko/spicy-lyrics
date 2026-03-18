export default function ScrollIntoCenterView(
  container: HTMLElement,
  element: HTMLElement,
  duration: number = 800, // Increased duration for smoother scrolling
  offset: number = 0, // Offset in pixels, defaults to 0
  instantScroll: boolean = false // Instant scroll without animation
) {
  // Calculate the target scroll position relative to the container using
  // only container-relative metrics to avoid layout thrashing.
  const elementOffsetTop = element.offsetTop;
  const targetScrollTop =
    elementOffsetTop -
    (container.clientHeight / 2 - element.clientHeight / 2) -
    offset; // Apply the offset

  const startScrollTop = container.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  if (instantScroll) {
    container.classList.add("InstantScroll");
  }

  function smoothScroll(currentTime: number) {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1); // Progress between 0 and 1

    // Enhanced easing function for more natural movement
    // This provides a slight bounce effect at the end
    let easing: number;
    if (progress < 0.4) {
      // Slow start (ease-in)
      easing = 2.5 * progress ** 2;
    } else if (progress < 0.65) {
      // Speed up in the middle
      easing = 0.7 + (progress - 0.4) * 1.2;
    } else if (progress < 0.85) {
      // Slight overshoot
      easing = 1.0 + (progress - 0.65) * 0.15;
    } else {
      // Settle back (slight bounce)
      easing = 1.03 - (progress - 0.85) * 0.2;
    }

    const newScrollTop = startScrollTop + distance * easing;

    container.scrollTop = newScrollTop;

    if (progress < 1) {
      requestAnimationFrame(smoothScroll);
    } else if (instantScroll) {
      container.classList.remove("InstantScroll");
    }
  }

  requestAnimationFrame(smoothScroll);
}

/**
 * A simpler version of ScrollIntoCenterView that uses CSS for smooth scrolling
 * This function relies on the CSS scroll-behavior: smooth property
 * @param container The container element to scroll
 * @param element The element to scroll to
 * @param offset Vertical offset in pixels (negative values move the element up)
 * @param instantScroll Whether to use instant scrolling (no animation)
 */
export function ScrollIntoCenterViewCSS(
  container: HTMLElement,
  element: HTMLElement,
  offset: number = 0,
  instantScroll: boolean = false
) {
  // Calculate the target position (centered) using container-relative metrics
  const elementOffsetTop = element.offsetTop;
  const targetScrollTop =
    elementOffsetTop -
    (container.clientHeight / 2 - element.clientHeight / 2) -
    offset;

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
    }, 50);
  }
}
