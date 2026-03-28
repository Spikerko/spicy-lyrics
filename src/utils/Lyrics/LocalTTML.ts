const LOCAL_DATABASE_NAME = "SpicyLyricsLocalDB";
const LOCAL_DATABASE_VERSION = 1;
const LOCAL_LYRICS_STORE_NAME = "lyrics";

// One source for now, but can be expanded in the future if needed
const LYRICS_SOURCE = {
  /** User locally uploaded lyrics via dev tools */
  USER_UPLOAD: "user_upload",
} as const;
type LyricsSource = typeof LYRICS_SOURCE[keyof typeof LYRICS_SOURCE];

type LocalLyricsRecord = {
  trackId: string;
  lyrics: object;
  source: LyricsSource;
  addedAt: string;
};

let localDatabasePromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

function getLocalDatabase() {
  if (!localDatabasePromise) {
    localDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(LOCAL_DATABASE_NAME, LOCAL_DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LOCAL_LYRICS_STORE_NAME)) {
          database.createObjectStore(LOCAL_LYRICS_STORE_NAME, {
            keyPath: "trackId",
          });
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          localDatabasePromise = null;
        };
        resolve(database);
      };

      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open IndexedDB."));
    });
  }

  return localDatabasePromise;
}

async function getLocalLyricsRecord(trackId: string): Promise<LocalLyricsRecord | null> {
  if (!trackId) return null;

  const database = await getLocalDatabase();
  const transaction = database.transaction(LOCAL_LYRICS_STORE_NAME, "readonly");
  const store = transaction.objectStore(LOCAL_LYRICS_STORE_NAME);
  return (await requestToPromise(store.get(trackId))) ?? null;
}

/**
 * Get a local TTML for a specific track.
 * @param trackId The ID of the track.
 * @returns The local TTML object or null if not found.
 */
export async function getLocalTTML(trackId: string): Promise<object | null> {
  const record = await getLocalLyricsRecord(trackId);
  return record?.lyrics ?? null;
}

/**
 * Save a local TTML for a specific track.
 * @param trackId The ID of the track.
 * @param lyrics The TTML lyrics object to save.
 */
export async function saveLocalTTML(trackId: string, lyrics: object): Promise<void> {
  if (!trackId) return;

  const now = new Date().toISOString();
  const database = await getLocalDatabase();
  const transaction = database.transaction(LOCAL_LYRICS_STORE_NAME, "readwrite");
  const store = transaction.objectStore(LOCAL_LYRICS_STORE_NAME);

  const record: LocalLyricsRecord = {
    trackId,
    lyrics,
    source: LYRICS_SOURCE.USER_UPLOAD,
    addedAt: now,
  };

  store.put(record);
  await transactionToPromise(transaction);
}

/**
 * Remove a local TTML for a specific track.
 * @param trackId The ID of the track.
 */
export async function removeLocalTTML(trackId: string): Promise<void> {
  if (!trackId) return;

  const database = await getLocalDatabase();
  const transaction = database.transaction(LOCAL_LYRICS_STORE_NAME, "readwrite");
  const store = transaction.objectStore(LOCAL_LYRICS_STORE_NAME);

  store.delete(trackId);
  await transactionToPromise(transaction);
}

