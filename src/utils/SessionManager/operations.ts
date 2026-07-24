import { Query } from "../API/Query.ts";
import type { OpResult } from "./types.ts";
import { OPERATIONS } from "./config.ts";

interface Getter {
  get(operationId: string): OpResult | undefined;
}

function unwrap(getter: Getter): OpResult {
  const result = getter.get("0");
  if (!result) throw new Error("session op: no result at operationId 0");
  return result;
}

export async function opCreateSession(spotifyToken: string): Promise<OpResult> {
  const getter = await Query(
    [{ operation: OPERATIONS.createSession, variables: {} }],
    { Authorization: spotifyToken }
  );
  return unwrap(getter);
}

export async function opRefreshSession(tk: string, spotifyToken: string): Promise<OpResult> {
  const getter = await Query(
    [{ operation: OPERATIONS.refreshSession, variables: { tk } }],
    { Authorization: spotifyToken }
  );
  return unwrap(getter);
}

export async function opPing(tk: string): Promise<OpResult> {
  const getter = await Query([{ operation: OPERATIONS.ping, variables: { tk } }]);
  return unwrap(getter);
}

export async function opPingConfig(): Promise<OpResult> {
  const getter = await Query([{ operation: OPERATIONS.pingConfig, variables: {} }]);
  return unwrap(getter);
}
