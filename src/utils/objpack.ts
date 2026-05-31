interface SLObjPackLimits {
    depth: number;
    arrayLength: number;
    objectKeys: number;
    streamLength: number;
    valuesLength: number;
    decodeOps: number;
}

interface SLObjPackOptions {
    limits?: Partial<SLObjPackLimits>;
    forbiddenKeys?: Set<string>;
}

type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };
type PackedPayload = [JSONPrimitive[], number[]];

const DEFAULT_LIMITS: SLObjPackLimits = {
    depth: 512,
    arrayLength: 1 << 20,    // ~1M items
    objectKeys: 1 << 16,     // 64K keys
    streamLength: 1 << 24,   // ~16M stream entries
    valuesLength: 1 << 22,   // ~4M unique values
    decodeOps: 1 << 22,      // Combined budget for schema arrays
};

// Keys we refuse to round-trip. `safeSet` already prevents prototype
// pollution via `defineProperty`, but these names cause confusion in
// any code downstream that touches the result without paranoia
// (`for…in`, `Object.assign`, accessing `.constructor`, etc.).
const DEFAULT_FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
    '__proto__',
    'constructor',
    'prototype',
]);

export class SLObjPack {
    private readonly limits: SLObjPackLimits;
    private readonly forbiddenKeys: Set<string>;

    constructor(options: SLObjPackOptions = {}) {
        const overrides = options.limits ?? {};
        // Per-field defaulting so passing `{ depth: undefined }` still
        // resolves to the default rather than being treated as a 0/NaN cap.
        this.limits = {
            depth: overrides.depth ?? DEFAULT_LIMITS.depth,
            arrayLength: overrides.arrayLength ?? DEFAULT_LIMITS.arrayLength,
            objectKeys: overrides.objectKeys ?? DEFAULT_LIMITS.objectKeys,
            streamLength: overrides.streamLength ?? DEFAULT_LIMITS.streamLength,
            valuesLength: overrides.valuesLength ?? DEFAULT_LIMITS.valuesLength,
            decodeOps: overrides.decodeOps ?? DEFAULT_LIMITS.decodeOps,
        };
        // Copy the caller's set so later mutations don't bleed into the
        // instance's enforcement.
        this.forbiddenKeys = options.forbiddenKeys
            ? new Set(options.forbiddenKeys)
            : new Set(DEFAULT_FORBIDDEN_KEYS);
    }

