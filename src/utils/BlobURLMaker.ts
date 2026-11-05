import Logger from "./Logger.ts";

const blobLogger = new Logger("Blob URL");

// Least recently used first. Image URLs are content-addressed, so an entry never goes stale;
// the cap is what keeps a long session from holding every image it ever showed.
const BlobURLCache = new Map<string, string>();
const MAX_ENTRIES = 32;

export default async function BlobURLMaker(url: string): Promise<string | null> {
  if (!url) throw new Error("SpicyLyrics: BlobURLMaker: url Missing");
  const existingBlobURL = BlobURLCache.get(url);
  if (existingBlobURL) {
    BlobURLCache.delete(url);
    BlobURLCache.set(url, existingBlobURL);
    return existingBlobURL;
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    // A concurrent call for the same URL got there first; keep one blob.
    const raced = BlobURLCache.get(url);
    if (raced) return raced;

    const blobUrl = URL.createObjectURL(blob);
    BlobURLCache.set(url, blobUrl);
    if (BlobURLCache.size > MAX_ENTRIES) {
      const [oldestUrl, oldestBlobUrl] = BlobURLCache.entries().next().value!;
      BlobURLCache.delete(oldestUrl);
      URL.revokeObjectURL(oldestBlobUrl);
    }
    return blobUrl;
  } catch (error) {
    // Callers fall back to the original URL, so this is a warning, not a bug-report error.
    blobLogger.warn("Error fetching and converting to blob URL:", error);
    throw error;
  }
}
