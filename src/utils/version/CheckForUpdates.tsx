import React from "react";
import { isDev } from "../../components/Global/Defaults.ts";
import Session from "../../components/Global/Session.ts";
import { toast } from "sonner";
import { NoticeLink, showNotice } from "../../components/ReactComponents/NoticeDialog.tsx";
import { releaseNotesUrl } from "../../components/ReactComponents/UpdateDialog.tsx";

let ShownUpdateNotice = false;
let WarningInFlight = false;

function startUpdate() {
  Session.Navigate({ pathname: "/SpicyLyrics/Update" });
}

/**
 * Non-blocking warning toast. Fires when the user dismisses any part of the
 * update flow without acting on it. Carries an "Update" action so the
 * user can still recover. Deduped so a user clicking through multiple
 * dismiss paths (e.g., toast X then modal close) doesn't get stacked
 * warnings.
 */
function showUpdateDismissWarning(currentVersion: any) {
  if (WarningInFlight) return;
  WarningInFlight = true;
  toast.warning(currentVersion?.Text ? `Staying on ${currentVersion.Text}` : "Staying on this version", {
    description: "Some lyrics sources and features need the latest version. Updating reloads Spotify.",
    duration: 9000,
    action: {
      label: "Update",
      onClick: startUpdate,
    },
    position: "bottom-right",
    onDismiss: () => { WarningInFlight = false; },
    onAutoClose: () => { WarningInFlight = false; },
  });
}

function presentUpdateAvailable(currentVersion: any, latestVersion: any) {
  let viewClicked = false;

  toast(latestVersion?.Text ? `Spicy Lyrics ${latestVersion.Text} is out` : "A Spicy Lyrics update is out", {
    description: currentVersion?.Text ? `You're on ${currentVersion.Text}.` : undefined,
    duration: Infinity,
    closeButton: true,
    action: {
      label: "Details",
      onClick: (event) => {
        viewClicked = true;
        // The dialog grows out of the toast, so it reads as the same notice opening up.
        const toastEl = (event.currentTarget as HTMLElement).closest("[data-sonner-toast]");
        showUpdateModal(currentVersion, latestVersion, toastEl?.getBoundingClientRect());
      },
    },
    position: "bottom-right",
    onDismiss: () => {
      // Sonner fires onDismiss both on user X-click and after action
      // follow-through. We only want to warn when the user truly walked
      // away; viewClicked guards the action path.
      if (!viewClicked) showUpdateDismissWarning(currentVersion);
    },
  });
}

function showUpdateModal(currentVersion: any, latestVersion: any, origin?: DOMRect) {
  const current = currentVersion?.Text;
  const latest = latestVersion?.Text;
  const content = [
    <p className="sl-notice-text">
      {current && (
        <>
          You're on <span className="sl-notice-version">{current}</span>.{" "}
        </>
      )}
      Updating reloads Spotify, which takes a few seconds.
    </p>,
  ];
  if (latest) {
    content.push(
      <p className="sl-notice-text sl-notice-text--quiet">
        See what changed in the <NoticeLink href={releaseNotesUrl(latest)}>release notes</NoticeLink>.
      </p>
    );
  }

  showNotice({
    title: latest ? `Version ${latest} is out` : "An update is out",
    content,
    primary: { label: "Update and reload", onClick: startUpdate },
    secondaryLabel: "Not now",
    onDismiss: () => showUpdateDismissWarning(currentVersion),
    origin,
  });
}

export async function CheckForUpdates(force: boolean = false) {
  if (isDev) return;
  if (!force && ShownUpdateNotice) return;
  // One request: fetching the latest version a second time for the notice
  // could be held back by the circuit breaker and throw, losing the notice.
  const latestVersion = await Session.SpicyLyrics.GetLatestVersion();
  const currentVersion = Session.SpicyLyrics.GetCurrentVersion();
  if (!Session.SpicyLyrics.IsBehind(currentVersion, latestVersion)) return;

  presentUpdateAvailable(currentVersion, latestVersion);

  ShownUpdateNotice = true;
}

// ---- dev stuff ------

function fakeLatestVersion(updateTo: string) {
  const parsed = Session.SpicyLyrics.ParseVersion(updateTo);
  if (parsed) return parsed;
  return {
    Text: updateTo,
    Major: 9,
    Minor: 9,
    Patch: 9,
  };
}

export function triggerSpicyLyricsFakeUpdate(options: { updateTo: string }) {
  const currentVersion = Session.SpicyLyrics.GetCurrentVersion();
  const latestVersion = fakeLatestVersion(options.updateTo);
  presentUpdateAvailable(currentVersion, latestVersion);
}
