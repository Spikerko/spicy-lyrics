import { useStore } from "@nanostores/react";
import {
  $experiment,
  EXPERIMENTS,
  type RegisteredExperiment,
} from "../../../utils/experiments.ts";
import { Row, Toggle } from "./components.tsx";

/**
 * The Experiments sub-panel. Renders straight off the EXPERIMENTS registry, so a
 * new experiment shows up here the moment it's added to `utils/experiments.ts`.
 */
export default function ExperimentsPanel({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ padding: "8px 0" }} className="slm w-40">
      <div className="sl-sp-subheader">
        <button className="sl-sp-back-btn" onClick={onBack} aria-label="Back to Settings">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.5 2.5L4 7l4.5 4.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Settings
        </button>
      </div>

      <p className="sl-sp-experiments-note">
        These features are still being shaped. Toggle one off if you prefer how things worked
        before — everything here is safe to switch at any time.
      </p>

      {EXPERIMENTS.map((exp) => (
        <ExperimentRow key={exp.id} experiment={exp} />
      ))}
    </div>
  );
}

function ExperimentRow({ experiment }: { experiment: RegisteredExperiment }) {
  const store = $experiment(experiment.id);
  const enabled = useStore(store);

  return (
    <Row label={experiment.label} description={experiment.description}>
      <Toggle checked={enabled} onChange={(v) => store.set(v)} />
    </Row>
  );
}
