import { useStore } from "@nanostores/react";
import { type CSSProperties, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { $isGlobalNav } from "../../utils/uiState";
import Logger from "../../utils/Logger";

const toasterLogger = new Logger("Toaster");

export default function SLToaster() {
  const [nowPlayingBarHeight, setNowPlayingBarHeight] = useState(0);
  const isGlobalNav = useStore($isGlobalNav);

  useEffect(() => {
    // Spotify 1.3.x drops the mapped class; the wrapper is still the bar's parent.
    const targetElement =
      document.querySelector<HTMLElement>(".Root__now-playing-bar") ??
      document.querySelector<HTMLElement>('[data-testid="now-playing-bar"]')?.parentElement ??
      null;

    if (!targetElement) {
      toasterLogger.warn("Could not find the now playing bar in the DOM");
      return;
    }

    setNowPlayingBarHeight(targetElement.offsetHeight);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setNowPlayingBarHeight((entry.target as HTMLElement).offsetHeight);
      }
    });
    resizeObserver.observe(targetElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [setNowPlayingBarHeight]);

  return (
    <Toaster
      position="bottom-center"
      offset={{ bottom: `var(--sltoaster-bottom-padding, ${String(nowPlayingBarHeight + 16 + (isGlobalNav ? 0 : 8))}px)` }}
      theme="dark"
      style={{ "--width": "380px" } as CSSProperties}
    />
  );
}
