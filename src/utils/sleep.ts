/**
 * Pauses execution for a specified number of seconds.
 * @param seconds - The number of seconds to wait
 * @returns A promise that resolves after the specified delay
 */
async function sleep(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export default sleep;
