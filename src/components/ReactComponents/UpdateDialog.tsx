import React from "react";
import Session from "../Global/Session.ts";

interface UpdateDialogProps {
  fromVersion: string;
  spicyLyricsVersion: string;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({ fromVersion, spicyLyricsVersion }) => {
  const prev = fromVersion ? Session.SpicyLyrics.ParseVersion(fromVersion) : undefined;
  const curr = spicyLyricsVersion ? Session.SpicyLyrics.ParseVersion(spicyLyricsVersion) : undefined;

  const isDowngrade = prev && curr ? Session.SpicyLyrics.CompareVersions(curr, prev) < 0 : false;
  return (
    <div className="update-card-wrapper slm sl-update-modal">
      <div className="sl-update-hero">
        <span className={`sl-update-status ${isDowngrade ? "is-warning" : "is-success"}`}>
          {isDowngrade ? "Downgraded" : "Updated"}
        </span>
        <div className="sl-update-title">
          {isDowngrade
            ? "Spicy Lyrics has been rolled back."
            : "Spicy Lyrics has been updated."}
        </div>
        <p className="sl-update-copy">
          {isDowngrade
            ? "You are now running an older build. Check the release notes if you downgraded on purpose."
            : "Your install now includes the latest fixes and interface changes for this build."}
        </p>
      </div>

      <div className="sl-update-section">
        <span className="sl-update-section-label">Version</span>
        <div className="sl-update-version">
          {fromVersion ? `${fromVersion} → ` : ""}
          {spicyLyricsVersion || "Unknown"}
        </div>
      </div>

      <div className="sl-update-actions">
        <button
          type="button"
          className="sl-btn sl-btn-primary sl-update-action"
          onClick={() =>
            window.open(
              `https://github.com/Spikerko/spicy-lyrics/releases/tag/${spicyLyricsVersion}`,
              "_blank"
            )
          }
        >
          Release Notes
        </button>
        <button
          type="button"
          className="sl-btn sl-update-action"
          onClick={() => window.open("https://discord.com/invite/uqgXU5wh8j", "_blank")}
        >
          Join Discord
        </button>
      </div>
    </div>
  );
};

export default UpdateDialog;
