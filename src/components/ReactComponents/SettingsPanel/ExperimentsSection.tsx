import { EXPERIMENTS } from "../../../utils/experiments.ts";
import { matches, Row, SectionTitle } from "./components.tsx";

const SECTION_NAME = "Experiments";

const LABEL = "Experiments";
const DESCRIPTION =
  "Try out in-progress features, and switch back if you prefer the old behaviour.";

interface Props {
  query: string;
  sectionFilter: string;
  onOpen: () => void;
}

export default function ExperimentsSection({ query, sectionFilter, onOpen }: Props) {
  if (sectionFilter !== "All" && sectionFilter !== SECTION_NAME) return null;

  // Searching for an experiment by its own name should surface this row too,
  // otherwise the flags would be invisible to the search box.
  const hit =
    matches(query, LABEL, DESCRIPTION) ||
    EXPERIMENTS.some((exp) => matches(query, exp.label, exp.description));

  if (!hit) return null;

  const count = EXPERIMENTS.length;

  return (
    <>
      <SectionTitle>Experiments</SectionTitle>

      <Row label={LABEL} description={DESCRIPTION}>
        <button className="sl-sp-btn" onClick={onOpen} disabled={count === 0}>
          {count > 0 ? `Open (${count})` : "None available"}
        </button>
      </Row>
    </>
  );
}
