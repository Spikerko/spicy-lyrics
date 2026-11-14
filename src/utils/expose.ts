import { toast } from "sonner";
import { dbPromise } from "./db";
import { LocalLyricsManager } from "./Lyrics/manager";
import { openSettingsPanel } from "./settings";
import { OpenLyricsDBPanel } from "./openLyricsDBPanel";
import { DeepFreeze } from "./utils";
import { triggerSpicyLyricsFakeUpdate } from "./version/CheckForUpdates";
import { BreakerDebug } from "./API/CircuitBreaker";
import { RemoteConfigDebug } from "./remoteConfig";
import { showUpdatedDialog } from "../components/ReactComponents/UpdateDialog.tsx";
import GetProgress from "./Gets/GetProgress";
import ApplyLyrics from "./Lyrics/Global/Applyer.ts";
import { SpotifyPlayer } from "../components/Global/SpotifyPlayer.ts";
import { getBackgroundMotionState } from "../components/DynamicBG/dynamicBackground.ts";
import { ForceNextUp } from "../components/Utils/NextUp.ts";

export function exposeToWindow() {
    const api = {
        panels: {
            settings: {
                open: () => openSettingsPanel(),
            },
            lyricsDB: {
                open: () => OpenLyricsDBPanel(),
            },
        },
        db: {
            dbPromise: dbPromise,
            objectStores: {
                lyricsStore: {
                    manager: LocalLyricsManager,
                }
            }
        },
        constants: {
            toaster: toast,
        },
        testing: {
            autoUpdate: {
                triggerFakeUpdate: triggerSpicyLyricsFakeUpdate,
                showUpdatedDialog: (fromVersion: string, toVersion: string) => showUpdatedDialog(fromVersion, toVersion),
            },
            getProgress: () => GetProgress(),
            backgroundMotion: () => getBackgroundMotionState(),
            // Show Up Next now with a stand-in track, e.g. nextUp({ title, artist, image }); nextUp() undoes it.
            nextUp: (track?: { title?: string; artist?: string; image?: string | null } | null) => ForceNextUp(track),
            // Paint a notice over the current track, e.g. showLyricsNotice("status-not-200", 500).
            showLyricsNotice: (descriptor: string, status: number = 0) =>
                ApplyLyrics([descriptor, status, SpotifyPlayer.GetUri()]),
        },
        request: {
            QueryAPI: {
                breaker: BreakerDebug,
            },
            remoteConfig: RemoteConfigDebug,
        }
    };

    (window as any).SpicyLyrics = DeepFreeze(api);
}