import React from "react";

interface UpdateDialogProps {
  fromVersion: string;
  spicyLyricsVersion: string;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({ fromVersion, spicyLyricsVersion }) => {
  return (
    <div className="update-card-wrapper slm">
      <h2 className="uc-title">Spicy Lyrics updated!</h2>
      <p className="uc-subtitle">You're running the latest version.</p>

      <div className="uc-divider" />

      {(fromVersion || spicyLyricsVersion) && (
        <div className="uc-version-row">
          {fromVersion && <span className="uc-ver">{fromVersion}</span>}
          {fromVersion && spicyLyricsVersion && <span className="uc-arrow">→</span>}
          {spicyLyricsVersion && <span className="uc-ver new">{spicyLyricsVersion}</span>}
        </div>
      )}

      <button
        className="btn-primary"
        onClick={() =>
          window.open(
            `https://github.com/Spikerko/spicy-lyrics/releases/tag/${spicyLyricsVersion}`,
            "_blank"
          )
        }
      >
        See what's new →
      </button>
      <button
        className="btn-discord"
        onClick={() => window.open("https://discord.com/invite/uqgXU5wh8j", "_blank")}
      >
        Join the Discord
      </button>
    </div>
  );
};

export default UpdateDialog;
