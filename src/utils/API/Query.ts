import Defaults from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import Logger from "../Logger.ts";
import {
  Acquire,
  IsTripStatus,
  ParseRetryAfter,
  SettleFailure,
  SettleSuccess,
} from "./CircuitBreaker.ts";

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

/**
 * The request reached the network and came back refused.
 *
 * Carries the transport status so callers can tell a rate limit apart from an
 * outage — without it every refusal collapses into a generic error, and the
 * first 429 (before the breaker has opened) shows the wrong message.
 */
export class QueryHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(status: number, retryAfterMs?: number) {
    super(`Request failed with status ${status}`);
    this.name = "QueryHttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * The request never produced a readable response.
 *
 * Usually this is *not* a dead network. A cross-origin error response with no
 * `Access-Control-Allow-Origin` — which is what Cloudflare's own 429 and block
 * pages are — is opaque to JavaScript: the browser rejects the fetch and hides
 * the status entirely, so a rate limit and an outage are indistinguishable here.
 *
 * Worth having its own type so it can be reported as a service problem, while
 * genuine faults further down the pipeline (unpacking, parsing) stay "unknown".
 */
export class QueryNetworkError extends Error {
  constructor(cause: unknown) {
    super("Request failed before a response could be read");
    this.name = "QueryNetworkError";
    this.cause = cause;
  }
}


export type QueryOptions = {
  /**
   * Marks a user-initiated lyrics fetch. Such a request is allowed through even
   * while the circuit breaker is open (subject to its own cooldown), so someone
   * actively listening recovers as soon as the API relents. Background traffic
   * must never set this.
   */
  probe?: boolean;
};

export async function Query(
  queries: Query[],
  headers: Record<string, string> = {},
  options: QueryOptions = {}
): Promise<QueryResultGetter> {
  const host = Defaults.lyrics.api.url;
  const clientVersion = Session.SpicyLyrics.GetCurrentVersion();

  // Throws ServiceUnavailableError rather than touching the network when the
  // breaker is open. Doing this before `fetch` also spares the CORS preflight,
  // so every suppressed call saves two requests, not one.
  const lease = Acquire(options.probe === true);

  queryLogger.info("Sending API query request", {
    queries,
    host,
    clientVersion: clientVersion?.Text,
    headers,
  });

  try {
    let res: Response;
    try {
      res = await fetch(`${host}/query`, {
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
    } catch (error) {
      // A network error, or a CORS failure — the edge blocked the preflight, or
      // answered with an error page carrying no CORS headers. There is no status
      // to inspect here, which is the shape a blocked request most often takes,
      // so it counts on the rejection alone.
      SettleFailure(lease);
      throw new QueryNetworkError(error);
    }

    queryLogger.info("Received response", { status: res.status });

    if (IsTripStatus(res.status)) {
      const retryAfterMs = ParseRetryAfter(res.headers.get("Retry-After"));
      SettleFailure(lease, retryAfterMs);
      queryLogger.error(`Request refused with status ${res.status}`);
      throw new QueryHttpError(res.status, retryAfterMs);
    }

    // Any other answer — a 404 included — proves the origin is reachable.
    SettleSuccess(lease);

    if (!res.ok) {
      queryLogger.error(`Request failed with status ${res.status}`);
      throw new QueryHttpError(res.status);
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
