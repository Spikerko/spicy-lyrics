import { Query } from "../API/Query.ts";
import type { OpResult } from "./types.ts";
import { applyPingConfig, OPERATIONS } from "./config.ts";

interface Getter {
  get(operationId: string): OpResult | undefined;
}

function unwrap(getter: Getter): OpResult {
  const result = getter.get("0");
  if (!result) throw new Error("session op: no result at operationId 0");
  return result;
}

/**
 * Fold the ping config into the session request itself.
 *
 * Fetching it separately meant the two could fail independently, and once the
 * edge starts refusing traffic stochastically the common case is "session
 * created, config blocked" — leaving the client on the compiled default for its
 * whole session. Batching makes that split impossible, and halves the number of
 * session requests.
 *
 * Read defensively: a server that only handles one operation per request simply
 * returns nothing at "1", which means "config unchanged", never an error.
 */
function absorbPingConfig(getter: Getter): void {
  const result = getter.get("1");
  if (!result || result.httpStatus !== 200) return;
  applyPingConfig(result.data);
}

export async function opCreateSession(spotifyToken: string): Promise<OpResult> {
  const getter = await Query(
    [
      { operation: OPERATIONS.createSession, variables: {} },
      { operation: OPERATIONS.pingConfig, variables: {} },
    ],
    { Authorization: spotifyToken }
  );
  absorbPingConfig(getter);
  return unwrap(getter);
}

export async function opRefreshSession(tk: string, spotifyToken: string): Promise<OpResult> {
  const getter = await Query(
    [
      { operation: OPERATIONS.refreshSession, variables: { tk } },
      { operation: OPERATIONS.pingConfig, variables: {} },
    ],
    { Authorization: spotifyToken }
  );
  absorbPingConfig(getter);
  return unwrap(getter);
}

export async function opPing(tk: string): Promise<OpResult> {
  const getter = await Query([{ operation: OPERATIONS.ping, variables: { tk } }]);
  return unwrap(getter);
}
