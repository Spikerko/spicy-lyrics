import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { SpotifyPlayer } from "../../../../components/Global/SpotifyPlayer";
import fetchLyrics from "../../../../utils/Lyrics/fetchLyrics";
import ApplyLyrics from "../../../../utils/Lyrics/Global/Applyer";
import { ParseTTML } from "../../../../utils/Lyrics/manager/parseTTML";
import { ProcessLyrics } from "../../../../utils/Lyrics/ProcessLyrics";
import { $currentLyricsData } from "../../../../utils/stores";
import { LocalLyricsManager } from "../../../../utils/Lyrics/manager";
import { IconButton } from "./IconButton";
import { ArrowLeftIcon, UploadIcon } from "./Icons";

type UploadMode = "persistent" | "temporary";

type UploadTTMLModalProps = {
  onBack: () => void;
  onDone: (mode: UploadMode) => void;
};

export default function UploadTTMLModal({ onBack, onDone }: UploadTTMLModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<UploadMode>("persistent");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const songName = SpotifyPlayer.GetName() ?? "Unknown Song";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  }

  async function handleUpload() {
    if (!file || uploading) return;

    const uri = SpotifyPlayer.GetUri();
    if (!uri) {
      toast.error("No track is currently playing.", { duration: 5000 });
      return;
    }

    if (uri.startsWith("spotify:local:")) {
      toast.warning("Local TTML files are not available on local songs", { duration: 5000 });
      return;
    }

    setUploading(true);

    const reader = new FileReader();
    reader.onerror = () => {
      toast.error("Error reading TTML file.", { duration: 5000 });
      setUploading(false);
    };
    reader.onload = async (e) => {
      try {
        const ttml = e.target?.result as string;

        if (mode === "persistent") {
          await LocalLyricsManager.put(uri, ttml);
          $currentLyricsData.set("");
          setTimeout(() => {
            fetchLyrics(uri)
              .then(ApplyLyrics)
          }, 25);
          toast.success("TTML saved to Local DB!", { duration: 5000 });
          onDone("persistent");
        } else {
          toast("Found TTML, Parsing...", { duration: 3000 });
          const result = await ParseTTML(ttml);
          if (!result) {
            toast.error("Failed to parse TTML.", { duration: 5000 });
            setUploading(false);
            return;
          }
          const dataToSave = {
            ...result?.Result,
            id: SpotifyPlayer.GetId(),
          };
          await ProcessLyrics(dataToSave);
          $currentLyricsData.set(JSON.stringify(dataToSave));
          setTimeout(() => {
            fetchLyrics(uri)
              .then((lyrics) => {
                ApplyLyrics(lyrics);
                toast.success("Lyrics Parsed and Applied!", { duration: 5000 });
              })
              .catch((err) => {
                toast.error("Error applying lyrics", { duration: 5000 });
                console.error("Error applying lyrics:", err);
              });
          }, 25);
          onDone("temporary");
        }
      } catch (err) {
        toast.error("Upload failed.", { duration: 5000 });
        console.error("TTML upload error:", err);
        setUploading(false);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="sl-ldb-upload-root">
      <div className="sl-ldb-upload-header">
        <h2 className="sl-ldb-upload-title">Upload TTML</h2>
        <p className="sl-ldb-upload-subtitle">For: {songName}</p>
      </div>

      <div className="sl-ldb-upload-file-section">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ttml"
          id="sl-ldb-file-input"
          className="sl-ldb-file-input"
          onChange={handleFileChange}
        />
        <label htmlFor="sl-ldb-file-input" className="sl-ldb-file-label">
          {file ? file.name : "Choose .ttml file…"}
        </label>
      </div>

      <div className="sl-ldb-upload-mode-section">
        <button
          type="button"
          className={`sl-ldb-upload-mode-card${mode === "persistent" ? " sl-ldb-upload-mode-card--active" : ""}`}
          onClick={() => setMode("persistent")}
        >
          <span className="sl-ldb-upload-mode-title">Persistent Upload</span>
          <span className="sl-ldb-upload-mode-desc">Stored in local DB, survives restarts</span>
        </button>
        <button
          type="button"
          className={`sl-ldb-upload-mode-card${mode === "temporary" ? " sl-ldb-upload-mode-card--active" : ""}`}
          onClick={() => setMode("temporary")}
        >
          <span className="sl-ldb-upload-mode-title">Temporary Upload</span>
          <span className="sl-ldb-upload-mode-desc">Applied only to current song until refresh</span>
        </button>
      </div>

      <div className="sl-ldb-upload-actions">
        <IconButton
          icon={<ArrowLeftIcon size={14} />}
          label="Back"
          variant="default"
          onClick={onBack}
          disabled={uploading}
        />
        <IconButton
          icon={<UploadIcon size={14} />}
          label={uploading ? "Uploading…" : "Upload"}
          variant="primary"
          onClick={handleUpload}
          disabled={!file || uploading}
        />
      </div>
    </div>
  );
}
