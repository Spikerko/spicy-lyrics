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
        testing: {
            autoUpdate: {
                triggerFakeUpdate: triggerSpicyLyricsFakeUpdate,
            },
            toaster: toast,
            // Escape hatch: a bad persisted breaker state would otherwise mean
            // telling users to clear localStorage by hand.
            breaker: BreakerDebug,
            // The clock the lyrics renderer runs on. Exposed because playback
            // desync can only be diagnosed by sampling this against the player
            // state from the console; nothing else reaches it.
            getProgress: () => GetProgress(),
        }
    };

    (window as any).SpicyLyrics = DeepFreeze(api);
}