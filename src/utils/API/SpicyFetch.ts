/* import { SpikyCache } from "@spikerko/web-modules/SpikyCache";
import Defaults from "../../components/Global/Defaults";
import Platform from "../../components/Global/Platform";
import Session from "../../components/Global/Session";
import { GetExpireStore } from "@spikerko/tools/Cache";


export const SpicyFetchStore = GetExpireStore<any>(
    "SpicyLyrics_FetchStore",
    1,
    {
        Unit: "Days",
        Duration: 3
    }
)

export default async function SpicyFetch(path: string, IsExternal: boolean = false, cache: boolean = false, cosmos: boolean = false): Promise<Response | any> {
    return new Promise(async (resolve, reject) => {
        const lyricsApi = Defaults.lyrics.api.url;

        const CurrentVersion = Session.SpicyLyrics.GetCurrentVersion();

        const url = IsExternal ? path :
            `${lyricsApi}/${path}${path.includes('?') ? '&' : '?'}origin_version=${CurrentVersion?.Text || 'unknown'}`;

        const processedUrl = SpicyHasher.md5(url);
        const CachedContent = await SpicyFetchStore.GetItem(processedUrl);
        if (CachedContent && CachedContent.Result) {
            resolve([CachedContent.Result, 200]);
            return;
        }

        const SpotifyAccessToken = await Platform.GetSpotifyAccessToken();

        if (cosmos) {
            Spicetify.CosmosAsync.get(url)
                .then(async res => {
                    const data = typeof res === "object" ? JSON.stringify(res) : res;
                    const sentData = [data, res.status];
                    resolve(sentData)
                    if (cache) {
                        await SpicyFetchStore.SetItem(processedUrl, {
                            Result: sentData
                        });
                    }
                }).catch(err => {
                    console.error("CosmosAsync Error:", err)
                    reject(err)
                });
        } else {
            const SpicyLyricsAPI_Headers = IsExternal ? null : {};

            const SpotifyAPI_Headers = IsExternal ? {
                "Spotify-App-Version": Spicetify.Platform.version,
                "App-Platform": Spicetify.Platform.PlatformData.app_platform,
                "Accept": "application/json",
                "Content-Type": "application/json"
            } : null;

            const headers = {
                Authorization: `Bearer ${SpotifyAccessToken}`,
                ...SpotifyAPI_Headers,
                ...SpicyLyricsAPI_Headers
            };

            fetch(url, {
                method: "GET",
                headers: headers
            })
            .then(CheckForErrors)
            .then(async res => {
                if (res === null) {
                    resolve([null, 500]);
                    return;
                };

                const data = await res.text();
/*                 const isJson = ((data.startsWith(`{"`) || data.startsWith("{")) || (data.startsWith(`[`) || data.startsWith(`["`)));
                if (isJson) {
                    data = JSON.parse(data);
                } *
                const sentData = [data, res.status];
                resolve(sentData)
                if (cache) {
                    await SpicyFetchStore.SetItem(processedUrl, {
                        Result: sentData
                    });
                }
            }).catch(err => {
                console.error("Fetch Error:", err)
                reject(err)
            });
        }
    });
}


let ENDPOINT_DISABLEMENT_Shown = false;

/**
 * Check for API errors in the response
 * @param res - Fetch response object
 * @returns The response or null if handled
 *
async function CheckForErrors(res: Response): Promise<Response | null> {
    if (res.status === 500) {
        const TEXT = await res.text();
        if (TEXT.includes(`{"`)) {
            try {
                const data = JSON.parse(TEXT);
                if (data.type === "ENDPOINT_DISABLEMENT") {
                    if (ENDPOINT_DISABLEMENT_Shown) return res;
                    Spicetify.PopupModal.display({
                        title: "Endpoint Disabled",
                        content: `
                            <div>
                                <p>The endpoint you're trying to access is disabled.</p><br>
                                <p>This could mean a few things:</p><br>
                                <ul>
                                    <li>Maintenance on the API</li>
                                    <li>A Critical Issue</li>
                                    <li>A quick Disablement of the Endpoint</li>
                                </ul><br><br>
                                <p>If this problem persists, contact us on Github: <a href="https://github.com/spikenew7774/spicy-lyrics/" target="_blank" style="text-decoration:underline;">https://github.com/spikenew7774/spicy-lyrics</a>
                                ,<br> Or at <b>spikerko@spikerko.org</b></p>
                                <h3>Thanks!</h3>
                            </div>
                        `
                    });
                    ENDPOINT_DISABLEMENT_Shown = true;
                    return res;
                }
            } catch (e) {
                console.error("Error parsing error response:", e);
            }
            return res;
        }
        return res;
    } else if (res.status === 403) {
        const TEXT = await res.text();
        if (TEXT.includes(`{"`)) {
            try {
                const data = JSON.parse(TEXT);
                if (data?.message === "Update Spicy Lyrics") {
                    return null;
                }
            } catch (e) {
                console.error("Error parsing 403 response:", e);
            }
        }
    }
    return res;
} */
