import Logger from "../Logger.ts";

const logger = new Logger("Spotify Metadata");

/** Extension kinds served by the client's metadata service. */
export enum MetadataExtension {
  VocalActivity = 218,
}

const METADATA_SERVICE_ID = "spotify.mdata_esperanto.proto.MetadataService";

interface MetadataServiceClass {
  new (transport: unknown): {
    observe(request: unknown, onResponse: (response: any) => void): { cancel(): void };
  };
  METHODS: { observe: { requestType: { fromPartial(query: unknown): unknown } } };
}

let service: InstanceType<MetadataServiceClass> | null = null;
let serviceClass: MetadataServiceClass | null = null;
let lookupFailed = false;

/**
 * The client's own metadata service, found among its bundled modules. It isn't a public API,
 * so a client update can move it: then this returns null and callers fall back.
 */
function getService() {
  if (service || lookupFailed) return service;
  try {
    const chunks =
      (window as any).rspackChunk ??
      (window as any).rspackChunkclient_web ??
      (window as any).webpackChunkclient_web ??
      (window as any).webpackChunkopen;
    const require = chunks.push([[Symbol()], {}, (r: any) => r]);
    let createTransport: (() => unknown) | null = null;
    for (const id of Object.keys(require.m)) {
      let exports: unknown;
      try {
        exports = require(id);
      } catch {
        continue;
      }
      if (!exports || typeof exports !== "object") continue;
      for (const value of Object.values(exports)) {
        if (typeof value !== "function") continue;
        if (!serviceClass && (value as any).SERVICE_ID === METADATA_SERVICE_ID) {
          serviceClass = value as unknown as MetadataServiceClass;
        } else if (!createTransport) {
          const source = Function.prototype.toString.call(value);
          if (source.includes("executeEsperantoCall") && source.includes("cancelEsperantoCall")) {
            createTransport = value as () => unknown;
          }
        }
      }
      if (serviceClass && createTransport) break;
    }
    if (!serviceClass || !createTransport) throw new Error("Metadata service not found");
    service = new serviceClass(createTransport());
  } catch (err) {
    lookupFailed = true;
    logger.warn("Unavailable", err);
  }
  return service;
}

/** One extension's raw protobuf bytes for an entity, or null when it has none. */
export function FetchMetadataExtension(
  entityUri: string,
  kind: MetadataExtension,
  timeoutMs = 5000
): Promise<Uint8Array | null> {
  const svc = getService();
  if (!svc || !serviceClass) return Promise.resolve(null);
  const request = serviceClass.METHODS.observe.requestType.fromPartial({
    extensionQuery: [{ entityUri, extensionKind: kind }],
  });
  return new Promise((resolve) => {
    let subscription: { cancel(): void } | null = null;
    const timer = setTimeout(() => {
      subscription?.cancel();
      resolve(null);
    }, timeoutMs);
    subscription = svc.observe(request, (response) => {
      if (response?.pendingResponse) return;
      clearTimeout(timer);
      subscription?.cancel();
      const result = response?.extensionResult?.[0];
      const value = result?.status === 1 ? result.extensionData?.value : null;
      resolve(value instanceof Uint8Array && value.length ? value : null);
    });
  });
}

export interface VocalActivity {
  /** Windows per second. */
  rate: number;
  /** Seconds before the first window. */
  offset: number;
  /** How likely someone is singing in each window, 0 to 100. */
  probabilities: number[];
}

/** Decodes the vocal activity message: 1 sample rate, 3 first window, 4 window hop, 5 packed probabilities. */
export function DecodeVocalActivity(bytes: Uint8Array): VocalActivity | null {
  let i = 0;
  const varint = () => {
    let value = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = bytes[i++];
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    } while (byte & 0x80 && i < bytes.length);
    return value;
  };
  let sampleRate = 0;
  let firstWindow = 0;
  let hop = 0;
  const probabilities: number[] = [];
  while (i < bytes.length) {
    const key = varint();
    const field = key >> 3;
    const wire = key & 7;
    if (wire === 5) {
      if (i + 4 > bytes.length) return null;
      if (field === 1)
        sampleRate = new DataView(bytes.buffer, bytes.byteOffset + i, 4).getFloat32(0, true);
      i += 4;
    } else if (wire === 0) {
      const value = varint();
      if (field === 3) firstWindow = value;
      else if (field === 4) hop = value;
    } else if (wire === 2) {
      // The length first: varint() moves `i` past it, so `i + varint()` would end short.
      const length = varint();
      const end = i + length;
      if (end > bytes.length) return null;
      if (field === 5) while (i < end) probabilities.push(varint());
      i = end;
    } else {
      return null;
    }
  }
  if (!sampleRate || !hop || !probabilities.length) return null;
  return { rate: sampleRate / hop, offset: firstWindow / sampleRate, probabilities };
}
