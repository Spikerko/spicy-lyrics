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
    <div className="update-card-wrapper slm">
      <div className="card">
        <div>Your Spicy Lyrics version is outdated.</div>
        <div>To update, click on the "Update" button.</div>
      </div>
      <div className="card">
        Version: {currentVersion?.Text || "Unknown"} → {latestVersion?.Text || "Unknown"}
      </div>
      <button
        onClick={() =>
          window._spicy_lyrics_session.Navigate({ pathname: "/SpicyLyrics/Update" })
        }
        className="btn-release"
        data-encore-id="buttonSecondary"
      >
        Update
      </button>
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
