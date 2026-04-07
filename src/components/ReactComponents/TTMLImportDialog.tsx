import React from "react";

const DevToolsDialog: React.FC = () => {
  return (
    <div className="dev-tools-wrapper slm">
      <div className="dt-section-label">TTML</div>
      <div className="dt-setting">
        <div className="dt-setting-info">
          <span className="dt-setting-name">Load TTML</span>
          <span className="dt-setting-desc">Load a TTML file for the currently playing song</span>
        </div>
        <button
          className="dt-btn dt-btn-primary"
          onClick={() => (window as any)._spicy_lyrics.execute("upload-ttml")}
        >
          Load TTML
        </button>
      </div>
      <div className="dt-setting">
        <div className="dt-setting-info">
          <span className="dt-setting-name">Reset TTML</span>
          <span className="dt-setting-desc">Clear the loaded TTML for the currently playing song</span>
        </div>
        <button
          className="dt-btn dt-btn-danger"
          onClick={() => (window as any)._spicy_lyrics.execute("reset-ttml")}
        >
          Reset TTML
        </button>
      </div>
    </div>
  );
};

export default DevToolsDialog;
