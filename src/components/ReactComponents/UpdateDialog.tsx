import React from "react";
import { t } from "../../utils/i18n.ts";

interface UpdateDialogProps {
  previousVersion: string;
  spicyLyricsVersion: string;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({ previousVersion, spicyLyricsVersion }) => {
  return (
    <div className="update-card-wrapper slm">
      <h2 className="header">{t("update.successTitle")}</h2>
      <div className="card version">
        {t("update.versionFrom")} {previousVersion || t("update.freshlyNew")} {t("update.versionTo")} {spicyLyricsVersion || t("update.unknown")}
      </div>
      <button
        className="card btn btn-release"
        onClick={() =>
          window.open(
            `https://github.com/Spikerko/spicy-lyrics/releases/tag/${spicyLyricsVersion}`,
            "_blank"
          )
        }
      >
        {t("update.releaseNotes")}
      </button>
      <button
        className="card btn btn-discord"
        onClick={() => window.open("https://discord.com/invite/uqgXU5wh8j", "_blank")}
      >
        <p>{t("update.joinDiscord")}</p>
        <p style={{ opacity: "0.45", marginTop: "0.25cqh" }}>{t("update.boostDiscord")}</p>
      </button>
    </div>
  );
};

export default UpdateDialog;
