import Defaults from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";

type CachedHost = {
  baseUrl: string;
  expiresAt: number;
};

let cached: CachedHost | null = null;

const HOST_CACHE_DURATION = 60 * 60 * 1000;

export async function getActiveApiBaseUrl(
  primary: string,
  fallbacks: string[],
  forceRefresh = false
): Promise<string> {
  const now = Date.now();
  if (cached && !forceRefresh && cached.expiresAt > now) {
    return cached.baseUrl;
  }

  const candidates = [primary, ...fallbacks];
  for (const base of candidates) {
    try {
      const probe = await fetch(`${base}/health`, { method: "HEAD" });
      if (probe.ok) {
        cached = {
          baseUrl: base,
          expiresAt: now + HOST_CACHE_DURATION,
        };
        return base;
      }
    } catch {}
  }

  cached = {
    baseUrl: primary,
    expiresAt: now + HOST_CACHE_DURATION,
  };
  return primary;
}

export type Job = {
  handler: string;
  processId?: string;
  args?: any;
};

export type JobResponse = {
  handler: string;
  args?: any;
  result: JobResult;
};

export type JobResult = {
  responseData: any;
  status: number;
  type: string;
};

export interface JobResultGetter {
  get(handler: string): JobResult | undefined;
}

export async function SendJob(
  jobs: Job[],
  headers: Record<string, string> = {}
): Promise<JobResultGetter> {
  const primary = Defaults.lyrics.api.url;
  const fallbacks = [
    "https://coregateway.spicylyrics.org",
    "https://lcgateway.spikerko.org",
  ];

  // Try first host
  let API_BASE = await getActiveApiBaseUrl(primary, fallbacks);

  const spicyLyricsVersion = Session.SpicyLyrics.GetCurrentVersion();
  
  // Retry logic: if /query fails, find working host again
  let attempt = 0;
  const maxAttempts = 5;
  
  while (attempt < maxAttempts) {
    try {
      const res = await fetch(`${API_BASE}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "SpicyLyrics-Version": spicyLyricsVersion?.Text ?? "",
          ...headers,
        },
        body: JSON.stringify({
          jobs,
          client: {
            version: spicyLyricsVersion?.Text ?? "unknown",
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      const results: Map<string, JobResult> = new Map();

      for (const job of data.jobs) {
        results.set(job.processId, job.result);
      }

      return {
        get(handler: string): JobResult | undefined {
          return results.get(handler);
        },
      };
    } catch (error) {
      attempt++;
      if (attempt < maxAttempts) {
        // Re-probe health endpoints and cache working one
        console.warn(`[Spicy Lyrics] Attempt ${attempt} failed with ${API_BASE}, reprobing hosts...`);
        API_BASE = await getActiveApiBaseUrl(primary, fallbacks, true);
      } else {
        throw error; // Final attempt failed
      }
    }
  }

  // Unreachable due to throw above
  throw new Error("Max retry attempts exceeded");
}