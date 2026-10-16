import React from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import { PopupModal } from "../components/Modal.ts";
import SettingsPanel from "../components/ReactComponents/SettingsPanel/index.tsx";

const MODAL_ID = "settingsPanel";

export function openSettingsPanel() {
  const container = document.createElement("div");
  container.className = "sl-sp-page";
  const root = ReactDOM.createRoot(container);
  // Render synchronously so the modal never opens on an empty frame.
  flushSync(() => root.render(React.createElement(SettingsPanel)));

  // The panel draws its own title and close button (see .slmodal-settingsPanel
  // in settings-panel.css); the title here only names the dialog.
  PopupModal.display({
    title: "Settings",
    content: container,
    isLarge: true,
    modalId: MODAL_ID,
    onClose: () => root.unmount(),
  });
}

export function registerSettingsMenu(icon: string) {
  const name = "Spicy Lyrics Settings";
  const itemId = "SpicyLyricsSettingsMenuItem";
  const profileSelector = '[data-testid="user-widget-link"]';
  const menuSelector = '#context-menu ul[role="menu"]';

  // From Spotify 1.3.5 the profile menu is a React Aria collection, and Spicetify's
  // Menu.Item throws inside it ("cannot be rendered outside a collection"), which
  // takes the whole menu down. There the entry is only injected into the DOM below;
  // Menu.Item is kept as the fallback if that injection fails.
  let menuItemRegistered = false;
  const registerMenuItem = () => {
    if (menuItemRegistered) return;
    menuItemRegistered = true;
    new Spicetify.Menu.Item(name, false, openSettingsPanel, icon).register();
  };
  const [major = 0, minor = 0, patch = 0] = Spicetify.Platform.version
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const domOnly = major > 1 || (major === 1 && (minor > 3 || (minor === 3 && patch >= 5)));
  if (!domOnly) registerMenuItem();

  const syncMenu = () => {
    try {
      injectMenuRow();
    } catch (error) {
      if (!domOnly || menuItemRegistered) throw error;
      registerMenuItem();
    }
  };

  const injectMenuRow = () => {
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
    if (!template || !nativeButton) {
      // Rows rendered but none to copy from: let Spicetify render the entry instead.
      // (No rows yet just means the menu is still mounting.)
      if (domOnly && rows.length > 0) registerMenuItem();
      return;
    }

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
