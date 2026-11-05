import { useStore } from "@nanostores/react";
import { useEffect, useRef, useState } from "react";
import Session from "../../Global/Session.ts";
import {
  BuildBugReport,
  CopyText,
  DISCORD_BUGS_URL,
  DISCORD_INVITE_URL,
} from "../../../utils/BugReport.ts";
import { $latestVersion } from "./About.tsx";
import { BugIcon } from "./icons.tsx";
import type { SectionDef } from "./model.ts";

// The preview follows what's playing and the measured smoothness while the tab is open.
const PREVIEW_REFRESH_MS = 2000;
// How long "Copied" / "Couldn't copy" stays on a button.
const COPY_FEEDBACK_MS = 2200;

type CopyState = "idle" | "done" | "failed";

function useCopy(after?: () => void) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async (from: Element) => {
    const ok = await CopyText(BuildBugReport({ latestVersion: $latestVersion.get() }), from);
    setState(ok ? "done" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), COPY_FEEDBACK_MS);
    if (ok) after?.();
  };
  return [state, copy] as const;
}

/**
 * Every label sits in the same grid cell and only the current one is visible, so the
 * button keeps the width of its longest label instead of jumping as it changes.
 */
function CopyLabel({ state, idle }: { state: CopyState; idle: string }) {
  const faces: [CopyState, string][] = [
    ["idle", idle],
    ["done", "Copied"],
    ["failed", "Couldn't copy"],
  ];
  return (
    <span className="sl-sp-bug-faces">
      {faces.map(([face, text]) => (
        <span key={face} className="sl-sp-bug-face" aria-hidden={face !== state} data-shown={face === state}>
          {text}
        </span>
      ))}
    </span>
  );
}

/** The searchable row's control: copies without leaving Settings. */
function CopyReportButton() {
  const [state, copy] = useCopy();
  return (
    <button type="button" className="sl-sp-btn" data-state={state} onClick={(e) => copy(e.currentTarget)}>
      <CopyLabel state={state} idle="Copy" />
    </button>
  );
}

/** Settings → Got a Bug?: what gets copied, and the way to Discord. */
export function BugReportPane() {
  const latestVersion = useStore($latestVersion);
  const [report, setReport] = useState(() => BuildBugReport());
  const [copyState, copy] = useCopy();
  const [discordState, copyAndOpen] = useCopy(() => window.open(DISCORD_BUGS_URL, "_blank"));

  useEffect(() => {
    setReport(BuildBugReport({ latestVersion }));
    const interval = setInterval(() => setReport(BuildBugReport({ latestVersion })), PREVIEW_REFRESH_MS);
    return () => clearInterval(interval);
  }, [latestVersion]);

  const current = Session.SpicyLyrics.GetCurrentVersion()?.Text;
  const outdated = !!latestVersion && !!current && Session.SpicyLyrics.IsBehind(
    Session.SpicyLyrics.GetCurrentVersion(),
    Session.SpicyLyrics.ParseVersion(latestVersion)
  );
  // The preview shows the block itself; the Markdown around it is only for Discord.
  const preview = report.split("\n").filter((line) => line !== "```" && !line.startsWith("**")).slice(0, -1);

  return (
    <div className="sl-sp-bug">
      <p className="sl-sp-intro">
        Copy your setup and post it in #extension-bugs on our Discord, with what went wrong. It tells us what we'd
        otherwise have to ask.
      </p>

      {outdated && (
        <div className="sl-sp-banner" role="status">
          <span>
            You're on {current}, and {latestVersion} is out. Update first: it may already be fixed.
          </span>
          <button
            type="button"
            className="sl-sp-about-update"
            onClick={() => Session.Navigate({ pathname: "/SpicyLyrics/Update" })}
          >
            Update
          </button>
        </div>
      )}

      <div className="sl-sp-bug-actions">
        <button
          type="button"
          className="sl-sp-about-link sl-sp-bug-primary"
          data-state={discordState}
          onClick={(e) => copyAndOpen(e.currentTarget)}
        >
          <CopyLabel state={discordState} idle="Copy & open Discord" />
        </button>
        <button
          type="button"
          className="sl-sp-about-link"
          data-state={copyState}
          onClick={(e) => copy(e.currentTarget)}
        >
          <CopyLabel state={copyState} idle="Copy only" />
        </button>
      </div>

      <div className="sl-sp-bug-fineprint">
        <p>No account details, user IDs or tokens are included.</p>
        <p>
          Not in the server yet?{" "}
          <button type="button" className="sl-sp-bug-join-link" onClick={() => window.open(DISCORD_INVITE_URL, "_blank")}>
            Join here
          </button>
        </p>
      </div>

      <div className="sl-sp-group">
        <h3 className="sl-sp-group-title">What gets copied</h3>
        <div className="sl-sp-bug-preview">
          {preview.map((line, i) => (
            <div key={i} className="sl-sp-bug-line">
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const bugReportSection: SectionDef = {
  id: "bug",
  title: "Got a Bug?",
  icon: BugIcon,
  secondary: true,
  // The tab renders BugReportPane (see index.tsx); this row is what search finds.
  groups: () => [
    {
      settings: [
        {
          id: "copyBugReport",
          label: "Copy Bug Report",
          description: "Copies your setup to paste in #extension-bugs on our Discord.",
          keywords: "bug report issue problem broken discord help support diagnostics debug details",
          Control: CopyReportButton,
        },
      ],
    },
  ],
};
