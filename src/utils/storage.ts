import { Component, Spicetify } from "@spicetify/bundler";

const prefix = "SpicyLyrics-";

let currentlyFetching = false;

let currentLyricsData = "";

function set(key: string, value: any) {
  if (key === "currentlyFetching") {
    currentlyFetching = value;
    return;
  }
  if (key === "currentLyricsData") {
    currentLyricsData = value;
    return;
  }
  Spicetify.LocalStorage.set(`${prefix}${key}`, value);
}

function get(key: string) {
  if (key === "currentlyFetching") {
    return currentlyFetching;
  }
  if (key === "currentLyricsData") {
    return currentLyricsData;
  }
  const data = Spicetify.LocalStorage.get(`${prefix}${key}`);
  return data;
}

Component.AddRootComponent("appStorage", { getItem: get, setItem: set })

export default {
  set,
  get,
};