    pack(jsonObj: unknown): PackedPayload {
        const limits = this.limits;
        const forbiddenKeys = this.forbiddenKeys;

        // -------- Pass 1: validating snapshot --------
        // Walks the input exactly once, producing a plain inert tree.
        // After this returns, all subsequent passes operate on that tree —
        // so getters, Proxies, mutation in flight, and `Array.isArray`
        // shenanigans can't desync the count and emit phases.
        // Also catches cycles, non-finite numbers, BigInt/Symbol/function,
        // class instances, oversized arrays/objects, and forbidden keys.
        const seen = new WeakSet<object>();

        function snapshot(node: unknown, depth: number): JSONValue {
            if (depth > limits.depth) {
                throw new Error("SLObjPack pack: Max depth exceeded");
            }

            if (node === null) return null;

            const t = typeof node;
            if (t === 'string' || t === 'boolean') return node as JSONValue;
            if (t === 'number') {
                if (!Number.isFinite(node as number)) {
                    throw new Error("SLObjPack pack: Non-finite number not supported");
                }
                return node as number;
            }
            if (t !== 'object') {
                // undefined, bigint, symbol, function — none round-trip safely
                throw new Error("SLObjPack pack: Unsupported value type: " + t);
            }

            const objNode = node as object;
            if (seen.has(objNode)) {
                throw new Error("SLObjPack pack: Circular reference detected");
            }
            seen.add(objNode);

            try {
                if (Array.isArray(node)) {
                    const len = node.length;
                    if (len > limits.arrayLength) {
                        throw new Error("SLObjPack pack: Array length exceeds limit");
                    }
                    const out = new Array<JSONValue>(len);
                    for (let i = 0; i < len; i++) {
                        out[i] = snapshot(node[i], depth + 1);
                    }
                    return out;
                }

                // Plain objects only. Date/Map/Set/RegExp/class instances
                // would be packed as `{}` (data loss); reject them up front.
                const proto = Object.getPrototypeOf(node);
                if (proto !== Object.prototype && proto !== null) {
                    throw new Error("SLObjPack pack: Non-plain object not supported");
                }

                const record = node as Record<string, unknown>;
                const keys = Object.keys(record);
                if (keys.length > limits.objectKeys) {
                    throw new Error("SLObjPack pack: Object key count exceeds limit");
                }

                const out: Record<string, JSONValue> = {};
                for (const k of keys) {
                    if (forbiddenKeys.has(k)) {
                        throw new Error("SLObjPack pack: Forbidden key: " + k);
                    }
                    // defineProperty in case `node` has a getter on `k` —
                    // we call it exactly once here, store the result inert.
                    Object.defineProperty(out, k, {
                        value: snapshot(record[k], depth + 1),
                        writable: true,
                        enumerable: true,
                        configurable: true,
                    });
                }
                return out;
            } finally {
                seen.delete(objNode);
            }
        }

        const safe = snapshot(jsonObj, 0);

        // -------- Pass 2: frequency count over the snapshot --------
        const primitivesFrequency = new Map<JSONPrimitive, number>();

        function countPrimitives(node: JSONValue, depth: number): void {
            if (depth > limits.depth) {
                throw new Error("SLObjPack pack: Max depth exceeded");
            }
            if (node === null || typeof node !== 'object') {
                const prim = node as JSONPrimitive;
                primitivesFrequency.set(prim, (primitivesFrequency.get(prim) ?? 0) + 1);
                return;
            }
            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) {
                    countPrimitives(node[i], depth + 1);
                }
            } else {
                const obj = node as Record<string, JSONValue>;
                const keys = Object.keys(obj);
                for (const k of keys) {
                    primitivesFrequency.set(k, (primitivesFrequency.get(k) ?? 0) + 1);
                    countPrimitives(obj[k], depth + 1);
                }
            }
        }
        countPrimitives(safe, 0);

        const valuesList: JSONPrimitive[] = Array.from(primitivesFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .map(e => e[0]);

        const valueToIndex = new Map<JSONPrimitive, number>();
        valuesList.forEach((val, idx) => valueToIndex.set(val, idx));

        const getPtr = (node: JSONPrimitive): number => {
            const ptr = valueToIndex.get(node);
            if (ptr === undefined) {
                // Invariant: every primitive in `safe` was counted in pass 2.
                // Reaching here means pass 1's snapshot diverged from pass 2/3.
                throw new Error("SLObjPack pack: Internal error — unindexed primitive");
            }
            return ptr;
        };

        // Order-sensitive on purpose — JS preserves insertion order and we
        // want round-trip key-order identity. Don't canonicalize here
        // without also changing emit/unpack to match.
        function isSchemaArray(arr: JSONValue[]): string[] | false {
            if (arr.length === 0) return false;
            const first = arr[0];
            if (typeof first !== 'object' || first === null || Array.isArray(first)) return false;

            const keys0 = Object.keys(first);
            if (keys0.length === 0) return false;

            for (let i = 1; i < arr.length; i++) {
                const item = arr[i];
                if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
                const keysI = Object.keys(item);
                if (keysI.length !== keys0.length) return false;
                for (let k = 0; k < keys0.length; k++) {
                    if (keysI[k] !== keys0[k]) return false;
                }
            }
            return keys0;
        }

        // -------- Pass 3: emit opcode stream --------
        const stream: number[] = [];

        function emit(node: JSONValue, depth: number): void {
            if (depth > limits.depth) {
                throw new Error("SLObjPack pack: Max depth exceeded");
            }
            if (node === null || typeof node !== 'object') {
                stream.push(getPtr(node as JSONPrimitive));
                return;
            }

            if (Array.isArray(node)) {
                if (node.length === 0) { stream.push(-4); return; }
                if (node.length === 1) {
                    stream.push(-5);
                    emit(node[0], depth + 1);
                    return;
                }

                const schemaKeys = isSchemaArray(node);
                if (schemaKeys) {
                    stream.push(-3);
                    stream.push(node.length);
                    stream.push(schemaKeys.length);
                    schemaKeys.forEach(k => stream.push(getPtr(k)));
                    node.forEach(item => {
                        const rec = item as Record<string, JSONValue>;
                        schemaKeys.forEach(k => emit(rec[k], depth + 1));
                    });
                    return;
                }

                stream.push(-2);
                stream.push(node.length);
                node.forEach(n => emit(n, depth + 1));
                return;
            }

            const objNode = node as Record<string, JSONValue>;
            const keys = Object.keys(objNode);
            if (keys.length === 0) { stream.push(-6); return; }

            stream.push(-1);
            stream.push(keys.length);
            keys.forEach(k => stream.push(getPtr(k)));
            keys.forEach(k => emit(objNode[k], depth + 1));
        }

        emit(safe, 0);
        return [valuesList, stream];
    }

    unpack(packed: unknown): JSONValue {
        const limits = this.limits;
        const forbiddenKeys = this.forbiddenKeys;

        // -------- Shell validation --------
        if (!Array.isArray(packed) || packed.length !== 2) {
            throw new Error("SLObjPack unpack: Invalid payload structure");
        }
        const valuesListRaw: unknown = packed[0];
        const streamRaw: unknown = packed[1];
        if (!Array.isArray(valuesListRaw) || !Array.isArray(streamRaw)) {
            throw new Error("SLObjPack unpack: Invalid payload structure");
        }

        // -------- Global size caps --------
        // Even when individual structure counts are within limits, the
        // overall payload can otherwise be arbitrarily large.
        if (valuesListRaw.length > limits.valuesLength) {
            throw new Error("SLObjPack unpack: valuesList exceeds limit");
        }
        if (streamRaw.length > limits.streamLength) {
            throw new Error("SLObjPack unpack: stream exceeds limit");
        }

        // -------- valuesList content validation --------
        // resolvePointer returns these values verbatim. Reject anything
        // that pack would never produce so the unpack contract is
        // explicit even when the input wasn't JSON-derived.
        for (let i = 0; i < valuesListRaw.length; i++) {
            const v = valuesListRaw[i];
            if (v === null) continue;
            const t = typeof v;
            if (t === 'string' || t === 'boolean') continue;
            if (t === 'number') {
                if (!Number.isFinite(v)) {
                    throw new Error("SLObjPack unpack: Non-finite number in valuesList at " + i);
                }
                continue;
            }
            throw new Error("SLObjPack unpack: Invalid valuesList entry at " + i + " (type " + t + ")");
        }
        const valuesList = valuesListRaw as JSONPrimitive[];
        const stream = streamRaw as unknown[];

        const streamLen = stream.length;
        const valuesLen = valuesList.length;
        let cursor = 0;

        function readStream(): unknown {
            if (cursor >= streamLen) {
                throw new Error("SLObjPack unpack: Unexpected end of stream");
            }
            return stream[cursor++];
        }

        function resolvePointer(ptr: unknown): JSONPrimitive {
            if (typeof ptr !== 'number' || !Number.isInteger(ptr) || ptr < 0 || ptr >= valuesLen) {
                throw new Error("SLObjPack unpack: Invalid value pointer " + ptr);
            }
            return valuesList[ptr];
        }

        function readKey(): string {
            const key = resolvePointer(readStream());
            if (typeof key !== 'string') {
                throw new Error("SLObjPack unpack: Keys must be strings, got " + typeof key);
            }
            // Symmetric with pack; defense in depth alongside `safeSet`.
            if (forbiddenKeys.has(key)) {
                throw new Error("SLObjPack unpack: Forbidden key: " + key);
            }
            return key;
        }

        // defineProperty installs `__proto__` (and any other inherited
        // setter name) as a regular own property without invoking the
        // prototype-chain setter.
        function safeSet(obj: Record<string, JSONValue>, key: string, value: JSONValue): void {
            Object.defineProperty(obj, key, {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
            });
        }

        function validateCount(n: unknown, max: number, label: string): asserts n is number {
            if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > max) {
                throw new Error("SLObjPack unpack: Invalid " + label + " count: " + n);
            }
        }

        // Tight lower bound on remaining stream — `min` is the smallest
        // possible number of additional slots this structure can consume
        // (assuming every nested value is a single primitive pointer).
        function requireStream(min: number, label: string): void {
            if (min > streamLen - cursor) {
                throw new Error("SLObjPack unpack: " + label + " exceeds remaining stream");
            }
        }

        // Depth is an explicit argument now, matching pack's convention:
        // root is depth 0, children depth + 1. Both functions cap at
        // exactly `MAX_DEPTH + 1` levels of nesting from the root.
        function decode(depth: number): JSONValue {
            if (depth > limits.depth) {
                throw new Error("SLObjPack unpack: Max depth exceeded");
            }
            const op = readStream();
            if (typeof op !== 'number' || !Number.isInteger(op)) {
                throw new Error("SLObjPack unpack: Invalid opcode " + op);
            }
            if (op >= 0) return resolvePointer(op);

            switch (op) {
                case -1: {
                    const numKeys = readStream();
                    validateCount(numKeys, limits.objectKeys, "object key");
                    // numKeys key pointers + numKeys values (≥1 slot each)
                    requireStream(numKeys * 2, "object");
                    const keys = new Array<string>(numKeys);
                    for (let i = 0; i < numKeys; i++) keys[i] = readKey();
                    const obj: Record<string, JSONValue> = {};
                    for (let i = 0; i < numKeys; i++) safeSet(obj, keys[i], decode(depth + 1));
                    return obj;
                }
                case -2: {
                    const numItems = readStream();
                    validateCount(numItems, limits.arrayLength, "array item");
                    requireStream(numItems, "array");
                    const arr = new Array<JSONValue>(numItems);
                    for (let i = 0; i < numItems; i++) arr[i] = decode(depth + 1);
                    return arr;
                }
                case -3: {
                    const numItems = readStream();
                    validateCount(numItems, limits.arrayLength, "schema array item");
                    const numKeys = readStream();
                    validateCount(numKeys, limits.objectKeys, "schema key");
                    // Combined budget — individual caps multiply for `-3`.
                    if (numItems * numKeys > limits.decodeOps) {
                        throw new Error("SLObjPack unpack: Schema array decode budget exceeded");
                    }
                    // numKeys schema key pointers + numItems*numKeys values
                    requireStream(numKeys + numItems * numKeys, "schema array");
                    const keys = new Array<string>(numKeys);
                    for (let i = 0; i < numKeys; i++) keys[i] = readKey();
                    const arr = new Array<JSONValue>(numItems);
                    for (let i = 0; i < numItems; i++) {
                        const obj: Record<string, JSONValue> = {};
                        for (let k = 0; k < numKeys; k++) {
                            safeSet(obj, keys[k], decode(depth + 1));
                        }
                        arr[i] = obj;
                    }
                    return arr;
                }
                case -4: return [];
                case -5: return [decode(depth + 1)];
                case -6: return {};
                default:
                    throw new Error("SLObjPack unpack: Unknown opcode " + op);
            }
        }

        const result = decode(0);

        // Trailing garbage rejection — prevents hidden payloads tacked on.
        if (cursor !== streamLen) {
            throw new Error("SLObjPack unpack: Extra data after decoding");
        }

        return result;
    }
}