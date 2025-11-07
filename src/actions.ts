// deno-lint-ignore-file no-explicit-any
import { Component } from "@spicetify/bundler";

const actionMap = new Map<string, any>();

export const actions = {
  push(actionId: string, actionContents: any, options: { allowActionOverwrite?: boolean } = {}) {
    if (actionMap.has(actionId) && !options.allowActionOverwrite) {
      throw new Error("Action already exists. Use `options.allowActionOverwrite = true` to allow action overwriting.");
    }
    actionMap.set(actionId, actionContents);
  },
  get(actionId: string) {
    if (!actionMap.has(actionId)) {
      throw new Error("Couldn't `get` action - Action doesn't exist in the actionMap.");
    }; 

    return actionMap.get(actionId);
  },
  remove(actionId: string) {
    if (!actionMap.has(actionId)) {
      throw new Error("Couldn't `remove` action - Action doesn't exist in the actionMap.");
    };

    return actionMap.delete(actionId);
  },
}

Component.AddRootComponent("enqueueAction", (actionId: string, include: any, forceReturn: boolean = false) => {
  const action = actions.get(actionId);

  // Fix: Ensure include is always an array when spreading as arguments
  if (typeof action === "function" && !forceReturn) {
    // If include is not an array, wrap it as an array or use an empty array
    let args: any[] = [];
    if (Array.isArray(include)) {
      args = include;
    } else if (typeof include !== "undefined") {
      args = [include];
    }
    return action(...args);
  }

  return action;
});