import { $spicyLyricsVersion } from "../../utils/stores.ts";
import Global from "./Global.ts";

interface Location {
  pathname: string;
  search?: string;
  hash?: string;
  state?: Record<string, any>;
}

type VersionParsedData =
  | {
      Text: string;
      Major: number;
      Minor: number;
      Patch: number;
    }
  | undefined;

let sessionHistory: Location[] = [];

// Plain-text version lookup on the edge, separate from /query, so the frequent
// update checks don't count against the batched API or its circuit breaker.
const LATEST_VERSION_URL = "https://api.spicylyrics.org/edge/service?lookup=version";
const LATEST_VERSION_TIMEOUT_MS = 15_000;

const Session = {
  Navigate: (data: Location) => {
    Spicetify.Platform.History.push(data);
    //Session.PushToHistory(data);
  },
  GoBack: () => {
    if (sessionHistory.length > 1) {
      Spicetify.Platform.History.goBack();
    } else {
      Session.Navigate({ pathname: "/" });
    }
  },
  /**
   * GoBack, but only while still on `pathname`. For flows that await something
   * (an exit animation) before navigating: if the user already went elsewhere
   * in the meantime, going back would undo *their* navigation instead.
   */
  GoBackFrom: (pathname: string) => {
    if (Spicetify.Platform.History.location?.pathname !== pathname) return;
    Session.GoBack();
  },
  GetPreviousLocation: () => {
    if (sessionHistory.length > 1) {
      return sessionHistory[sessionHistory.length - 2];
    }
    return null;
  },
  RecordNavigation: (data: Location) => {
    Session.PushToHistory(data);
    Global.Event.evoke("session:navigation", data);
  },
  FilterOutTheSameLocation: (data: Location) => {
    const filtered = sessionHistory.filter(
      (location) =>
        location.pathname !== data.pathname &&
        location.search !== data?.search &&
        location.hash !== data?.hash
    );
    sessionHistory = filtered;
  },
  PushToHistory: (data: Location) => {
    sessionHistory.push(data);
  },
  SpicyLyrics: {
    ParseVersion: (version: string): VersionParsedData => {
      const versionMatches = version.match(/(\d+)\.(\d+)\.(\d+)/);

      if (versionMatches === null) {
        return undefined;
      }

      return {
        Text: versionMatches[0],

        Major: parseInt(versionMatches[1]),
        Minor: parseInt(versionMatches[2]),
        Patch: parseInt(versionMatches[3]),
      };
    },
    GetCurrentVersion: (): VersionParsedData => {
      return Session.SpicyLyrics.ParseVersion($spicyLyricsVersion.get());
    },
    GetLatestVersion: async (): Promise<VersionParsedData> => {
      const res = await fetch(LATEST_VERSION_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(LATEST_VERSION_TIMEOUT_MS),
      });
      if (!res.ok) return undefined;
      return Session.SpicyLyrics.ParseVersion(await res.text());
    },
    IsOutdated: async (): Promise<boolean> => {
      const latestVersion = await Session.SpicyLyrics.GetLatestVersion();
      const currentVersion = Session.SpicyLyrics.GetCurrentVersion();
      return Session.SpicyLyrics.IsBehind(currentVersion, latestVersion);
    },
    /** Pure comparison, for callers that already hold both versions. */
    IsBehind: (currentVersion: VersionParsedData, latestVersion: VersionParsedData): boolean => {
      if (latestVersion === undefined || currentVersion === undefined) return false;

      return (
        latestVersion.Major > currentVersion.Major ||
        latestVersion.Minor > currentVersion.Minor ||
        latestVersion.Patch > currentVersion.Patch
      );
    },
  },
};

export default Session;
