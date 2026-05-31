import { useEffect, useState } from "react";
import Global from "../../../Global/Global";
import { SpotifyPlayer } from "../../../Global/SpotifyPlayer";

export function useCurrentUri(): string | undefined {
  const [uri, setUri] = useState<string | undefined>(() => SpotifyPlayer.GetUri());

  useEffect(() => {
    const id = Global.Event.listen("playback:songchange", () => {
      setUri(SpotifyPlayer.GetUri());
    });
    setUri(SpotifyPlayer.GetUri());
    return () => {
      Global.Event.unListen(id);
    };
  }, []);

  return uri;
}
