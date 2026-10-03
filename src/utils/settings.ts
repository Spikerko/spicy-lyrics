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

export function registerSettingsMenu(icon: string) {
  const name = "Spicy Lyrics Settings";
  const itemId = "SpicyLyricsSettingsMenuItem";
  const profileSelector = '[data-testid="user-widget-link"]';
  const menuSelector = '#context-menu ul[role="menu"]';

  new Spicetify.Menu.Item(name, false, openSettingsPanel, icon).register();

  const syncMenu = () => {
    const profile = document.querySelector<HTMLButtonElement>(profileSelector);
    const owned = document.getElementById(itemId);
    const menu = document.querySelector<HTMLUListElement>(menuSelector);
    if (profile?.getAttribute("aria-expanded") !== "true" || !menu) {
      owned?.remove();
      return;
    }

    const rows = [...menu.querySelectorAll<HTMLLIElement>(':scope > li[role="presentation"]')];
    if (rows.some(row => row.id !== itemId && row.textContent?.trim() === name)) {
      owned?.remove();
      return;
    }
    if (owned?.parentElement === menu) return;
    owned?.remove();

    const template = rows.find(row => row.querySelector('[role="menuitem"]'));
    const nativeButton = template?.querySelector<HTMLElement>('[role="menuitem"]');
    if (!template || !nativeButton) return;

    const row = document.createElement("li");
    row.id = itemId;
    row.className = template.className;
    row.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.className = nativeButton.className;
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    const label = document.createElement("span");
    label.className = "encore-text-body-small ellipsis-one-line";
    label.dir = "auto";
    label.style.flex = "1";
    label.textContent = name;
    const graphic = new DOMParser().parseFromString(icon, "image/svg+xml").documentElement;
    graphic.setAttribute("aria-hidden", "true");
    button.append(document.importNode(graphic, true), label);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openSettingsPanel();
      if (profile.getAttribute("aria-expanded") === "true") profile.click();
    });
    row.append(button);
    const firstNativeRow = rows.find(candidate => candidate.querySelector('a[role="menuitem"][href]'));
    if (firstNativeRow) firstNativeRow.before(row);
    else menu.prepend(row);
  };

  // Spotify replaces menu contents after opening; ignore unrelated lyric mutations.
  new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target;
      if (target instanceof Element && (target.matches(profileSelector) || target.closest("#context-menu"))) return true;
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches("#context-menu") || node.querySelector("#context-menu"))
      );
    })) syncMenu();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
  syncMenu();
}
