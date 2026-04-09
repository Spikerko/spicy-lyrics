let currentCenterAnimationId: number | null = null;

export default function ScrollIntoCenterView(
  container: HTMLElement,
  element: HTMLElement,
  duration: number = 600, // Reduced duration for better responsiveness
  offset: number = 0,
  instantScroll: boolean = false
) {
  const elementOffsetTop = element.offsetTop;
  const targetScrollTop =
    elementOffsetTop -
    (container.clientHeight / 2 - element.clientHeight / 2) -
    offset;

  const startScrollTop = container.scrollTop;
  const distance = targetScrollTop - startScrollTop;
  const startTime = performance.now();

  if (instantScroll) {
    container.classList.add("InstantScroll");
    container.scrollTop = targetScrollTop;
    requestAnimationFrame(() => {
        container.classList.remove("InstantScroll");
    });
    return;
  }

  // Cancel any existing animation on this container
  if (currentCenterAnimationId !== null) {
    cancelAnimationFrame(currentCenterAnimationId);
  }

  function smoothScroll(currentTime: number) {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1);

    // easeInOutCubic easing function for a premium feel
    const easing = progress < 0.5 
      ? 4 * progress * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    container.scrollTop = startScrollTop + distance * easing;

    if (progress < 1) {
      currentCenterAnimationId = requestAnimationFrame(smoothScroll);
    } else {
      currentCenterAnimationId = null;
    }
  }

  currentCenterAnimationId = requestAnimationFrame(smoothScroll);
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
