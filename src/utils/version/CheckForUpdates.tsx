import React from "react";
import { Spicetify } from "@spicetify/bundler";
import { isDev } from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import ReactDOM from "react-dom/client";

let ShownUpdateNotice = false;

export async function CheckForUpdates(force: boolean = false) {
  if (isDev) return;
  const IsOutdated = await Session.SpicyLyrics.IsOutdated();
  if (IsOutdated) {
    if (!force && ShownUpdateNotice) return;
    const currentVersion = Session.SpicyLyrics.GetCurrentVersion();
    const latestVersion = await Session.SpicyLyrics.GetLatestVersion();

    const div = document.createElement("div");
    ReactDOM.createRoot(div).render(
      <div className="update-card-wrapper slm">
        <div className="card">
          <div>Your Spicy Lyrics version is outdated.</div>
          <div>To update, click on the "Update" button.</div>
        </div>
        <div className="card">
          Version: From: {currentVersion?.Text || "Unknown"} → To:{" "}
          {latestVersion?.Text || "Unknown"}
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

    Spicetify.PopupModal.display({
      title: "New Update - Spicy Lyrics",
      content: div,
    });
    ShownUpdateNotice = true;
  }
}
