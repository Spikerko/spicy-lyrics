import { $annotationProvider } from "../AnnotationState.ts";
import { GeniusAnnotationProvider } from "./GeniusAnnotationProvider.ts";
import type { AnnotationProvider } from "../types.ts";

const providers: Record<string, AnnotationProvider> = {
  genius: GeniusAnnotationProvider,
};

export function getActiveProvider(): AnnotationProvider | null {
  return providers[$annotationProvider.get()] ?? null;
}

export type { AnnotationProvider };
