import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import { PopupModal } from "../components/Modal.ts";
import LyricsDBPanel from "../components/ReactComponents/LyricsManager/index.tsx";
import UploadTTMLModal from "../components/ReactComponents/LyricsManager/components/UploadTTMLModal.tsx";

export function OpenLyricsDBPanel() {
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);

  flushSync(() => {
    root.render(<LyricsDBPanel onUploadClick={_openUpload} />);
  });

  PopupModal.display({
    title: "Local Lyrics DB",
    content: container,
    isLarge: true,
    onClose: () => root.unmount(),
  });
}

function _openUpload() {
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);

  flushSync(() => {
    root.render(
      <UploadTTMLModal
        onBack={_openDB}
        onDone={(mode) => {
          if (mode === "temporary") {
            PopupModal.hide();
          } else {
            _openDB();
          }
        }}
      />
    );
  });

  PopupModal.transition({
    content: container,
    onClose: () => root.unmount(),
    closeHandler: _openDB,
  });
}

function _openDB() {
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);

  flushSync(() => {
    root.render(<LyricsDBPanel onUploadClick={_openUpload} />);
  });

  PopupModal.transition({
    content: container,
    onClose: () => root.unmount(),
  });
}
