import type React from "react";

/**
 * One row in the settings panel. The label and description written here are
 * both what the row shows and what search reads, so the two can't drift apart.
 */
export interface SettingDef {
  id: string;
  label: string;
  description?: string;
  /** Extra search terms: old names and jargon the label no longer uses. */
  keywords?: string;
  /** Puts the control on its own full-width line under the label (sliders). */
  stacked?: boolean;
  /**
   * Returns why the row can't be changed right now, or false when it can.
   * Called inside the row's own component, so it may use hooks.
   */
  useDisabled?: () => string | false;
  /**
   * Returns a note shown under the row without disabling it, for when another
   * setting keeps this one from taking effect, or false. May use hooks, like `useDisabled`.
   */
  useNote?: () => string | false;
  Control?: React.FC<{ disabled: boolean; label: string }>;
  /** Renders the whole row instead of `Control` (experiments bring their own badge). */
  render?: (label: React.ReactNode) => React.ReactNode;
}

export interface GroupDef {
  title?: string;
  settings: SettingDef[];
}

export type SectionId =
  | "lyrics"
  | "background"
  | "playback"
  | "interface"
  | "appearance"
  | "experiments"
  | "advanced"
  | "about";

export interface SectionDef {
  id: SectionId;
  title: string;
  icon: React.ReactNode;
  /** Listed below the divider in the sidebar. */
  secondary?: boolean;
  /** Short line under the pane title. */
  intro?: string;
  /** Called on every render, so dynamic lists (experiments) stay current. */
  groups?: () => GroupDef[];
  /** Shown when `groups` comes back empty. */
  emptyText?: string;
  /** Sits beside the pane title. */
  Accessory?: React.FC;
  /** Runs right before the tab is shown. */
  onEnter?: () => void;
}

/**
 * Every term must appear in the setting's own text. Section and group titles are
 * left out: "lyrics" would otherwise match every row in the Lyrics tab, and the
 * sidebar already covers browsing by section.
 */
export function matchesSetting(query: string, setting: SettingDef): boolean {
  const terms = searchTerms(query);
  if (terms.length === 0) return true;
  const haystack = [setting.label, setting.description, setting.keywords]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Whether every term is in the label itself — those hits are listed first. */
export function matchesLabel(query: string, setting: SettingDef): boolean {
  const label = setting.label.toLowerCase();
  return searchTerms(query).every((term) => label.includes(term));
}

export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}
