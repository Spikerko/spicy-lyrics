import { ProjectName } from "../../project/config";
import { Maid } from "../modules/Maid";
import { $developerMode } from "./stores";

/** One remembered error: what the bug report's "Recent errors" lists. */
export type RecentError = { time: number; source: string; message: string; count: number };

// Errors otherwise only reach the console, which most users never open.
const RECENT_ERROR_LIMIT = 5;
const RECENT_ERROR_LENGTH = 160;
const recentErrors: RecentError[] = [];

// Stack frames from our own bundle, whichever way it was loaded (the public build,
// the Marketplace's copy, or the dev server).
const OWN_SCRIPT = /spicy-lyrics/i;

/**
 * Takes out what could identify someone before an error is kept for a bug report:
 * query strings (tokens ride in them), user IDs in URIs and URL paths, the account name
 * in file paths, email addresses, the values of anything named like a credential or an
 * identity, and long token-like runs.
 */
export function RedactForReport(text: string): string {
  return (
    text
      .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi, "$1?…")
      .replace(/(\/(?:users?|home)\/)[^/\s?#"']+/gi, "$1…")
      // C:\Users\name, in plain and in JSON-escaped text.
      .replace(/([a-z]:[\\/]+users[\\/]+)[^\\/\s"']+/gi, "$1…")
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "…")
      .replace(/spotify:user:[^\s"',]+/gi, "spotify:user:…")
      .replace(/\bbearer\s+[^\s"',]+/gi, "Bearer …")
      // access_token=…, "refreshToken": "…", api-key: …, password=…, "user_id": "…". A quoted
      // value goes whole, spaces included.
      .replace(
        /(["']?[\w-]*(?:token|secret|auth|key|password|user|email|account|display[-_]?name)[\w-]*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s"',&}]+)/gi,
        "$1…"
      )
      .replace(/[A-Za-z0-9_\-.]{40,}/g, "…")
  );
}

/** "fn file:line:col" for the first stack frame in our bundle, so a report says where it threw. */
function ownFrame(stack: string | undefined): string | undefined {
  for (const line of stack?.split("\n") ?? []) {
    const match = line.match(/at (?:(.+?) \()?([^\s()]+):(\d+):(\d+)\)?$/);
    if (!match || !OWN_SCRIPT.test(match[2])) continue;
    const file = match[2].split("/").pop()?.split("?")[0];
    return `${match[1] ? `${match[1]} ` : ""}${file}:${match[3]}:${match[4]}`;
  }
  return undefined;
}

function summarise(arg: unknown): string {
  if (arg instanceof Error) {
    const where = ownFrame(arg.stack);
    return `${arg.name}: ${arg.message}${where ? ` @ ${where}` : ""}`;
  }
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

function rememberError(source: string, args: unknown[]) {
  // CSS-styled console arguments carry their "%c" markers and style strings.
  const shown = args.filter((arg) => !(typeof arg === "string" && arg.startsWith("color:")));
  let message = RedactForReport(
    shown
      .map(summarise)
      .join(" ")
      // Console styling: "%c" markers and terminal colour codes (ESC [ … m).
      // eslint-disable-next-line no-control-regex
      .replace(/%c|\u001b?\[\d{1,3}(;\d{1,3})*m/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
  if (message.length > RECENT_ERROR_LENGTH) message = `${message.slice(0, RECENT_ERROR_LENGTH - 1)}…`;
  // The same error again (a retry loop) bumps a count instead of pushing the others out.
  const last = recentErrors[recentErrors.length - 1];
  if (last && last.source === source && last.message === message) {
    last.count++;
    last.time = Date.now();
    return;
  }
  recentErrors.push({ time: Date.now(), source, message, count: 1 });
  if (recentErrors.length > RECENT_ERROR_LIMIT) recentErrors.shift();
}

/** The last few errors logged, oldest first. */
export function GetRecentErrors(): readonly RecentError[] {
  return recentErrors;
}

// Uncaught errors and rejected promises never pass through Logger. These listeners only
// observe, and keep an error only when its stack runs through our bundle.
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const stack = event.error instanceof Error ? event.error.stack : undefined;
    if (!OWN_SCRIPT.test(`${event.filename ?? ""}\n${stack ?? ""}`)) return;
    rememberError("uncaught", [event.error ?? event.message]);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const stack = event.reason instanceof Error ? event.reason.stack : undefined;
    if (!OWN_SCRIPT.test(stack ?? "")) return;
    rememberError("unhandled promise", [event.reason]);
  });
}

class Logger {
  private maid: Maid;

  public isEnabled = false;
  public prefix: string;
  private source: string;

  constructor(prefix?: string) {
    this.maid = new Maid();
    this.source = prefix ?? ProjectName;
    this.prefix = `[${ProjectName}]${prefix ? ` (${prefix})` : ""}`;
    this.isEnabled = $developerMode.get();

    this.maid.Give(
      $developerMode.subscribe((v) => {
        this.isEnabled = v;
      })
    )
  }

  private getPrefixArgs(): [string, string] {
    return [`%c${this.prefix}`, "color: #c9c9c9;"];
  }

  info(...args: unknown[]) {
    if (this.maid.IsDestroyed() || !this.isEnabled) return;
    const [prefix, style] = this.getPrefixArgs();
    console.info(prefix, style, ...args);
  }

  warn(...args: unknown[]) {
    // Warnings always reach the console — they surface real runtime issues
    // that users (and bug reports) need to see regardless of developer mode.
    if (this.maid.IsDestroyed()) return;
    const [prefix, style] = this.getPrefixArgs();
    console.warn(prefix, style, ...args);
  }

  error(...args: unknown[]) {
    // Errors always reach the console, regardless of developer mode.
    if (this.maid.IsDestroyed()) return;
    rememberError(this.source, args);
    const [prefix, style] = this.getPrefixArgs();
    console.error(prefix, style, ...args);
  }

  debug(...args: unknown[]) {
    if (this.maid.IsDestroyed() || !this.isEnabled) return;
    const [prefix, style] = this.getPrefixArgs();
    console.debug(prefix, style, ...args);
  }

  destroy() {
    if (this.maid.IsDestroyed()) return;
    this.maid.Destroy();
  }
}

export default Logger;