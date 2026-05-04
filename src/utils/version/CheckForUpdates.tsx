import React from "react";
import { flushSync } from "react-dom";
import { isDev } from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import ReactDOM from "react-dom/client";
import { PopupModal } from "../../components/Modal.ts";
import { toast } from "sonner";

let ShownUpdateNotice = false;
let _transitioningModals = false;

function presentUpdateAvailable(currentVersion: any, latestVersion: any) {
  toast(
    <div>
      <div style={{ fontSize: "1.15rem", fontWeight: 600, lineHeight: 1.2 }}>
        Spicy Lyrics {latestVersion?.Text || "update"} is available
      </div>
      <div style={{ fontSize: "0.82rem", opacity: 0.6, marginTop: "3px" }}>
        New lyrics features &amp; fixes.
      </div>
    </div>,
    {
      duration: Infinity,
      action: {
        label: "View ↗",
        onClick: () => showUpdateModal(currentVersion, latestVersion),
      },
      style: {
        background: "linear-gradient(135deg, #6c2ef2 0%, #3b0fa8 100%)",
        border: "1px solid #9b5cf6",
        color: "#f0e8ff",
        minWidth: "340px",
        maxWidth: "520px",
        width: "clamp(340px, 50vw, 520px)",
      },
      position: "bottom-right",
      onDismiss: () => showDismissConfirmModal(currentVersion, latestVersion),
    }
  );
}

function showDismissConfirmModal(currentVersion: any, latestVersion: any, asTransition: boolean = false) {
  const div = document.createElement("div");
  const reactRoot = ReactDOM.createRoot(div);
  flushSync(() => {
    reactRoot.render(
      <div className="update-card-wrapper slm update-dismiss-confirm">
        <div className="udc-icon-wrap">
          <svg className="udc-warn-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 2.5L1.5 21h21L12 2.5Z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
            <path d="M12 9.5v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
            <circle cx="12" cy="17.5" r="0.85" fill="currentColor"/>
          </svg>
        </div>

        <h2 className="uc-title">Outdated version?</h2>
        <p className="uc-subtitle udc-desc">
          Running an older version means you may miss new lyrics, bug fixes, and features.<br />
          Some lyrics sources and capabilities are <strong>only available in the latest version</strong>.
        </p>

        <button
          className="btn-update"
          onClick={() => showUpdateModal(currentVersion, latestVersion, true)}
        >
          Update now
        </button>
        <button
          className="btn-secondary"
          onClick={() => PopupModal.hide()}
        >
          Update on restart
        </button>
      </div>
    );
  });

  const options = {
    title: "Spicy Lyrics",
    content: div,
    onClose: () => reactRoot.unmount(),
    closeOnOutsideClick: false,
  };

  if (asTransition) {
    PopupModal.transition(options);
  } else {
    PopupModal.display(options);
  }
}

function showUpdateModal(currentVersion: any, latestVersion: any, asTransition: boolean = false) {
  const div = document.createElement("div");
  const reactRoot = ReactDOM.createRoot(div);
  flushSync(() => {
    reactRoot.render(
      <div className="update-card-wrapper slm">
        <h2 className="uc-title">Update available</h2>
        <p className="uc-subtitle">A new version of Spicy Lyrics is ready to install.</p>

        <div className="uc-divider" />

        <div className="uc-version-row">
          <span className="uc-ver">{currentVersion?.Text || "Current"}</span>
          <span className="uc-arrow">→</span>
          <span className="uc-ver new">{latestVersion?.Text || "Latest"}</span>
        </div>

        <button
          className="btn-update"
          onClick={() => Session.Navigate({ pathname: "/SpicyLyrics/Update" })}
        >
          Update now
        </button>
        <button
          className="btn-secondary"
          onClick={() => {
            _transitioningModals = true;
            showDismissConfirmModal(currentVersion, latestVersion, true);
            _transitioningModals = false;
          }}
        >
          Update on restart
        </button>
      </div>
    );
  });

  const options = {
    title: "Spicy Lyrics",
    content: div,
    onClose: () => reactRoot.unmount(),
    closeOnOutsideClick: false,
    closeHandler: () => {
      _transitioningModals = true;
      showDismissConfirmModal(currentVersion, latestVersion, true);
      _transitioningModals = false;
    },
  };

  if (asTransition) {
    PopupModal.transition(options);
  } else {
    PopupModal.display(options);
  }
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
