import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { $isGlobalNav } from "../../utils/uiState";

export default function SLToaster() {
  const [nowPlayingBarHeight, setNowPlayingBarHeight] = useState(0);
  const isGlobalNav = useStore($isGlobalNav);

  useEffect(() => {
    const targetElement = document.querySelector<HTMLElement>(
      ".Root__now-playing-bar",
    );

    if (!targetElement) {
      console.warn("[SLToaster] Could not find '.Root__now-playing-bar' in the DOM.");
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
    />
  );
}
