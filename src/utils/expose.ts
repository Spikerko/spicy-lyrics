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