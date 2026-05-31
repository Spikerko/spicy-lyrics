import { ProjectName } from "../../project/config";
import { Maid } from "../modules/Maid";
import { $developerMode } from "./stores";

class Logger {
  private maid: Maid;

  public isEnabled = false;
  public prefix: string;

  constructor(prefix?: string) {
    this.maid = new Maid();
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