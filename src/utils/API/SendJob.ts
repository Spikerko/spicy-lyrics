import Defaults from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";

const API_URL = Defaults.lyrics.api.url;

export type Job = {
  handler: string;
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

/**
 * Interface for the job result getter
 */
export interface JobResultGetter {
  get(handler: string): JobResult | undefined;
}

/**
 * Send a batch of jobs to the API
 * @param jobs - Array of jobs to send
 * @param headers - Optional headers to include in the request
 * @returns Object with a get method to retrieve job results
 */

export async function SendJob(
  jobs: Job[],
  headers: Record<string, string> = {}
): Promise<JobResultGetter> {
  const spicyLyricsVersion = Session.SpicyLyrics.GetCurrentVersion()?.Text;
  const res = await fetch(`${API_URL}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "SpicyLyrics-Version": spicyLyricsVersion ?? "",
      ...headers,
    },
    body: JSON.stringify({ jobs }),
  });

  if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

  const data = await res.json();
  const results: Map<string, JobResult> = new Map();

  for (const job of data.jobs) {
    results.set(job.handler, job.result);
  }

  return {
    get(handler: string): JobResult | undefined {
      return results.get(handler);
    },
  };
}
