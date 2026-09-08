import { toast } from "sonner";
import { dbPromise } from "./db";
import { LocalLyricsManager } from "./Lyrics/manager";
import { openSettingsPanel } from "./settings";
import { OpenLyricsDBPanel } from "./openLyricsDBPanel";
import { DeepFreeze } from "./utils";
import { triggerSpicyLyricsFakeUpdate } from "./version/CheckForUpdates";
import { BreakerDebug } from "./API/CircuitBreaker";
import GetProgress from "./Gets/GetProgress";

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
            },
            getProgress: () => GetProgress(),
        },
        request: {
            QueryAPI: {
                breaker: BreakerDebug,
            }
        }
    };

    (window as any).SpicyLyrics = DeepFreeze(api);
}