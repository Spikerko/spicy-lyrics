import { SessionManager } from "./SessionManager.ts";

export const sessionManager = new SessionManager();

export async function initSession(): Promise<void> {
  await sessionManager.ensureSession();
}

export type { SessionState } from "./types.ts";
