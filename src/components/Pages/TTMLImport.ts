import React from "react";
import ReactDOM from "react-dom/client";
import { PopupModal } from "../Modal.ts";
import DevToolsDialog from "../ReactComponents/TTMLImportDialog.tsx";

export function OpenDevToolsModal() {
  const div = document.createElement("div");
  const reactRoot = ReactDOM.createRoot(div);
  reactRoot.render(React.createElement(DevToolsDialog));

  PopupModal.display({
    title: "Spicy Lyrics",
    isLarge: true,
    content: div,
    onClose: () => {
      reactRoot.unmount();
    },
  });
}
