export type AnnotationProviderId = "genius";

export interface TrackMetadata {
  uri: string;
  spotifyTrackId?: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
}

export interface AnnotationTrackMatch {
  provider: AnnotationProviderId;
  providerSongId: string;
  title: string;
  artist: string;
  url?: string;
  confidence: number;
}

export interface RawLyricAnnotation {
  id: string | number;
  provider: AnnotationProviderId;
  fragment: string;
  text: string;
  url?: string;
  votes?: number;
}

export interface LyricAnnotationAnchor {
  annotationId: string | number;
  lineIndexStart: number;
  lineIndexEnd: number;
  confidence: number;
}

export interface AnchoredLyricAnnotation extends RawLyricAnnotation {
  anchor: LyricAnnotationAnchor;
}

export interface AnnotationProvider {
  id: AnnotationProviderId;
  name: string;
  isConfigured(): boolean;
  searchTrack(track: TrackMetadata, signal?: AbortSignal): Promise<AnnotationTrackMatch | null>;
  getAnnotations(match: AnnotationTrackMatch, signal?: AbortSignal): Promise<RawLyricAnnotation[]>;
}

export type AnnotationFetchStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "unconfigured"
  | "disabled";

export interface AnnotationFetchState {
  status: AnnotationFetchStatus;
  uri?: string;
  count?: number;
  message?: string;
}

export interface OpenAnnotation {
  annotation: AnchoredLyricAnnotation;
  lineIndex: number;
  anchorRect: DOMRect;
}
