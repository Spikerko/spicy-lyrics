import React from "react";
import { flushSync } from "react-dom";
import { isDev } from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import ReactDOM from "react-dom/client";
import { PopupModal } from "../../components/Modal.ts";
import { toast } from "sonner";

let ShownUpdateNotice = false;
let WarningInFlight = false;

function startUpdate() {
  Session.Navigate({ pathname: "/SpicyLyrics/Update" });
}

/**
 * Non-blocking warning toast. Fires when the user dismisses any part of the
 * update flow without acting on it. Carries an "Update now" action so the
 * user can still recover. Deduped so a user clicking through multiple
 * dismiss paths (e.g., toast X then modal close) doesn't get stacked
 * warnings.
 */
function showUpdateDismissWarning() {
  if (WarningInFlight) return;
  WarningInFlight = true;
  toast.warning(
    <div>
      <div style={{ fontSize: "var(--text-headline-size)", fontWeight: 600, lineHeight: 1.3 }}>
        Continuing without updating?
      </div>
      <div style={{ fontSize: "var(--text-caption-size)", opacity: 0.75, marginTop: "2px", lineHeight: 1.4 }}>
        Some lyrics sources and features are only available on the latest version.
      </div>
    </div>,
    {
      duration: 9000,
      action: {
        label: "Update now",
        onClick: startUpdate,
      },
      position: "bottom-right",
      onDismiss: () => { WarningInFlight = false; },
      onAutoClose: () => { WarningInFlight = false; },
    }
  );
}

function presentUpdateAvailable(currentVersion: any, latestVersion: any) {
  let viewClicked = false;

  toast(
    <div>
      <div style={{ fontSize: "var(--text-headline-size)", fontWeight: 600, lineHeight: 1.3 }}>
        Spicy Lyrics {latestVersion?.Text || "update"} is available
      </div>
      <div style={{ fontSize: "var(--text-caption-size)", opacity: 0.65, marginTop: "2px" }}>
        New lyrics features and fixes.
      </div>
    </div>,
    {
      duration: Infinity,
      closeButton: true,
      action: {
        label: "View",
        onClick: () => {
          viewClicked = true;
          showUpdateModal(currentVersion, latestVersion);
        },
      },
      position: "bottom-right",
      onDismiss: () => {
        // Sonner fires onDismiss both on user X-click and after action
        // follow-through. We only want to warn when the user truly walked
        // away — viewClicked guards the action path.
        if (!viewClicked) showUpdateDismissWarning();
      },
    }
  );
}

function showUpdateModal(currentVersion: any, latestVersion: any) {
  const div = document.createElement("div");
  const reactRoot = ReactDOM.createRoot(div);

  // Single dismiss path used by the modal's X, outside-click, and the
  // explicit "Later" button. Always warns; always closes.
  const dismissWithWarning = () => {
    showUpdateDismissWarning();
    PopupModal.hide();
  };

  flushSync(() => {
    reactRoot.render(
      <div className="update-card-wrapper">
        <h2 className="uc-title">Update available</h2>
        <p className="uc-subtitle">A new version of Spicy Lyrics is ready to install.</p>

        <div className="uc-version-row">
          <span className="uc-ver">{currentVersion?.Text || "Current"}</span>
          <span className="uc-arrow" aria-hidden="true">
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 5h12M9 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="uc-ver new">{latestVersion?.Text || "Latest"}</span>
        </div>

        <div className="uc-actions">
          <button
            type="button"
            className="btn-quiet"
            onClick={dismissWithWarning}
          >
            Later
          </button>
          <button
            type="button"
            className="btn-update"
            onClick={startUpdate}
          >
            Update now
          </button>
        </div>
      </div>
    );
  });

  PopupModal.display({
    title: "Spicy Lyrics",
    content: div,
    onClose: () => reactRoot.unmount(),
    closeHandler: dismissWithWarning,
  });
}

export async function CheckForUpdates(force: boolean = false) {
  if (isDev) return;
  const IsOutdated = await Session.SpicyLyrics.IsOutdated();
  if (IsOutdated) {
    if (!force && ShownUpdateNotice) return;
    const currentVersion = Session.SpicyLyrics.GetCurrentVersion();
    const latestVersion = await Session.SpicyLyrics.GetLatestVersion();

    presentUpdateAvailable(currentVersion, latestVersion);

    ShownUpdateNotice = true;
  }
}

// ---- dev stuff ------

function fakeLatestVersion(updateTo: string) {
  const parsed = Session.SpicyLyrics.ParseVersion(updateTo);
  if (parsed) return parsed;
  return {
    Text: updateTo,
    Major: 9,
    Minor: 9,
    Patch: 9,
  };
}

export function triggerSpicyLyricsFakeUpdate(options: { updateTo: string }) {
  const currentVersion = Session.SpicyLyrics.GetCurrentVersion();
  const latestVersion = fakeLatestVersion(options.updateTo);
  presentUpdateAvailable(currentVersion, latestVersion);
}
