import { SendJob } from "../../utils/API/SendJob";
import Defaults from "./Defaults";
import Global from "./Global";

interface Location {
    pathname: string;
    search?: string;
    hash?: string;
    state?: Record<string, any>;
};

type VersionParsedData = {
    Text: string;
    Major: number;
    Minor: number;
    Patch: number;
} | undefined;

let sessionHistory: Location[] = [];

const Session = {
    Navigate: (data: Location) => {
        Spicetify.Platform.History.push(data);
        //Session.PushToHistory(data);
    },
    GoBack: () => {
        if (sessionHistory.length > 1) {
            Session.Navigate(sessionHistory[sessionHistory.length - 2]);
        } else {
            Session.Navigate({ pathname: "/" })
        }
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
        const filtered = sessionHistory.filter(location => location.pathname !== data.pathname && location.search !== data?.search && location.hash !== data?.hash);
        sessionHistory = filtered;
    },
    PushToHistory: (data: Location) => {
        sessionHistory.push(data);
    },
    SpicyLyrics: {
        ParseVersion: (version: string): VersionParsedData => {
            const versionMatches = version.match(/(\d+)\.(\d+)\.(\d+)/)

            if (versionMatches === null) {
                return undefined
            }

            return {
                Text: versionMatches[0],

                Major: parseInt(versionMatches[1]),
                Minor: parseInt(versionMatches[2]),
                Patch: parseInt(versionMatches[3])
            }
        },
        GetCurrentVersion: (): VersionParsedData => {
            return Session.SpicyLyrics.ParseVersion(Defaults.SpicyLyricsVersion);
        },
        GetLatestVersion: async (): Promise<VersionParsedData> => {
            //const res = await fetch(`https://api.spicylyrics.org/version?origin_version=${Session.SpicyLyrics.GetCurrentVersion().Text}`);
            const res = await SendJob([{
                handler: "VERSION"
            }])
            const versionJob = res.get("VERSION");
            if (!versionJob || versionJob.status !== 200 || versionJob.type !== "text") return undefined;
            const data = versionJob.responseData;
            return Session.SpicyLyrics.ParseVersion(data);
        },
        IsOutdated: async (): Promise<boolean> => {
            const latestVersion = await Session.SpicyLyrics.GetLatestVersion();
            const currentVersion = Session.SpicyLyrics.GetCurrentVersion();

            if (latestVersion === undefined || currentVersion === undefined) return false;

            return latestVersion.Major > currentVersion.Major ||
                latestVersion.Minor > currentVersion.Minor ||
                latestVersion.Patch > currentVersion.Patch;
        }
    }
}

window._spicy_lyrics_session = Session;

export default Session;