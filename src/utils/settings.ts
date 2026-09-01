import React from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import { PopupModal } from "../components/Modal.ts";
import SettingsPanel from "../components/ReactComponents/SettingsPanel/index.tsx";
import ExperimentsPanel from "../components/ReactComponents/SettingsPanel/ExperimentsPanel.tsx";

const MODAL_ID = "settingsPanel";

type Direction = "forward" | "back";

/**
 * Render a panel into a fresh container + root. The direction class drives the
 * slide-in, so the modal frame stays put while its contents navigate.
 */
function renderPanel(element: React.ReactElement, direction?: Direction) {
  const container = document.createElement("div");
  container.className = direction ? `sl-sp-page sl-sp-page--${direction}` : "sl-sp-page";
  const root = ReactDOM.createRoot(container);
  // Render synchronously so the modal never shows an empty frame mid-swap.
  flushSync(() => root.render(element));
  return { container, root };
}

export function openSettingsPanel() {
  const { container, root } = renderPanel(
    React.createElement(SettingsPanel, { onOpenExperiments: openExperimentsPanel })
  );

  PopupModal.display({
    title: "Settings",
    content: container,
    isLarge: true,
    modalId: MODAL_ID,
    onClose: () => root.unmount(),
  });
}

/** Back navigation from a sub-panel — swaps content without reopening the modal. */
function backToSettings() {
  const { container, root } = renderPanel(
    React.createElement(SettingsPanel, { onOpenExperiments: openExperimentsPanel }),
    "back"
  );

  PopupModal.transition({
    title: "Settings",
    content: container,
    modalId: MODAL_ID,
    onClose: () => root.unmount(),
  });
}

function openExperimentsPanel() {
  const { container, root } = renderPanel(
    React.createElement(ExperimentsPanel, { onBack: backToSettings }),
    "forward"
  );

  // No closeHandler: the X closes the modal outright, and the panel's own Back
  // button is what returns to Settings.
  PopupModal.transition({
    title: "Experiments",
    content: container,
    modalId: MODAL_ID,
    onClose: () => root.unmount(),
  });
}
