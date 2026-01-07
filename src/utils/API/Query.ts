import Defaults from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import storage from "../storage.ts";

export type Query = {
  operation: string;
  variables?: any;
};

export type QueryObjectResult = {
  data: any;
  httpStatus: number;
  format: "text" | "json";
};

export type QueryObject = {
  operation: string;
  operationId: string;
  result: QueryObjectResult;
};

export interface QueryResultGetter {
  get(operationId: string): QueryObjectResult | undefined;
}

const log = {
  info: (...args: unknown[]) => {
    if (storage.get("developerMode") === "true") {
      console.log("[Spicy Lyrics] [Query]", ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (storage.get("developerMode") === "true") {
      console.warn("[Spicy Lyrics] [Query]", ...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error("[Spicy Lyrics] [Query]", ...args);
  },
};


export async function Query(
  queries: Query[],
  headers: Record<string, string> = {}
): Promise<QueryResultGetter> {
  const host = Defaults.lyrics.api.url;
  const clientVersion = Session.SpicyLyrics.GetCurrentVersion();

  log.info("Sending Query request", { queries, host, clientVersion: clientVersion?.Text, headers });

  try {
    const res = await fetch(`${host}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "SpicyLyrics-Version": clientVersion?.Text ?? "",
        ...headers,
      },
      body: JSON.stringify({
        queries,
        client: {
          version: clientVersion?.Text ?? "unknown",
        },
      }),
    });

    log.info("Received response", { status: res.status });

    if (!res.ok) {
      log.error(`Request failed with status ${res.status}`);
      throw new Error(`Request failed with status ${res.status}`);
    }

    const data = await res.json();
    log.info("Response data", data);
    const results: Map<string, QueryObjectResult> = new Map();

    for (const job of data.queries) {
      results.set(job.operationId, job.result);
      log.info("Query result set", { operationId: job.operationId, result: job.result });
    }

    return {
      get(operationId: string): QueryObjectResult | undefined {
        log.info("Attempting to retrieve query result for operationId:", operationId);
        const result = results.get(operationId);
        if (!result) {
          log.warn("Query result not found for operationId", operationId, Array.from(results.keys()));
        } else {
          log.info("Query result retrieved for operationId", operationId, result);
        }
        return result;
      },
    };
  } catch (error) {
    log.error("Query error", error);
    throw error;
  }
}
