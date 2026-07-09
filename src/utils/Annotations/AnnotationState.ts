import { atom } from "nanostores";
import { persistAtom } from "../stores.ts";
import type { AnchoredLyricAnnotation, AnnotationFetchState, OpenAnnotation } from "./types.ts";

export const $annotationsEnabled = persistAtom<boolean>("annotationsEnabled", false);
export const $annotationMarkersEnabled = persistAtom<boolean>("annotationMarkersEnabled", true);
export const $annotationProvider = persistAtom<string>("annotationProvider", "genius");
export const $geniusAccessToken = persistAtom<string>("geniusAccessToken", "");
export const $geniusProxyUrl = persistAtom<string>("geniusProxyUrl", "");
export const $annotationDebug = persistAtom<boolean>("annotationDebug", false);

export const $annotationState = atom<AnnotationFetchState>({ status: "idle" });
export const $annotationOpen = atom<OpenAnnotation | null>(null);
export const $currentAnnotations = atom<AnchoredLyricAnnotation[]>([]);
