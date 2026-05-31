import React from "react";
import ReactDOM from "react-dom/client";
import { PopupModal } from "../components/Modal.ts";
import SettingsPanel from "../components/ReactComponents/SettingsPanel/index.tsx";

export function openSettingsPanel() {
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(SettingsPanel));
  PopupModal.display({
    title: "Settings",
    content: container,
    isLarge: true,
    modalId: "settingsPanel",
    onClose: () => {
      root.unmount();
    },
  });
}