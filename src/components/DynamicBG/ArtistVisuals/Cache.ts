import { GetExpireStore } from "../../../modules/Store";
import { getRemoteConfig } from "../../../utils/remoteConfig";

// A getter so a pushed TTL applies to every write from then on.
const CacheStore = GetExpireStore("SpicyLyrics_ArtistVisuals", 3, {
  Unit: "Days",
  get Duration() {
    return getRemoteConfig().cache.artistVisualsTtlDays;
  },
});
export default CacheStore;
