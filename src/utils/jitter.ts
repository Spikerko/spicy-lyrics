/**
 * Spread a delay around its target so a fleet of clients never fires in unison.
 *
 * The result is uniform over `ms * [1 - ratio, 1 + ratio]`, so the *mean* delay
 * is unchanged — jitter decorrelates clients without altering the average rate
 * anything runs at. A ratio of 0.5 gives the classic 0.5x-1.5x spread.
 */
export function jitter(ms: number, ratio: number): number {
  return ms * (1 - ratio + Math.random() * ratio * 2);
}

/**
 * Full jitter: uniform over `[0, ms]`. Use when the goal is purely to smear a
 * simultaneous fleet-wide event across a window, rather than to schedule a
 * recurring interval (this *halves* the effective mean, so never use it for a
 * repeating timer).
 */
export function fullJitter(ms: number): number {
  return Math.random() * ms;
}
