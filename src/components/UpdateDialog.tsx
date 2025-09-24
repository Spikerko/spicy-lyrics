import React from "react";

interface UpdateDialogProps {
  previousVersion: string;
  spicyLyricsVersion: string;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({ previousVersion, spicyLyricsVersion }) => {
  return (
    <div className="update-card-wrapper slm">
      <h2 className="header">Spicy Lyrics has been successfully updated!</h2>
      <div className="card version">
        Version: {previousVersion || "Unknown"} → {spicyLyricsVersion || "Unknown"}
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
        Release Notes →
      </button>
      <button
        className="card btn btn-discord"
        onClick={() => window.open("https://discord.com/invite/uqgXU5wh8j", "_blank")}
      >
        <p>Join our Discord Server! →</p>
        <p style={{ opacity: "0.45", marginTop: "0.25cqh" }}>Help our community grow by boosting our Discord server 🚀!</p>
      </button>
    </div>
  );
};

export default UpdateDialog;
