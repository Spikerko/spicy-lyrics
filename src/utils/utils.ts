export function DeepFreeze<T extends Record<string, any>>(obj: T): Readonly<T> {
    if (obj === null || typeof obj !== "object") return obj as any;
    const propNames = Object.getOwnPropertyNames(obj);

    for (const name of propNames) {
        const value = (obj as any)[name];
        if (value && typeof value === "object") {
            DeepFreeze(value);
        }
    }
    return Object.freeze(obj) as Readonly<T>;
}