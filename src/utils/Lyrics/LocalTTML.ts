const LOCAL_TTML_DATABASE_NAME = "SpicyLyricsLocalTTML";
const LOCAL_TTML_STORE_NAME = "lyrics";
const LOCAL_TTML_DATABASE_VERSION = 1;

let localTTMLDatabasePromise: Promise<IDBDatabase> | null = null;

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

function getLocalTTMLDatabase() {
  if (!localTTMLDatabasePromise) {
    localTTMLDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(
        LOCAL_TTML_DATABASE_NAME,
        LOCAL_TTML_DATABASE_VERSION
      );

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(LOCAL_TTML_STORE_NAME)) {
          database.createObjectStore(LOCAL_TTML_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          localTTMLDatabasePromise = null;
        };
        resolve(database);
      };

      request.onerror = () =>
        reject(request.error ?? new Error("Unable to open IndexedDB."));
    });
  }

  return localTTMLDatabasePromise;
}

/** 
 * Get a local TTML for a specific track
 * @param trackId The ID of the track
 * @returns The local TTML object or null if not found
 */
export async function getLocalTTML(trackId: string): Promise<any | null> {
  if (!trackId) return null;

  const database = await getLocalTTMLDatabase();
  const transaction = database.transaction(LOCAL_TTML_STORE_NAME, "readonly");
  const store = transaction.objectStore(LOCAL_TTML_STORE_NAME);
  return (await requestToPromise(store.get(trackId))) ?? null;
}

/** 
 * Save a local TTML for a specific track
 * @param trackId The ID of the track
 * @param lyrics The TTML lyrics object to save
 */
export async function saveLocalTTML(trackId: string, lyrics: object): Promise<void> {
  if (!trackId) return;

  const database = await getLocalTTMLDatabase();
  const transaction = database.transaction(LOCAL_TTML_STORE_NAME, "readwrite");
  const store = transaction.objectStore(LOCAL_TTML_STORE_NAME);

  store.put(lyrics, trackId);
  await transactionToPromise(transaction);
}

/** 
 * Remove a local TTML for a specific track
 * @param trackId The ID of the track
 */
export async function removeLocalTTML(trackId: string): Promise<void> {
  if (!trackId) return;

  const database = await getLocalTTMLDatabase();
  const transaction = database.transaction(LOCAL_TTML_STORE_NAME, "readwrite");
  const store = transaction.objectStore(LOCAL_TTML_STORE_NAME);

  store.delete(trackId);
  await transactionToPromise(transaction);
}

