import { useStore } from "@nanostores/react";
import { Fragment } from "react";
import { getExperiment, getVisibleExperiments } from "../../../utils/experiments.ts";
import {
  $ttmlReviewer,
  getOtherLyricsExtensions,
  REVIEWER_EXPERIMENTS_OFF,
  REVIEWER_SETTINGS,
  setTtmlReviewer,
} from "../../../utils/ttmlReviewer.ts";
import { Row, Toggle } from "./components.tsx";
import { ReviewerIcon } from "./icons.tsx";
import type { SectionDef } from "./model.ts";

const MODE_LABEL = "TTML Reviewer Mode";
const MODE_DESCRIPTION =
  "Saves your settings and strips Spicy Lyrics back to basics. Turn it off to get them back exactly as they were.";

function ModeToggle({ label }: { label: string }) {
  return <Toggle label={label} checked={useStore($ttmlReviewer)} onChange={setTtmlReviewer} />;
}

/** Settings → TTML Reviewer: the switch, then everything it does. */
export function ReviewerPane({ labelOf }: { labelOf: (id: string) => string | undefined }) {
  const on = useStore($ttmlReviewer);
  const others = on ? getOtherLyricsExtensions() : [];
  const held = new Set<string>(REVIEWER_EXPERIMENTS_OFF);
  const defaulted = getVisibleExperiments().filter((experiment) => !held.has(experiment.id));

  return (
    <div className="sl-sp-reviewer">
      <p className="sl-sp-intro">
        Review a sync as it really is, without your setup getting in the way. Everyone in this mode gets the same
        timing and lyric effects.
      </p>

      <div className="sl-sp-card">
        <Row label={MODE_LABEL} description={MODE_DESCRIPTION}>
          <ModeToggle label={MODE_LABEL} />
        </Row>
      </div>

      {others.length > 0 && (
        <div className="sl-sp-banner" role="status">
          <span>
            {others.join(" and ")} still {others.length > 1 ? "change" : "changes"} your lyrics. Turn{" "}
            {others.length > 1 ? "them" : "it"} off to review.
          </span>
        </div>
      )}

      <div className="sl-sp-group">
        <h3 className="sl-sp-group-title">What it sets</h3>
        <div className="sl-sp-reviewer-list">
          {REVIEWER_SETTINGS.map(({ key, shown }) => (
            <Fragment key={key}>
              <div className="sl-sp-reviewer-item">
                <span>{labelOf(key) ?? key}</span>
                <span className="sl-sp-reviewer-value">{shown}</span>
              </div>
              {/* Kept apart from the settings, so the mode skips them rather than resetting them. */}
              {key === "playbackOffset" && (
                <div className="sl-sp-reviewer-item">
                  <span>Per-song Offsets</span>
                  <span className="sl-sp-reviewer-value">Ignored</span>
                </div>
              )}
            </Fragment>
          ))}
          {/* A remote forceState still wins over the mode, and a hidden experiment isn't named here
              any more than in the Experiments tab. */}
          {REVIEWER_EXPERIMENTS_OFF.map((id) => getExperiment(id))
            .filter((experiment) => !experiment.hidden)
            .map((experiment) => (
              <div key={experiment.id} className="sl-sp-reviewer-item">
                <span>{experiment.label}</span>
                <span className="sl-sp-reviewer-value">{experiment.forceState === true ? "Forced on" : "Off"}</span>
              </div>
            ))}
          {defaulted.length > 0 && (
            <div className="sl-sp-reviewer-item">
              <span>Other experiments</span>
              <span className="sl-sp-reviewer-value">Default</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const reviewerSection: SectionDef = {
  id: "reviewer",
  title: "TTML Reviewer",
  icon: ReviewerIcon,
  secondary: true,
  // The tab renders ReviewerPane (see index.tsx); this row is what search finds.
  groups: () => [
    {
      settings: [
        {
          id: "ttmlReviewerMode",
          label: MODE_LABEL,
          description: MODE_DESCRIPTION,
          keywords: "review sync ttml basics reset default clean plain maker",
          Control: ModeToggle,
        },
      ],
    },
  ],
};
