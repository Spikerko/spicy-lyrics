import { GetExpireStore } from "../../../modules/Store";

const CacheStore = GetExpireStore("SpicyLyrics_ArtistVisuals", 3, {
  Unit: "Days",
  Duration: 3,
});
export default CacheStore;
