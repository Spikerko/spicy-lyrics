import App from "../app.ts";
import Logger from "../Logger.ts";
import { SessionManager } from "./SessionManager.ts";

export const sessionManager = new SessionManager();

export async function initSession(): Promise<void> {
  if (App.isDev()) {
    new Logger("SessionManager").info("Dev build — skipping session creation");
    return;
  }
  await sessionManager.ensureSession();
}

export type { SessionState } from "./types.ts";
