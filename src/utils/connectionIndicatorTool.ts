import ConnectionIndicator from "../components/ConnectionIndicator/main.ts";
import { socket } from "./Socket/main.ts";

const LATENCY_INTERVAL_MS = 5000;
const JITTER_INTERVAL_MS = 1000;
const SOCKET_TIMEOUT_MS = 5000;

let lastLatency: number | null = null;
let jitterInterval: ReturnType<typeof setInterval> | null = null;
let latencyTimeout: ReturnType<typeof setTimeout> | null = null;

const applyJitter = (): void => {
  if (lastLatency === null) return;
  const jitter = lastLatency + Math.floor(Math.random() * 5 - 2); // ±2ms
  ConnectionIndicator.Update({ latencyMs: Math.max(1, jitter) });
};

const measureLatency = async (regionName: string): Promise<void> => {
  try {
    const startMs = performance.now()
    const _data = await socket
      .timeout(SOCKET_TIMEOUT_MS)
      .emitWithAck("latency");

    lastLatency = Math.floor(performance.now() - startMs);
    ConnectionIndicator.Update({ latencyMs: lastLatency, regionName });
  } catch (error) {
    console.error("[Spicy Lyrics] Failed to measure latency:", error);
  }

  latencyTimeout = setTimeout(() => measureLatency(regionName), LATENCY_INTERVAL_MS);
};

const connectionIndicatorInit = async (): Promise<void> => {
  if (ConnectionIndicator.GetIsAppended()) return;

  const container = await ConnectionIndicator.Create();
  if (!container) return;

  ConnectionIndicator.Append(container);

  let regionName = "unknown";
  try {
    const serverGeoData: { n?: string } = await socket
      .timeout(SOCKET_TIMEOUT_MS)
      .emitWithAck("geo");
    regionName = serverGeoData.n ?? "unknown";
  } catch (error) {
    console.error("[Spicy Lyrics] Failed to fetch geo data:", error);
  }

  jitterInterval = setInterval(applyJitter, JITTER_INTERVAL_MS);
  (async () => {
    await measureLatency(regionName);
    setTimeout(() => measureLatency(regionName), 1000)
  })()
};

const connectionIndicatorCleanup = (): void => {
  if (jitterInterval) {
    clearInterval(jitterInterval);
    jitterInterval = null;
  }
  if (latencyTimeout) {
    clearTimeout(latencyTimeout);
    latencyTimeout = null;
  }
  lastLatency = null;
};

export { connectionIndicatorInit, connectionIndicatorCleanup };