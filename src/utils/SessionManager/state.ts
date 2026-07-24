import type { SessionState } from "./types.ts";

const state: SessionState = {
  tk: null,
  createdAt: 0,
  lastPingAt: 0,
};

export function getState(): SessionState {
  return state;
}

export function getTk(): string | null {
  return state.tk;
}

export function setTk(tk: string): void {
  state.tk = tk;
  state.createdAt = Date.now();
}

export function clearTk(): void {
  state.tk = null;
}

export function markPing(ts: number): void {
  state.lastPingAt = ts;
}
