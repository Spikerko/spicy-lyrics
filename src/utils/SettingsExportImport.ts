const STORAGE_PREFIXES = ["SpicyLyrics-", "spicy-lyrics-settings.", "spicy-lyrics-dev-settings.", "spicy-lyrics-health."];

export function exportSettings(): void {
  const data: Record<string, string> = {};

  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (STORAGE_PREFIXES.some((p) => key.startsWith(p))) {
      data[key] = window.localStorage.getItem(key) ?? "";
    }
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spicy-lyrics-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSettings(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result;
        if (typeof raw !== "string") throw new Error("empty");
        const data = JSON.parse(raw) as Record<string, unknown>;
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === "string") {
            window.localStorage.setItem(key, value);
          }
        }
        (Spicetify as any).showNotification?.("Settings imported! Reloading in 2s…", false, 2000);
        setTimeout(() => window.location.reload(), 2200);
      } catch {
        (Spicetify as any).showNotification?.("Failed to import: invalid settings file.", true);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
