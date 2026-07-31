import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { $isGlobalNav } from "../../utils/uiState";
import Logger from "../../utils/Logger";

const toasterLogger = new Logger("Toaster");

export default function SLToaster() {
  const [nowPlayingBarHeight, setNowPlayingBarHeight] = useState(0);
  const isGlobalNav = useStore($isGlobalNav);

  useEffect(() => {
    const targetElement = document.querySelector<HTMLElement>(
      ".Root__now-playing-bar",
    );

    if (!targetElement) {
      toasterLogger.warn("Could not find '.Root__now-playing-bar' in the DOM");
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
      toastOptions={{
        style: {
          background: "#1e1e1e",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "10px",
          color: "rgba(255, 255, 255, 0.85)",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
          fontSize: "0.85rem",
          fontWeight: "500",
        },
      }}
    />
  );
}
