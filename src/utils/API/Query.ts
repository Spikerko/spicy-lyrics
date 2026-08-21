import Defaults from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import Logger from "../Logger.ts";

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

const queryLogger = new Logger("API Query");

const SENSITIVE_HEADER_PATTERN = /auth|token|cookie|secret|key/i;

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = SENSITIVE_HEADER_PATTERN.test(name) ? "[redacted]" : value;
  }
  return redacted;
}

export async function Query(
  queries: Query[],
  headers: Record<string, string> = {}
): Promise<QueryResultGetter> {
  const host = Defaults.lyrics.api.url;
  const clientVersion = Session.SpicyLyrics.GetCurrentVersion();

  queryLogger.info("Sending API query request", {
    queries,
    host,
    clientVersion: clientVersion?.Text,
    headers: redactHeaders(headers),
  });

  try {
    const res = await fetch(`${host}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "SpicyLyrics-Version": clientVersion?.Text ?? "",
        "X-mode": "2",
        ...headers,
      },
      body: JSON.stringify({
        queries,
        client: {
          version: clientVersion?.Text ?? "unknown",
        },
      }),
    });

    queryLogger.info("Received response", { status: res.status });

    if (!res.ok) {
      queryLogger.error(`Request failed with status ${res.status}`);
      throw new Error(`Request failed with status ${res.status}`);
    }

    const data = await res.json();
    queryLogger.debug("Response data", data);
    const results: Map<string, QueryObjectResult> = new Map();

    for (const job of data.queries) {
      results.set(job.operationId, job.result);
      queryLogger.debug("Query result set", { operationId: job.operationId, result: job.result });
    }

    return {
      get(operationId: string): QueryObjectResult | undefined {
        queryLogger.debug("Attempting to retrieve query result for operationId", operationId);
        const result = results.get(operationId);
        if (!result) {
          queryLogger.warn("Query result not found for operationId", operationId, Array.from(results.keys()));
        } else {
          queryLogger.debug("Query result retrieved for operationId", operationId, result);
        }
        return result;
      },
    };
  } catch (error) {
    queryLogger.error("Query error", error);
    throw error;
  }
}
