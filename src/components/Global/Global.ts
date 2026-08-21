import Event from "../../utils/EventManager.ts";

window._spicy_lyrics = {};
const SCOPE_ROOT = window._spicy_lyrics;

const Global = {
  Scope: SCOPE_ROOT,
  Event,
  NonLocalTimeOffset: 0,
  Saves: {} as any,
  SetScope: (key: string, value: any) => {
    const keys = key.split("."); // Split the key into individual parts
    let current = SCOPE_ROOT; // Start at the root object

    for (let i = 0; i < keys.length; i++) {
      const part = keys[i];

      if (i === keys.length - 1) {
        // If we're at the last key, assign the value
        current[part] = value;
      } else {
        // If the current part doesn't exist, initialize it as an object
        if (!current[part]) {
          current[part] = {};
        }

        // Ensure the current part is still an object
        if (typeof current[part] !== "object" || Array.isArray(current[part])) {
          throw new TypeError(
            `Cannot set nested property: ${keys.slice(0, i + 1).join(".")} is not an object.`
          );
        }

        // Traverse deeper into the object
        current = current[part];
      }
    }
  },
  GetScope: (key: string, fallback: any = undefined) => {
    const keys = key.split("."); // Split the key string into an array of property names
    let current = SCOPE_ROOT; // Start at the root object

    for (const part of keys) {
      if (current === undefined || current === null) {
        return fallback; // Return fallback if the key doesn't exist
      }
      current = current[part]; // Traverse deeper into the object
    }

    return current === undefined ? fallback : current; // Return the value or fallback
  },
};

export default Global;
