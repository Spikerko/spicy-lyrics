import type React from "react";
import {
  EXPERIMENT_CATEGORIES,
  getVisibleExperiments,
  RefreshExperimentOverrides,
} from "../../../utils/experiments.ts";
import { ExperimentRow, SyncStatus } from "./ExperimentsPanel.tsx";
import { ExperimentsIcon } from "./icons.tsx";
import type { SectionDef } from "./model.ts";

export const experimentsSection: SectionDef = {
  id: "experiments",
  title: "Experiments",
  icon: ExperimentsIcon,
  intro: "Features still being shaped. Turn one off if you prefer how things worked before.",
  emptyText: "No experiments right now.",
  Accessory: SyncStatus,
  // Before the tab renders, so its first frame is already locked and loading.
  onEnter: () => void RefreshExperimentOverrides(),
  // Rebuilt each render so remote overrides (labels, hidden rows) show at once.
  // The rows stay mounted across rebuilds: they are keyed by id, and `render`
  // returns an element of the same ExperimentRow type every time.
  // One group per category with anything in it, in EXPERIMENT_CATEGORIES order.
  groups: () => {
    const visible = getVisibleExperiments();
    return EXPERIMENT_CATEGORIES.map(({ id, title }) => ({
      title,
      settings: visible
        .filter((experiment) => experiment.category === id)
        .map((experiment) => ({
          id: `experiment:${experiment.id}`,
          label: experiment.label,
          description: experiment.description,
          keywords: `experiment ${title.toLowerCase()}`,
          render: (label: React.ReactNode, searching: boolean) => (
            <ExperimentRow experiment={experiment} label={label} searching={searching} />
          ),
        })),
    })).filter((group) => group.settings.length > 0);
  },
};
