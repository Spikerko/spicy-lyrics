import { GetExpireStore } from "../../modules/Store.ts";
import type { AnnotationTrackMatch, RawLyricAnnotation } from "./types.ts";

export const PROVIDER_VERSION = "genius-v1";

interface AnnotationCacheValue {
  match: AnnotationTrackMatch;
  raw: RawLyricAnnotation[];
}

const annotationCacheStore = GetExpireStore<AnnotationCacheValue>("SpicyAnnotations_Store_v1", 1, {
  Duration: 7,
  Unit: "Days",
});

export function annotationCacheKey(trackId: string, providerId: string): string {
  return `${trackId}:${providerId}:${PROVIDER_VERSION}`;
}

export async function getCachedAnnotations(key: string): Promise<AnnotationCacheValue | undefined> {
  return annotationCacheStore.GetItem(key);
}

export async function setCachedAnnotations(
  key: string,
  value: AnnotationCacheValue
): Promise<AnnotationCacheValue> {
  return annotationCacheStore.SetItem(key, value);
}

export async function clearAll(): Promise<void> {
  await annotationCacheStore.Destroy();
}
