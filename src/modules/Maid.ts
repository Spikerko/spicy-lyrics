import type { Scheduled } from "./Scheduler";
import Scheduler from "./Scheduler";

export type MaidItem =
  | MutationObserver
  | ResizeObserver
  | Scheduled
  | Element
  | (() => void)
  | { Destroy?: () => void };

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function cleanItem(item: MaidItem): void {
  if (typeof item === "function") {
    item();
  } else if (
    item instanceof MutationObserver ||
    item instanceof ResizeObserver
  ) {
    item.disconnect();
  } else if (item instanceof Element) {
    item.remove();
  } else if (Scheduler.IsScheduled(item)) {
    Scheduler.Cancel(item);
  } else if (
    typeof item === "object" &&
    item !== null &&
    "Destroy" in item &&
    typeof (item as { Destroy?: () => void }).Destroy === "function"
  ) {
    (item as { Destroy: () => void }).Destroy();
  } else {
    console.warn("[Maid] Unknown item type — cannot clean:", item);
  }
}

export class Maid {
  private _items = new Map<string, MaidItem>();
  private _destroyed = false;

  Give<T extends MaidItem>(item: T, key?: string): T {
    const k = key ?? uuidv4();

    if (this._destroyed) {
      cleanItem(item);
      return item;
    }

    if (this._items.has(k)) {
      cleanItem(this._items.get(k)!);
    }

    this._items.set(k, item);
    return item;
  }

  GiveItems<T extends MaidItem>(...items: T[]): T[] {
    for (const item of items) this.Give(item);
    return items;
  }

  Get(key: string): MaidItem | undefined {
    return this._items.get(key);
  }

  Has(key: string): boolean {
    return this._items.has(key);
  }

  Clean(key: string): void {
    const item = this._items.get(key);
    if (item === undefined) return;
    this._items.delete(key);
    cleanItem(item);
  }

  CleanUp(): void {
    for (const item of this._items.values()) cleanItem(item);
    this._items.clear();
  }

  Destroy(): void {
    this.CleanUp();
    this._destroyed = true;
  }

  IsDestroyed(): boolean {
    return this._destroyed;
  }
}
