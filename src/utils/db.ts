import { openDB, type IDBPDatabase } from "idb";
import Logger from "./Logger";

const dbLogger = new Logger("Database");

export const ObjectStores = {
  LyricsStore: "lyricsStore",
}

const upgrade = (db: IDBPDatabase) => {
  dbLogger.debug("Upgrade invoked");
  if (!db.objectStoreNames.contains(ObjectStores.LyricsStore)) {
    db.createObjectStore(ObjectStores.LyricsStore);
    dbLogger.debug("Created '", ObjectStores.LyricsStore, "' store");
  }
};

async function openLyricsDb() {
  // Forks use this database too and raise its version. Asking for a lower version
  // throws VersionError and takes the Local DB down, so open at whatever is there.
  const db = await openDB("spicylyrics", undefined, { upgrade });
  if (db.objectStoreNames.contains(ObjectStores.LyricsStore)) return db;

  // Bumping stops a build pinned to the old version from opening it, so only when the store is missing.
  const nextVersion = db.version + 1;
  db.close();
  return openDB("spicylyrics", nextVersion, { upgrade });
}

export const dbPromise = openLyricsDb();

export async function ensurePersistence() {
  try {
    if (await navigator.storage.persisted()) return true;

    const granted = await navigator.storage.persist();
    if (!granted) {
      dbLogger.warn("Data persistence request was denied; This can lead to potential data loss")
    } else {
      dbLogger.debug("Data persistence request was accepted")
    }
    return granted;
  } catch (e) {
    dbLogger.warn("Persistence check failed")
    return false;
  }
}
