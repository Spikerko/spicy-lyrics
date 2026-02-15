import { Spicetify } from "@spicetify/bundler";

let cleanupFn: (() => void) | null = null;

const VolumeSVGs = {
  muted: `<svg viewBox="0 0 26 24" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"><path d="M11.38 4.08a1.5 1.5 0 0 1 .62 1.22v13.4a1.5 1.5 0 0 1-2.44 1.17L4.84 16.5H3a2.5 2.5 0 0 1-2.5-2.5v-4A2.5 2.5 0 0 1 3 7.5h1.84l4.72-3.37a1.5 1.5 0 0 1 1.82-.05ZM10.5 5.3 5.56 8.83a1 1 0 0 1-.58.17H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1.98a1 1 0 0 1 .58.18l4.94 3.52V5.3Zm5.97 3.17a.75.75 0 0 1 1.06 0L19.25 10.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-1.72 1.72 1.72 1.72a.75.75 0 1 1-1.06 1.06l-1.72-1.72-1.72 1.72a.75.75 0 1 1-1.06-1.06l1.72-1.72-1.72-1.72a.75.75 0 0 1 0-1.06Z"/></svg>`,
  low: `<svg viewBox="0 0 26 24" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"><path d="M11.38 4.08a1.5 1.5 0 0 1 .62 1.22v13.4a1.5 1.5 0 0 1-2.44 1.17L4.84 16.5H3a2.5 2.5 0 0 1-2.5-2.5v-4A2.5 2.5 0 0 1 3 7.5h1.84l4.72-3.37a1.5 1.5 0 0 1 1.82-.05ZM10.5 5.3 5.56 8.83a1 1 0 0 1-.58.17H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1.98a1 1 0 0 1 .58.18l4.94 3.52V5.3Z"/><rect x="14.5" y="9.5" width="2" height="5" rx="1"/></svg>`,
  medium: `<svg viewBox="0 0 26 24" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"><path d="M11.38 4.08a1.5 1.5 0 0 1 .62 1.22v13.4a1.5 1.5 0 0 1-2.44 1.17L4.84 16.5H3a2.5 2.5 0 0 1-2.5-2.5v-4A2.5 2.5 0 0 1 3 7.5h1.84l4.72-3.37a1.5 1.5 0 0 1 1.82-.05ZM10.5 5.3 5.56 8.83a1 1 0 0 1-.58.17H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1.98a1 1 0 0 1 .58.18l4.94 3.52V5.3Z"/><rect x="14.5" y="9.5" width="2" height="5" rx="1"/><rect x="18.5" y="8" width="2" height="8" rx="1"/></svg>`,
  high: `<svg viewBox="0 0 26 24" fill="currentColor" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"><path d="M11.38 4.08a1.5 1.5 0 0 1 .62 1.22v13.4a1.5 1.5 0 0 1-2.44 1.17L4.84 16.5H3a2.5 2.5 0 0 1-2.5-2.5v-4A2.5 2.5 0 0 1 3 7.5h1.84l4.72-3.37a1.5 1.5 0 0 1 1.82-.05ZM10.5 5.3 5.56 8.83a1 1 0 0 1-.58.17H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1.98a1 1 0 0 1 .58.18l4.94 3.52V5.3Z"/><rect x="14.5" y="9.5" width="2" height="5" rx="1"/><rect x="18.5" y="8" width="2" height="8" rx="1"/><rect x="22.5" y="6.5" width="2" height="11" rx="1"/></svg>`,
};

function getVolumeIcon(vol: number): string {
  if (vol <= 0) return VolumeSVGs.muted;
  if (vol < 0.33) return VolumeSVGs.low;
  if (vol < 0.66) return VolumeSVGs.medium;
  return VolumeSVGs.high;
}

export function SetupVolumeSlider(container: HTMLElement, horizontal?: boolean) {
  CleanUpVolumeSlider();

  const icon = document.createElement("div");
  icon.className = "VolumeIcon";
  icon.innerHTML = getVolumeIcon(Spicetify.Player.getVolume());
  icon.addEventListener("click", () => {
    const vol = Spicetify.Player.getVolume();
    Spicetify.Player.setVolume(vol > 0 ? 0 : 0.5);
  });

  const sliderBar = document.createElement("div");
  sliderBar.className = "SliderBar";

  const handle = document.createElement("div");
  handle.className = "Handle";
  sliderBar.appendChild(handle);

  if (horizontal) {
    container.classList.add("Horizontal");
    container.appendChild(icon);
    container.appendChild(sliderBar);
  } else {
    // Top spacer to match icon height for symmetrical alignment
    const topSpacer = document.createElement("div");
    topSpacer.className = "VolumeIconSpacer";
    container.appendChild(topSpacer);
    container.appendChild(sliderBar);
    container.appendChild(icon);
  }

  let isDragging = false;
  let prevUserSelect = "";

  const updateFromVolume = () => {
    if (isDragging) return;
    const vol = Spicetify.Player.getVolume();
    sliderBar.style.setProperty("--SliderProgress", vol.toString());
    icon.innerHTML = getVolumeIcon(vol);
  };

  updateFromVolume();

  const getPercentageFromEvent = (event: MouseEvent | TouchEvent): number => {
    let clientX: number;
    let clientY: number;
    if ("touches" in event) {
      const touch = event.touches[0] ?? event.changedTouches?.[0];
      if (!touch) return 0;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    const rect = sliderBar.getBoundingClientRect();
    if (horizontal) {
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }
    return Math.max(0, Math.min(1, (rect.bottom - clientY) / rect.height));
  };

  const handleDragStart = (event: MouseEvent | TouchEvent) => {
    isDragging = true;
    prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("touchmove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
    document.addEventListener("touchend", handleDragEnd);
    handleDragMove(event);
  };

  const handleDragMove = (event: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const percentage = getPercentageFromEvent(event);
    sliderBar.style.setProperty("--SliderProgress", percentage.toString());
    icon.innerHTML = getVolumeIcon(percentage);
    Spicetify.Player.setVolume(percentage);
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = prevUserSelect;
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("touchmove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
    document.removeEventListener("touchend", handleDragEnd);
    const percentage = getPercentageFromEvent(event);
    Spicetify.Player.setVolume(percentage);
  };

  sliderBar.addEventListener("mousedown", handleDragStart);
  sliderBar.addEventListener("touchstart", handleDragStart);

  const pollInterval = setInterval(updateFromVolume, 250);

  cleanupFn = () => {
    clearInterval(pollInterval);
    sliderBar.removeEventListener("mousedown", handleDragStart);
    sliderBar.removeEventListener("touchstart", handleDragStart);
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("touchmove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
    document.removeEventListener("touchend", handleDragEnd);
    container.innerHTML = "";
    container.classList.remove("Horizontal");
    container.classList.remove("RightSide");
  };
}

export function CleanUpVolumeSlider() {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
}
