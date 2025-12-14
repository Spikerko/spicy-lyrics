import React from "react";
import { isDev } from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import ReactDOM from "react-dom/client";
import { PopupModal } from "../../components/Modal.ts";
import { t } from "../i18n.ts";

let ShownUpdateNotice = false;

export async function CheckForUpdates(force: boolean = false) {
  if (isDev) return;
  const IsOutdated = await Session.SpicyLyrics.IsOutdated();
  if (IsOutdated) {
    if (!force && ShownUpdateNotice) return;
    const currentVersion = Session.SpicyLyrics.GetCurrentVersion();
    const latestVersion = await Session.SpicyLyrics.GetLatestVersion();

    const div = document.createElement("div");
    const reactRoot = ReactDOM.createRoot(div);
    reactRoot.render(
      <div className="update-card-wrapper slm">
        <div className="card">
          <div>{t("update.outdated")}</div>
          <div>{t("update.clickToUpdate")}</div>
        </div>
        <div className="card">
          {t("update.versionFrom")} {currentVersion?.Text || t("update.unknown")} {t("update.versionTo")}{" "}
          {latestVersion?.Text || t("update.unknown")}
        </div>
        <button
          onClick={() =>
            window._spicy_lyrics_session.Navigate({ pathname: "/SpicyLyrics/Update" })
          }
          className="btn-release"
          data-encore-id="buttonSecondary"
        >
          {t("update.updateButton")}
        </button>
      </div>
    );

    PopupModal.display({
      title: t("update.title"),
      content: div,
      onClose: () => {
        reactRoot.unmount();
      }
    });
    ShownUpdateNotice = true;
  }
}
