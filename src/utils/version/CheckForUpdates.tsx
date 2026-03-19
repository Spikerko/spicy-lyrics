import React from "react";
import { isDev } from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import ReactDOM from "react-dom/client";
import { PopupModal } from "../../components/Modal.ts";

let ShownUpdateNotice = false;

export async function CheckForUpdates(force: boolean = false) {
  if (isDev) return;
  const IsOutdated = await Session.SpicyLyrics.IsOutdated();
  if (!IsOutdated) return;
  if (!force && ShownUpdateNotice) return;

  const currentVersion = Session.SpicyLyrics.GetCurrentVersion();
  const latestVersion = await Session.SpicyLyrics.GetLatestVersion();

  const div = document.createElement("div");
  const reactRoot = ReactDOM.createRoot(div);
  reactRoot.render(
    <div className="update-card-wrapper slm sl-update-modal">
      <div className="sl-update-hero">
        <span className="sl-update-status is-warning">Update Available</span>
        <div className="sl-update-title">Your Spicy Lyrics build is out of date.</div>
        <p className="sl-update-copy">
          Install the latest version to pick up the newest fixes and UI updates.
        </p>
      </div>

      <div className="sl-update-section">
        <span className="sl-update-section-label">Version</span>
        <div className="sl-update-version">
          {currentVersion?.Text || "Unknown"} → {latestVersion?.Text || "Unknown"}
        </div>
      </div>

      <div className="sl-update-actions">
        <button
          type="button"
          onClick={() => Session.Navigate({ pathname: "/SpicyLyrics/Update" })}
          className="sl-btn sl-btn-primary sl-update-action"
        >
          Update
        </button>
      </div>
    </div>
  );

  PopupModal.display({
    title: "New Update - Spicy Lyrics",
    content: div,
    onClose: () => {
      reactRoot.unmount();
    }
  });
  ShownUpdateNotice = true;
}
