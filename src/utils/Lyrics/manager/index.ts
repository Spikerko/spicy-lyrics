import { dbPromise, ObjectStores } from "../../db";
import Logger from "../../logger";
import { ParseTTML } from "./parseTTML";

const logger = new Logger("Local Lyrics Manager");

const objStore = ObjectStores.LyricsStore;

function logCaught(operation: string, error: unknown, context?: Record<string, unknown>) {
  const detail =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  logger.error(`${operation} failed:`, detail, context);
}

async function put(uri: string, ttml: unknown) {
  try {
    const db = await dbPromise;
    return await db.put(objStore, ttml, uri);
  } catch (error) {
    logCaught("put", error, { uri });
    throw error;
  }
}

async function get(uri: string): Promise<any | null> {
  try {
    const db = await dbPromise;
    const data = await db.get(objStore, uri);
    if (data == null) {
      return null;
    }

    const parsed = await ParseTTML(data);
    if (parsed == null || typeof parsed !== "object") {
      return null;
    }

    const result = "Result" in parsed ? (parsed as Record<string, unknown>).Result : undefined;
    return (result && typeof result === "object" && result !== null)
      ? Object.assign({}, result as object, { source: "ldb" })
      : null;
  } catch (error) {
    logCaught("get", error, { uri });
    return null;
  }
}

async function listKeys(): Promise<Array<string>> {
  try {
    const db = await dbPromise;
    const keys = await db.getAllKeys(objStore);
    return keys.filter((key): key is string => typeof key === "string");
  } catch (error) {
    logCaught("listKeys", error);
    return [];
  }
}

export const LocalLyricsManager = {
  put,
  get,
  listKeys,
};