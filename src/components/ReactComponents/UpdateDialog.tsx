import React from "react";
import { NoticeLink, showNotice } from "./NoticeDialog.tsx";

const DISCORD_URL = "https://discord.com/invite/uqgXU5wh8j";

export const releaseNotesUrl = (version: string) =>
  `https://github.com/Spikerko/spicy-lyrics/releases/tag/${encodeURIComponent(version)}`;

export function showUpdatedDialog(fromVersion: string, toVersion: string) {
  showNotice({
    title: `Updated to ${toVersion}`,
    content: [
      <p className="sl-notice-text">
        You were on <span className="sl-notice-version">{fromVersion}</span>. The release notes list everything that
        changed.
      </p>,
      <p className="sl-notice-text sl-notice-text--quiet">
        Something broke after the update? Tell us on <NoticeLink href={DISCORD_URL}>Discord</NoticeLink>.
      </p>,
    ],
    primary: {
      label: "Read release notes",
      onClick: () => window.open(releaseNotesUrl(toVersion), "_blank"),
    },
    secondaryLabel: "Close",
  });
}
