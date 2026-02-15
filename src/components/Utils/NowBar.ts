import { Maid } from "@socali/modules/Maid";
import { Interval } from "@socali/modules/Scheduler";
import { Spicetify } from "@spicetify/bundler";
import Whentil from "@spikerko/tools/Whentil";
import BlobURLMaker from "../../utils/BlobURLMaker.ts";
import { GetCurrentLyricsContainerInstance } from "../../utils/Lyrics/Applyer/CreateLyricsContainer.ts";
import { SongProgressBar } from "./../../utils/Lyrics/SongProgressBar.ts";
import { QueueForceScroll, ResetLastLine } from "../../utils/Scrolling/ScrollToActiveLine.ts";
import storage from "../../utils/storage.ts";
import Defaults from "../Global/Defaults.ts";
import Global from "../Global/Global.ts";
import { SpotifyPlayer } from "../Global/SpotifyPlayer.ts";
import PageView, { PageContainer } from "../Pages/PageView.ts";
import { Icons } from "../Styling/Icons.ts";
import Fullscreen, { CleanupMediaBox } from "./Fullscreen.ts";
import { isSpicySidebarMode } from "./SidebarLyrics.ts";
import { IsPIP } from "./PopupLyrics.ts";
import { SetupVolumeSlider, CleanUpVolumeSlider } from "./VolumeSlider.ts";

// Define interfaces for our control instances
interface PlaybackControlsInstance {
  Apply: (targetContainer?: HTMLElement) => void;
  CleanUp: () => void;
  GetElement: () => HTMLElement;
}

interface SongProgressBarInstance {
  Apply: (targetContainer?: HTMLElement) => void;
  CleanUp: () => void;
  GetElement: () => HTMLElement;
}

let ActivePlaybackControlsInstance: PlaybackControlsInstance | null = null;
const ActiveSongProgressBarInstance_Map = new Map<string, any>();
let ActiveSetupSongProgressBarInstance: SongProgressBarInstance | null = null;

let ActiveHeartMaid: Maid | null = null;

// let ActiveArtworkHlsInstance: Hls | null = null;

/* export function DestroyArtworkHlsInstance() {
    ActiveArtworkHlsInstance?.destroy();
    ActiveArtworkHlsInstance = null;
} */

export const NowBarObj = {
  Open: false,
  _inlineSetupTimer: null as ReturnType<typeof setTimeout> | null,
};

export function HideSpotifyPlaybackBar() {
  document.body.classList.add('SpicyLyrics__PlaybackBarHidden');
}

export function RestoreSpotifyPlaybackBar() {
  document.body.classList.remove('SpicyLyrics__PlaybackBarHidden');
}

// Inline controls instances (separate from the overlay controls)
let InlinePlaybackControlsInstance: PlaybackControlsInstance | null = null;
let InlineSongProgressBarInstance: SongProgressBarInstance | null = null;
let InlineSongProgressBarInstance_Map = new Map<string, any>();

/* const ActiveMarquees = new Map();

/**
 * Accurately measures the width of text content
 * @param text The text to measure
 * @param font Optional font specification
 * @returns Width of the text in pixels
 *
function measureTextWidth(text: string, font?: string): number {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 0;

    // Use computed font from the document or specified font
    if (!font) {
        font = window.getComputedStyle(document.body).font;
    }

    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

function ApplyMarquee(baseWidth, elementWidth, name) {
    const style = document.createElement("style");
    style.innerHTML = `
        @keyframes marquee_${name} {
             0%, 10% {
                transform: translateX(0);
            }
            45%, 55% {
                transform: translateX(calc(-${baseWidth} - calc(${elementWidth} + calc(${baseWidth} / 1.5))));
            }
            90%, 100% {
                transform: translateX(0);
            }
        }
    `;
    style.id = `spicy-lyrics-marquee_${name}`;
    document.head.appendChild(style);
    ActiveMarquees.set(name, style);
    return {
        cleanup: () => {
            style.remove();
            ActiveMarquees.delete(name);
        },
        getElement: () => style,
        getName: () => name,
        getComputedName: () => `marquee_${name}`,
    };
} */

// Module-level setup functions (extracted for reuse by both overlay and inline controls)

function SetupPlaybackControls(): PlaybackControlsInstance {
  const ControlsElement = document.createElement("div");
  ControlsElement.classList.add("PlaybackControls");
  ControlsElement.innerHTML = `
    <div class="PlaybackControl ShuffleToggle">
        ${Icons.Shuffle}
    </div>
    ${Icons.PrevTrack}
    <div class="PlaybackControl PlayStateToggle ${
      SpotifyPlayer.IsPlaying ? "Playing" : "Paused"
    }">
        ${SpotifyPlayer.IsPlaying ? Icons.Pause : Icons.Play}
    </div>
    ${Icons.NextTrack}
    <div class="PlaybackControl LoopToggle">
        ${SpotifyPlayer.LoopType === "track" ? Icons.LoopTrack : Icons.Loop}
    </div>
  `;

  if (SpotifyPlayer.LoopType !== "none") {
    const loopToggle = ControlsElement.querySelector(".LoopToggle");
    if (loopToggle) {
      loopToggle.classList.add("Enabled");
      const loopSvg = ControlsElement.querySelector<HTMLElement>(".LoopToggle svg");
      if (loopSvg) {
        loopSvg.style.filter = "drop-shadow(0 0 5px white)";
      }
    }
  }

  if (SpotifyPlayer.ShuffleType !== "none") {
    const shuffleToggle = ControlsElement.querySelector(".ShuffleToggle");
    if (shuffleToggle) {
      shuffleToggle.classList.add("Enabled");
      const shuffleSvg = ControlsElement.querySelector<HTMLElement>(".ShuffleToggle svg");
      if (shuffleSvg) {
        shuffleSvg.style.filter = "drop-shadow(0 0 5px white)";
      }
    }
  }

  const eventHandlers = {
    pressHandlers: new Map(),
    releaseHandlers: new Map(),
    clickHandlers: new Map(),
  };

  const playbackControls = ControlsElement.querySelectorAll(".PlaybackControl");

  playbackControls.forEach((control) => {
    const pressHandler = () => {
      control.classList.add("Pressed");
    };
    const releaseHandler = () => {
      control.classList.remove("Pressed");
    };

    eventHandlers.pressHandlers.set(control, pressHandler);
    eventHandlers.releaseHandlers.set(control, releaseHandler);

    control.addEventListener("mousedown", pressHandler);
    control.addEventListener("touchstart", pressHandler);
    control.addEventListener("mouseup", releaseHandler);
    control.addEventListener("mouseleave", releaseHandler);
    control.addEventListener("touchend", releaseHandler);
  });

  const PlayPauseControl = ControlsElement.querySelector(".PlayStateToggle");
  const PrevTrackControl = ControlsElement.querySelector(".PrevTrack");
  const NextTrackControl = ControlsElement.querySelector(".NextTrack");
  const ShuffleControl = ControlsElement.querySelector(".ShuffleToggle");
  const LoopControl = ControlsElement.querySelector(".LoopToggle");

  const playPauseHandler = () => { SpotifyPlayer.TogglePlayState(); };
  const prevTrackHandler = () => { SpotifyPlayer.Skip.Prev(); };
  const nextTrackHandler = () => { SpotifyPlayer.Skip.Next(); };

  const shuffleHandler = () => {
    if (!ShuffleControl) return;
    if (SpotifyPlayer.ShuffleType === "none") {
      SpotifyPlayer.ShuffleType = "normal";
      ShuffleControl.classList.add("Enabled");
      Spicetify.Player.setShuffle(true);
    } else if (SpotifyPlayer.ShuffleType === "normal") {
      SpotifyPlayer.ShuffleType = "none";
      ShuffleControl.classList.remove("Enabled");
      Spicetify.Player.setShuffle(false);
    }
  };

  const loopHandler = () => {
    if (!LoopControl) return;
    if (SpotifyPlayer.LoopType === "none") {
      SpotifyPlayer.LoopType = "context";
      Spicetify.Player.setRepeat(1);
    } else if (SpotifyPlayer.LoopType === "context") {
      SpotifyPlayer.LoopType = "track";
      Spicetify.Player.setRepeat(2);
    } else if (SpotifyPlayer.LoopType === "track") {
      SpotifyPlayer.LoopType = "none";
      Spicetify.Player.setRepeat(0);
    }
  };

  eventHandlers.clickHandlers.set(PlayPauseControl, playPauseHandler);
  eventHandlers.clickHandlers.set(PrevTrackControl, prevTrackHandler);
  eventHandlers.clickHandlers.set(NextTrackControl, nextTrackHandler);
  eventHandlers.clickHandlers.set(ShuffleControl, shuffleHandler);
  eventHandlers.clickHandlers.set(LoopControl, loopHandler);

  if (PlayPauseControl) PlayPauseControl.addEventListener("click", playPauseHandler);
  if (PrevTrackControl) PrevTrackControl.addEventListener("click", prevTrackHandler);
  if (NextTrackControl) NextTrackControl.addEventListener("click", nextTrackHandler);
  if (ShuffleControl) ShuffleControl.addEventListener("click", shuffleHandler);
  if (LoopControl) LoopControl.addEventListener("click", loopHandler);

  const cleanup = () => {
    playbackControls.forEach((control) => {
      const pressHandler = eventHandlers.pressHandlers.get(control);
      const releaseHandler = eventHandlers.releaseHandlers.get(control);
      control.removeEventListener("mousedown", pressHandler);
      control.removeEventListener("touchstart", pressHandler);
      control.removeEventListener("mouseup", releaseHandler);
      control.removeEventListener("mouseleave", releaseHandler);
      control.removeEventListener("touchend", releaseHandler);
    });
    if (PlayPauseControl) PlayPauseControl.removeEventListener("click", eventHandlers.clickHandlers.get(PlayPauseControl));
    if (PrevTrackControl) PrevTrackControl.removeEventListener("click", eventHandlers.clickHandlers.get(PrevTrackControl));
    if (NextTrackControl) NextTrackControl.removeEventListener("click", eventHandlers.clickHandlers.get(NextTrackControl));
    if (ShuffleControl) ShuffleControl.removeEventListener("click", eventHandlers.clickHandlers.get(ShuffleControl));
    if (LoopControl) LoopControl.removeEventListener("click", eventHandlers.clickHandlers.get(LoopControl));
    eventHandlers.pressHandlers.clear();
    eventHandlers.releaseHandlers.clear();
    eventHandlers.clickHandlers.clear();
    if (ControlsElement.parentNode) {
      ControlsElement.parentNode.removeChild(ControlsElement);
    }
  };

  return {
    Apply: (targetContainer?: HTMLElement) => {
      if (targetContainer) {
        targetContainer.appendChild(ControlsElement);
      }
    },
    CleanUp: cleanup,
    GetElement: () => ControlsElement,
  };
}

function SetupSongProgressBar(instanceMap: Map<string, any>): SongProgressBarInstance | null {
  const songProgressBar = new SongProgressBar();
  instanceMap.set("SongProgressBar_ClassInstance", songProgressBar);

  songProgressBar.Update({
    duration: SpotifyPlayer.GetDuration() ?? 0,
    position: SpotifyPlayer.GetPosition() ?? 0,
  });

  const TimelineElem = document.createElement("div");
  instanceMap.set("TimeLineElement", TimelineElem);
  TimelineElem.classList.add("Timeline");
  TimelineElem.innerHTML = `
    <span class="Time Position">${songProgressBar.GetFormattedPosition() ?? "0:00"}</span>
    <div class="SliderBar" style="--SliderProgress: ${songProgressBar.GetProgressPercentage() ?? 0}">
        <div class="Handle"></div>
    </div>
    <span class="Time Duration">${songProgressBar.GetFormattedDuration() ?? "0:00"}</span>
  `;

  const SliderBar = TimelineElem.querySelector<HTMLElement>(".SliderBar");
  if (!SliderBar) {
    console.error("Could not find SliderBar element");
    return null;
  }

  let isDragging = false;
  let dragPositionMs: number | null = null;

  const updateTimelineState = (e = null) => {
    const PositionElem = TimelineElem.querySelector<HTMLElement>(".Time.Position");
    const DurationElem = TimelineElem.querySelector<HTMLElement>(".Time.Duration");

    if (!PositionElem || !DurationElem || !SliderBar) {
      console.error("Missing required elements for timeline update");
      return;
    }

    let positionToShow: number;
    if (isDragging && dragPositionMs !== null) {
      positionToShow = dragPositionMs;
    } else {
      positionToShow = e ?? SpotifyPlayer.GetPosition() ?? 0;
    }

    songProgressBar.Update({
      duration: SpotifyPlayer.GetDuration() ?? 0,
      position: positionToShow,
    });

    const sliderPercentage = songProgressBar.GetProgressPercentage();
    const formattedPosition = songProgressBar.GetFormattedPosition();
    const formattedDuration = songProgressBar.GetFormattedDuration();

    if (!isDragging) {
      SliderBar.style.setProperty("--SliderProgress", sliderPercentage.toString());
    }
    DurationElem.textContent = formattedDuration;
    PositionElem.textContent = formattedPosition;
  };

  const handleDragStart = (event: MouseEvent | TouchEvent) => {
    isDragging = true;
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("touchmove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
    document.addEventListener("touchend", handleDragEnd);
    Global.Event.evoke("nowbar:timeline:dragging", { isDragging: true });
    handleDragMove(event);
  };

  const handleDragMove = (event: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    let clientX: number;
    if ("touches" in event) {
      const touch = event.touches[0] ?? event.changedTouches?.[0];
      if (!touch) return;
      clientX = touch.clientX;
    } else {
      clientX = event.clientX;
    }
    const rect = SliderBar.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    SliderBar.style.setProperty("--SliderProgress", percentage.toString());
    const positionMs = Math.floor(percentage * (SpotifyPlayer.GetDuration() ?? 0));
    dragPositionMs = positionMs;
    songProgressBar.Update({
      duration: SpotifyPlayer.GetDuration() ?? 0,
      position: positionMs,
    });
    Global.Event.evoke("nowbar:timeline:dragging", {
      isDragging: true,
      percentage: percentage,
      positionMs: positionMs,
    });
    const PositionElem = TimelineElem.querySelector<HTMLElement>(".Time.Position");
    if (PositionElem) {
      PositionElem.textContent = songProgressBar.GetFormattedPosition();
    }
  };

  const handleDragEnd = (event: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("touchmove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
    document.removeEventListener("touchend", handleDragEnd);
    let clientX: number;
    if ("changedTouches" in event) {
      const touch = event.changedTouches?.[0] ?? event.touches?.[0];
      if (!touch) return;
      clientX = touch.clientX;
    } else {
      clientX = (event as MouseEvent).clientX;
    }
    const rect = SliderBar.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const positionMs = Math.floor(percentage * (SpotifyPlayer.GetDuration() ?? 0));
    dragPositionMs = null;
    Global.Event.evoke("nowbar:timeline:dragging", {
      isDragging: false,
      percentage: percentage,
      positionMs: positionMs,
      finalPosition: true,
    });
    if (typeof SpotifyPlayer !== "undefined" && SpotifyPlayer.Seek) {
      SpotifyPlayer.Seek(positionMs);
    }
    updateTimelineState();
  };

  SliderBar.addEventListener("mousedown", handleDragStart);
  SliderBar.addEventListener("touchstart", handleDragStart);

  updateTimelineState();
  instanceMap.set("updateTimelineState_Function", updateTimelineState);

  const cleanup = () => {
    if (SliderBar) {
      SliderBar.removeEventListener("mousedown", handleDragStart);
      SliderBar.removeEventListener("touchstart", handleDragStart);
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("touchmove", handleDragMove);
      document.removeEventListener("mouseup", handleDragEnd);
      document.removeEventListener("touchend", handleDragEnd);
    }
    const progressBar = instanceMap.get("SongProgressBar_ClassInstance");
    if (progressBar) {
      progressBar.Destroy();
    }
    if (TimelineElem.parentNode) {
      TimelineElem.parentNode.removeChild(TimelineElem);
    }
    instanceMap.clear();
  };

  return {
    Apply: (targetContainer?: HTMLElement) => {
      if (targetContainer) {
        targetContainer.appendChild(TimelineElem);
      }
    },
    GetElement: () => TimelineElem,
    CleanUp: cleanup,
  };
}

// Inline controls setup/cleanup

function SetupInlineControls() {
  const timelineContainer = PageContainer?.querySelector<HTMLElement>(
    ".ContentBox .NowBar .Header .InlineTimeline"
  );
  const controlsContainer = PageContainer?.querySelector<HTMLElement>(
    ".ContentBox .NowBar .Header .InlinePlaybackControls"
  );

  CleanUpInlineControls();

  const setting = Defaults.AlwaysShowInFullscreen;
  const inFullscreen = Fullscreen.IsOpen;

  const showTimeline = (!inFullscreen && !isSpicySidebarMode && Defaults.ReplaceSpotifyPlaybar) ||
    (inFullscreen && (setting === "Time" || setting === "Both"));
  const showControls = inFullscreen && (setting === "Controls" || setting === "Both");

  const volumeSetting = Defaults.ShowVolumeSliderFullscreen;
  const showVolumeLeft = inFullscreen && volumeSetting === "Left Side";
  const showVolumeRight = inFullscreen && volumeSetting === "Right Side";
  const showVolumeBelow = inFullscreen && volumeSetting === "Below";

  if (!showTimeline && !showControls && !showVolumeLeft && !showVolumeRight && !showVolumeBelow) return;

  // Timeline between cover art and song title
  if (showTimeline && timelineContainer) {
    InlineSongProgressBarInstance = SetupSongProgressBar(InlineSongProgressBarInstance_Map);
    InlineSongProgressBarInstance?.Apply(timelineContainer);
  }

  // Playback controls below song title/artists (only in cinema/fullscreen when setting is enabled)
  if (showControls && controlsContainer) {
    InlinePlaybackControlsInstance = SetupPlaybackControls();
    InlinePlaybackControlsInstance?.Apply(controlsContainer);
  }

  // Volume slider - Left/Right Side: vertical beside cover art
  if (showVolumeLeft || showVolumeRight) {
    const volumeContainer = PageContainer?.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .VolumeSlider"
    );
    if (volumeContainer) {
      if (showVolumeRight) volumeContainer.classList.add("RightSide");
      SetupVolumeSlider(volumeContainer);
    }
  }

  // Volume slider - Below: horizontal below playback controls
  if (showVolumeBelow) {
    const volumeUnderContainer = PageContainer?.querySelector<HTMLElement>(
      ".ContentBox .NowBar .Header .VolumeSliderUnder"
    );
    if (volumeUnderContainer) {
      SetupVolumeSlider(volumeUnderContainer, true);
    }
  }
}

function CleanUpInlineControls() {
  if (InlinePlaybackControlsInstance) {
    InlinePlaybackControlsInstance.CleanUp();
    InlinePlaybackControlsInstance = null;
  }
  if (InlineSongProgressBarInstance) {
    InlineSongProgressBarInstance.CleanUp();
    InlineSongProgressBarInstance = null;
  }
  InlineSongProgressBarInstance_Map = new Map<string, any>();
  CleanUpVolumeSlider();
}

let NowBarFullscreenMaid: Maid | null = null;

function OpenNowBar(skipSaving: boolean = false) {
  const NowBar = PageContainer?.querySelector(".ContentBox .NowBar");
  if (!NowBar) return;
  const spicyLyricsPage = PageContainer;
  if (isSpicySidebarMode) {
    spicyLyricsPage?.classList.add("NowBarStatus__Closed");
    spicyLyricsPage?.classList.remove("NowBarStatus__Open");
    return;
  }
  if (Defaults.ReplaceSpotifyPlaybar) {
    HideSpotifyPlaybackBar();
  }
  UpdateNowBar(true);
  NowBar.classList.add("Active");

  if (spicyLyricsPage) {
    spicyLyricsPage.classList.remove("NowBarStatus__Closed");
    spicyLyricsPage.classList.add("NowBarStatus__Open");
  }

  if (!skipSaving) storage.set("IsNowBarOpen", "true");

  setTimeout(() => {
    // console.log("Resizing Lyrics Container");
    GetCurrentLyricsContainerInstance()?.Resize();
    // console.log("Forcing Scroll");
    QueueForceScroll();
  }, 10);

  if (Fullscreen.IsOpen) {
    const MediaBox = PageContainer.querySelector(
      ".ContentBox .NowBar .Header .MediaBox .MediaContent"
    );

    if (!MediaBox) return;

    const existingPlaybackControls = MediaBox.querySelector(".PlaybackControls");
    if (existingPlaybackControls) {
      MediaBox.removeChild(existingPlaybackControls);
    }

    // Let's Apply more data into the fullscreen mode.
    {
      const AppendQueue: HTMLElement[] = [];
      if (NowBarFullscreenMaid && !NowBarFullscreenMaid?.IsDestroyed()) {
        NowBarFullscreenMaid.Destroy();
      }
      NowBarFullscreenMaid = new Maid();
      {
        /* const AlbumNameElement = document.createElement("div");
                AlbumNameElement.classList.add("AlbumData");
                AlbumNameElement.innerHTML = `<span>${SpotifyPlayer.GetAlbumName()}</span>`;
                AppendQueue.push(AlbumNameElement); */
        const HeartElement = document.createElement("div");
        HeartElement.classList.add("Heart");
        HeartElement.innerHTML = Icons.Heart;
        ActiveHeartMaid = NowBarFullscreenMaid.Give(new Maid());

        // Make SVG elements non-interactive to prevent them from capturing clicks
        const svgElement = HeartElement.querySelector("svg");
        if (svgElement) {
          svgElement.style.pointerEvents = "none";
          // Also set pointer-events: none for all child paths
          const paths = svgElement.querySelectorAll("path");
          paths.forEach((path) => {
            path.style.pointerEvents = "none";
          });
        }

        const onclick = () => {
          if (SpotifyPlayer.GetContentType() === "episode") return;

          const IsLiked = SpotifyPlayer.IsLiked();
          if (IsLiked) {
            HeartElement.classList.remove("Filled");
            HeartElement.classList.remove("press02");
            HeartElement.classList.add("reverse_press02");
            setTimeout(() => {
              HeartElement.classList.remove("reverse_press02");
            }, 160);
          } else {
            HeartElement.classList.add("Filled");
            HeartElement.classList.remove("reverse_press02");
            HeartElement.classList.add("press02");
            setTimeout(() => {
              HeartElement.classList.remove("press02");
            }, 100);
          }

          SpotifyPlayer.ToggleLike();
        };

        HeartElement.addEventListener("click", onclick);
        ActiveHeartMaid.Give(() => {
          HeartElement.removeEventListener("click", onclick);
        });

        let lastStatus: boolean | null = null;
        ActiveHeartMaid.Give(
          Interval(0.05, () => {
            const IsLiked = SpotifyPlayer.IsLiked();
            if (IsLiked === lastStatus) return;
            lastStatus = IsLiked;
            if (IsLiked) {
              HeartElement.classList.add("Filled");
            } else {
              HeartElement.classList.remove("Filled");
            }
          })
        );

        AppendQueue.push(HeartElement);
      }

      // Only create overlay components when they're not handled by inline controls
      const _setting = Defaults.AlwaysShowInFullscreen;
      const _skipOverlayControls = _setting === "Controls" || _setting === "Both";
      const _skipOverlayTimeline = _setting === "Time" || _setting === "Both";

      if (!_skipOverlayControls) {
        ActivePlaybackControlsInstance = SetupPlaybackControls();
      }
      if (!_skipOverlayTimeline) {
        ActiveSetupSongProgressBarInstance = SetupSongProgressBar(ActiveSongProgressBarInstance_Map);
      }

      // Use a more reliable approach to add elements
      Whentil.When(
        () =>
          PageContainer.querySelector(
            ".ContentBox .NowBar .Header .MediaBox .MediaContent .ViewControls"
          ),
        () => {
          const MediaBoxContent = PageContainer.querySelector(
            ".ContentBox .NowBar .Header .MediaBox .MediaContent"
          );
          if (!MediaBoxContent) return;

          // Ensure there's no duplicate elements before appending
          const viewControls = MediaBoxContent.querySelector(".ViewControls");

          // Create a temporary fragment to avoid multiple reflows
          const fragment = document.createDocumentFragment();
          AppendQueue.forEach((element) => {
            fragment.appendChild(element);
          });

          // Add overlay components that aren't handled by inline controls
          if (ActivePlaybackControlsInstance) {
            fragment.appendChild(ActivePlaybackControlsInstance.GetElement());
          }
          if (ActiveSetupSongProgressBarInstance) {
            fragment.appendChild(ActiveSetupSongProgressBarInstance.GetElement());
          }

          // Ensure proper order - first view controls, then our custom elements
          MediaBoxContent.innerHTML = "";
          if (viewControls) MediaBoxContent.appendChild(viewControls);
          MediaBoxContent.appendChild(fragment);
        }
      );
    }
  }

  /* const DragBox = Fullscreen.IsOpen
        ? document.querySelector(
              "#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaContent"
          )
        : document.querySelector(
              "#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaImage"
          ); */

  /* {
        const dropZones = document.querySelectorAll(
            "#SpicyLyricsPage .ContentBox .DropZone"
        );

        DragBox.addEventListener("dragstart", (e) => {
            const missingLyrics = storage.get("currentLyricsData")?.toString() === `NO_LYRICS:${SpotifyPlayer.GetSongId()}`;
            if (missingLyrics) return;

            // Don't prevent default - allow the drag to start
            document.querySelector("#SpicyLyricsPage").classList.add("SomethingDragging");
            if (NowBar.classList.contains("LeftSide")) {
                dropZones.forEach((zone) => {
                    if (zone.classList.contains("LeftSide")) {
                        zone.classList.add("Hidden");
                    } else {
                        zone.classList.remove("Hidden");
                    }
                });
            } else if (NowBar.classList.contains("RightSide")) {
                dropZones.forEach((zone) => {
                    if (zone.classList.contains("RightSide")) {
                        zone.classList.add("Hidden");
                    } else {
                        zone.classList.remove("Hidden");
                    }
                });
            }
            DragBox.classList.add("Dragging");
        });

        DragBox.addEventListener("dragend", () => {
            const missingLyrics = storage.get("currentLyricsData")?.toString() === `NO_LYRICS:${SpotifyPlayer.GetSongId()}`;
            if (missingLyrics) return;
            document.querySelector("#SpicyLyricsPage").classList.remove("SomethingDragging");
            dropZones.forEach((zone) => zone.classList.remove("Hidden"));
            DragBox.classList.remove("Dragging");
        });

        dropZones.forEach((zone) => {
            zone.addEventListener("dragover", (e) => {
                e.preventDefault();
                const missingLyrics = storage.get("currentLyricsData")?.toString() === `NO_LYRICS:${SpotifyPlayer.GetSongId()}`;
                if (missingLyrics) return;
                zone.classList.add("DraggingOver");
            });

            zone.addEventListener("dragleave", () => {
                const missingLyrics = storage.get("currentLyricsData")?.toString() === `NO_LYRICS:${SpotifyPlayer.GetSongId()}`;
                if (missingLyrics) return;
                zone.classList.remove("DraggingOver");
            });

            zone.addEventListener("drop", (e) => {
                e.preventDefault();
                const missingLyrics = storage.get("currentLyricsData")?.toString() === `NO_LYRICS:${SpotifyPlayer.GetSongId()}`;
                if (missingLyrics) return;
                zone.classList.remove("DraggingOver");

                const currentClass = NowBar.classList.contains("LeftSide")
                    ? "LeftSide"
                    : "RightSide";

                const newClass = zone.classList.contains("RightSide")
                    ? "RightSide"
                    : "LeftSide";

                NowBar.classList.remove(currentClass);
                NowBar.classList.add(newClass);

                document.querySelector("#SpicyLyricsPage").classList.remove("NowBarSide__Left");
                document.querySelector("#SpicyLyricsPage").classList.remove("NowBarSide__Right");
                document.querySelector("#SpicyLyricsPage").classList.add(`NowBarSide__${newClass.replace("Side", "")}`);

                const side = zone.classList.contains("RightSide") ? "right" : "left";

                storage.set("NowBarSide", side);
                ResetLastLine();
            });
        });
    } */
  NowBarObj.Open = true;
  PageView.AppendViewControls(true);
  SetupInlineControls();
}

function CleanUpActiveComponents() {
  if (NowBarFullscreenMaid && !NowBarFullscreenMaid?.IsDestroyed()) {
    NowBarFullscreenMaid.Destroy();
  }

  // // console.log("Started CleanUpActiveComponents Process");
  if (ActivePlaybackControlsInstance) {
    ActivePlaybackControlsInstance?.CleanUp();
    ActivePlaybackControlsInstance = null;
    // // console.log("Cleaned up PlaybackControls instance");
  }

  if (ActiveSetupSongProgressBarInstance) {
    ActiveSetupSongProgressBarInstance?.CleanUp();
    ActiveSetupSongProgressBarInstance = null;
    // // console.log("Cleaned up SongProgressBar instance");
  }

  if (ActiveSongProgressBarInstance_Map.size > 0) {
    ActiveSongProgressBarInstance_Map?.clear();
    // // console.log("Cleared SongProgressBar instance map");
  }

  // Also remove any leftover elements
  const MediaBox = PageContainer.querySelector(
    ".ContentBox .NowBar .Header .MediaBox .MediaContent"
  );

  if (MediaBox) {
    const heart = MediaBox.querySelector(".Heart");
    if (heart) MediaBox.removeChild(heart);

    const playbackControls = MediaBox.querySelector(".PlaybackControls");
    if (playbackControls) MediaBox.removeChild(playbackControls);

    const songProgressBar = MediaBox.querySelector(".SongProgressBar");
    if (songProgressBar) MediaBox.removeChild(songProgressBar);

    // // console.log("Cleared elements from DOM");
  }

  // // console.log("Finished CleanUpActiveComponents Process");
}

function CloseNowBar() {
  NowBarObj.Open = false;
  const NowBar = PageContainer.querySelector(".ContentBox .NowBar");
  if (!NowBar) return;
  NowBar.classList.remove("Active");
  storage.set("IsNowBarOpen", "false");
  RestoreSpotifyPlaybackBar();
  CleanUpActiveComponents();
  CleanUpInlineControls();

  const spicyLyricsPage = PageContainer;
  if (spicyLyricsPage) {
    spicyLyricsPage.classList.remove("NowBarStatus__Open");
    spicyLyricsPage.classList.add("NowBarStatus__Closed");
  }

  setTimeout(() => {
    // console.log("Resizing Lyrics Container");
    GetCurrentLyricsContainerInstance()?.Resize();
    // console.log("Forcing Scroll");
    QueueForceScroll();
  }, 10);

  PageView.AppendViewControls(true);
}

function ToggleNowBar() {
  const IsNowBarOpen = storage.get("IsNowBarOpen");
  if (IsNowBarOpen === "true") {
    CloseNowBar();
  } else {
    OpenNowBar();
  }
}

function Session_OpenNowBar() {
  const IsNowBarOpen = storage.get("IsNowBarOpen");
  if (IsNowBarOpen === "true") {
    OpenNowBar();
  } else {
    CloseNowBar();
  }
}

/* function isSafeAVC(codecStr: string) {
  return /avc1\.(42[0-9A-F]{2}|4D[0-9A-F]{2})/i.test(codecStr);
}

async function getAVCStreamUrl(manifestUrl: string) {
  const res = await fetch(manifestUrl);
  const text = await res.text();

  const baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);

  const avcRegex = /#EXT-X-STREAM-INF:.*CODECS="([^"]+)".*\n(.*)/g;
  let match;
  const variants = [];

  while ((match = avcRegex.exec(text)) !== null) {
    const codecStr = match[1];
    const streamPath = match[2].trim();
    
    if (codecStr.includes('avc1.42') || codecStr.includes('avc1.4D') || codecStr.includes('avc1.640')) {
        if (isSafeAVC(codecStr)) {
            variants.push({
              codec: codecStr,
              url: streamPath.startsWith('http') ? streamPath : baseUrl + streamPath
            });
        }          
    }
  }

  if (variants.length === 0) {
    throw new Error("No compatible AVC (H.264) stream found.");
  }

  // Pick the first or best variant
  return variants[0].url;
} */

/* function UpdateNowBar(force = false) {
    const NowBar = document.querySelector("#SpicyLyricsPage .ContentBox .NowBar");
    if (!NowBar) return;

    //const ArtistsDiv = NowBar.querySelector(".Header .Metadata .Artists");
    const ArtistsSpan = NowBar.querySelector(".Header .Metadata .Artists span");
    const MediaImageContainer = NowBar.querySelector<HTMLDivElement>(".Header .MediaBox .MediaImage");
    const SongNameSpan = NowBar.querySelector(".Header .Metadata .SongName span");
    //const MediaBox = NowBar.querySelector(".Header .MediaBox");
    //const SongName = NowBar.querySelector(".Header .Metadata .SongName");

    const IsNowBarOpen = storage.get("IsNowBarOpen");
    if (IsNowBarOpen === "false" && !force) return;

    const coverArt = SpotifyPlayer.GetCover("xlarge");
    if (MediaImageContainer && coverArt) {
        if (ActiveArtworkHlsInstance == null) {
            ActiveArtworkHlsInstance = new Hls({ debug: true });
        }
        //MediaImageContainer.classList.add("Skeletoned");
        const Image = MediaImageContainer.querySelector<HTMLImageElement>("img");
        const Video = MediaImageContainer.querySelector<HTMLVideoElement>("video");
        if (!Image || !Video) return;
        Image.classList.remove("Active");
        Video.classList.remove("Active");

        Image.src = coverArt;
        Image.classList.add("Active");
        
        GetEditorialArtwork(SpotifyPlayer.GetId() ?? "")
            .then(async (data) => {
                console.log(data)
                if (!data || !data.Content) return;
                const content = data.Content;
                if (!content.square || !content.square.video) return;

                const preVideoSrc = content.square.video;
                const videoSrc = await getAVCStreamUrl(preVideoSrc);
                console.log("Final Video source", videoSrc)
                /* if (src) {
                    Iframe.src = `${Defaults.lyrics.api.url}/hls-player/html?m3u8_url=${src}`
                    Image.classList.remove("Active");
                    Iframe.classList.add("Active");
                }
 *
                if (Hls.isSupported() && ActiveArtworkHlsInstance != null) {
                    if (Video.getAttribute("data-hls-attached") !== "true") {
                        ActiveArtworkHlsInstance.loadSource(videoSrc);
                        ActiveArtworkHlsInstance.attachMedia(Video);
                        Video.setAttribute("data-hls-attached", "true");
                    } else {
                        ActiveArtworkHlsInstance.stopLoad();
                        ActiveArtworkHlsInstance.loadSource(videoSrc);
                        ActiveArtworkHlsInstance.startLoad();
                    }
                    Image.classList.remove("Active");
                    Video.classList.add("Active");
                    Video.muted = true;
                    Video.play();
                    console.log(Video.getAttribute("data-hls-attached"), ActiveArtworkHlsInstance)
                }

            }).catch(err => {
                console.error("Error while getting EditorialArtwork", err);
            })
    }

    const songName = SpotifyPlayer.GetName();
    if (SongNameSpan) {
        SongNameSpan.textContent = songName ?? "";
    }

    const artists = SpotifyPlayer.GetArtists();
    if (artists && ArtistsSpan) {
        const processedArtists = artists.map(artist => artist.name)?.join(", ");
        ArtistsSpan.textContent = processedArtists ?? "";
    }
} */

function UpdateNowBar(force = false) {
  const NowBar = PageContainer?.querySelector(".ContentBox .NowBar");
  if (!NowBar) return;

  //const ArtistsDiv = NowBar.querySelector(".Header .Metadata .Artists");
  const ArtistsSpan = NowBar.querySelector(".Header .Metadata .Artists span");
  const MediaImage = NowBar.querySelector<HTMLDivElement>(".Header .MediaBox .MediaImage");
  const SongNameSpan = NowBar.querySelector(".Header .Metadata .SongName span");
  //const MediaBox = NowBar.querySelector(".Header .MediaBox");
  //const SongName = NowBar.querySelector(".Header .Metadata .SongName");

  const IsNowBarOpen = storage.get("IsNowBarOpen");
  if (IsNowBarOpen === "false" && !force) return;

  const coverArt = SpotifyPlayer.GetCover("xlarge");
  if (MediaImage && coverArt && MediaImage.getAttribute("last-image") !== coverArt) {
    const finalUrl = `https://i.scdn.co/image/${coverArt.replace("spotify:image:", "")}`;
    BlobURLMaker(finalUrl)
      .catch(() => null)
      .then((coverArtUrl) => {
        // Only after the new image is fetched, swap it in
        MediaImage.style.backgroundImage = `url("${coverArtUrl ?? coverArt}")`;
        MediaImage.setAttribute("last-image", coverArt ?? "");
      });
  }

  const songName = SpotifyPlayer.GetName();
  if (SongNameSpan) {
    SongNameSpan.textContent = songName ?? "";
  }

  const contentType = SpotifyPlayer.GetContentType();

  if (contentType === "episode") {
    const showName = SpotifyPlayer.GetShowName();
    if (ArtistsSpan) ArtistsSpan.textContent = showName ?? "";
  }

  const artists = SpotifyPlayer.GetArtists();
  if (artists && ArtistsSpan && contentType !== "episode") {
    const processedArtists = artists.map((artist) => artist.name)?.join(", ");
    ArtistsSpan.textContent = processedArtists ?? "";
  }
}

Global.Event.listen("playback:songchange", () => {
  setTimeout(() => {
    UpdateNowBar(IsPIP);
    setTimeout(() => {
      UpdateNowBar(IsPIP);
      setTimeout(() => {
        UpdateNowBar(IsPIP);
        setTimeout(() => {
          UpdateNowBar(IsPIP);
        }, 1000);
      }, 1000);
    }, 1000);
  }, 2000);
});

function NowBar_SwapSides() {
  const NowBar = PageContainer.querySelector(".ContentBox .NowBar");
  if (!NowBar) return;

  const spicyLyricsPage = PageContainer;
  if (!spicyLyricsPage) return;

  const CurrentSide = storage.get("NowBarSide");
  if (CurrentSide === "left") {
    storage.set("NowBarSide", "right");
    NowBar.classList.remove("LeftSide");
    NowBar.classList.add("RightSide");
    spicyLyricsPage.classList.remove("NowBarSide__Left");
    spicyLyricsPage.classList.add("NowBarSide__Right");
  } else if (CurrentSide === "right") {
    storage.set("NowBarSide", "left");
    NowBar.classList.remove("RightSide");
    NowBar.classList.add("LeftSide");
    spicyLyricsPage.classList.remove("NowBarSide__Right");
    spicyLyricsPage.classList.add("NowBarSide__Left");
  } else {
    storage.set("NowBarSide", "right");
    NowBar.classList.remove("LeftSide");
    NowBar.classList.add("RightSide");
    spicyLyricsPage.classList.remove("NowBarSide__Left");
    spicyLyricsPage.classList.add("NowBarSide__Right");
  }

  setTimeout(() => {
    // console.log("Resizing Lyrics Container");
    GetCurrentLyricsContainerInstance()?.Resize();
    // console.log("Forcing Scroll");
    QueueForceScroll();
  }, 10);
}

function Session_NowBar_SetSide() {
  const NowBar = PageContainer.querySelector(".ContentBox .NowBar");
  if (!NowBar) return;

  const spicyLyricsPage = PageContainer;
  if (!spicyLyricsPage) return;

  const CurrentSide = storage.get("NowBarSide");
  if (CurrentSide === "left") {
    storage.set("NowBarSide", "left");
    NowBar.classList.remove("RightSide");
    NowBar.classList.add("LeftSide");
    spicyLyricsPage.classList.remove("NowBarSide__Right");
    spicyLyricsPage.classList.add("NowBarSide__Left");
  } else if (CurrentSide === "right") {
    storage.set("NowBarSide", "right");
    NowBar.classList.remove("LeftSide");
    NowBar.classList.add("RightSide");
    spicyLyricsPage.classList.remove("NowBarSide__Left");
    spicyLyricsPage.classList.add("NowBarSide__Right");
  } else {
    storage.set("NowBarSide", "left");
    NowBar.classList.remove("RightSide");
    NowBar.classList.add("LeftSide");
    spicyLyricsPage.classList.remove("NowBarSide__Right");
    spicyLyricsPage.classList.add("NowBarSide__Left");
  }
  setTimeout(() => {
    // console.log("Resizing Lyrics Container");
    GetCurrentLyricsContainerInstance()?.Resize();
    // console.log("Forcing Scroll");
    QueueForceScroll();
  }, 10);
}

function DeregisterNowBarBtn() {
  /* const nowBarButton = document.querySelector(
        "#SpicyLyricsPage .ContentBox .ViewControls #NowBarToggle"
    );
    nowBarButton?.remove(); */
  PageView.AppendViewControls(true);
}

function replaceSvgElement(container: Element, svgString: string) {
  const oldSvg = container.querySelector("svg");
  if (!oldSvg) return;
  const template = document.createElement("template");
  template.innerHTML = svgString.trim();
  const newSvg = template.content.firstElementChild;
  if (newSvg && oldSvg.parentElement) {
    oldSvg.parentElement.replaceChild(newSvg, oldSvg);
  }
}

// Helper to update play/pause state on a playback controls instance
function updatePlayPauseOnInstance(instance: PlaybackControlsInstance | null, isPaused: boolean) {
  if (!instance) return;
  const PlaybackControls = instance.GetElement();
  const PlayPauseButton = PlaybackControls.querySelector(".PlayStateToggle");
  if (!PlayPauseButton) return;

  if (isPaused) {
    PlayPauseButton.classList.remove("Playing");
    PlayPauseButton.classList.add("Paused");
    replaceSvgElement(PlayPauseButton, Icons.Play);
  } else {
    PlayPauseButton.classList.remove("Paused");
    PlayPauseButton.classList.add("Playing");
    replaceSvgElement(PlayPauseButton, Icons.Pause);
  }
}

// Helper to update loop state on a playback controls instance
function updateLoopOnInstance(instance: PlaybackControlsInstance | null, loopType: string) {
  if (!instance) return;
  const PlaybackControls = instance.GetElement();
  const LoopButton = PlaybackControls.querySelector(".LoopToggle");
  if (!LoopButton) return;

  replaceSvgElement(LoopButton, loopType === "track" ? Icons.LoopTrack : Icons.Loop);
  const newSvg = LoopButton.querySelector<HTMLElement>("svg");
  if (loopType !== "none") {
    LoopButton.classList.add("Enabled");
    if (newSvg) newSvg.style.filter = "drop-shadow(0 0 5px white)";
  } else {
    LoopButton.classList.remove("Enabled");
    if (newSvg) newSvg.style.filter = "";
  }
}

// Helper to update shuffle state on a playback controls instance
function updateShuffleOnInstance(instance: PlaybackControlsInstance | null, shuffleType: string) {
  if (!instance) return;
  const PlaybackControls = instance.GetElement();
  const ShuffleButton = PlaybackControls.querySelector(".ShuffleToggle");
  if (!ShuffleButton) return;

  const SVG = ShuffleButton.querySelector("svg");
  if (!SVG) return;

  SVG.style.filter = "";
  if (shuffleType !== "none") {
    ShuffleButton.classList.add("Enabled");
    SVG.style.filter = "drop-shadow(0 0 5px white)";
  } else {
    ShuffleButton.classList.remove("Enabled");
  }
}

Global.Event.listen("playback:playpause", (e: { data: { isPaused: boolean } }) => {
  if (Fullscreen.IsOpen) {
    updatePlayPauseOnInstance(ActivePlaybackControlsInstance, e.data.isPaused);
  }
  updatePlayPauseOnInstance(InlinePlaybackControlsInstance, e.data.isPaused);
});

Global.Event.listen("playback:loop", (e: string) => {
  if (Fullscreen.IsOpen) {
    updateLoopOnInstance(ActivePlaybackControlsInstance, e);
  }
  updateLoopOnInstance(InlinePlaybackControlsInstance, e);
});

Global.Event.listen("playback:shuffle", (e: string) => {
  if (Fullscreen.IsOpen) {
    updateShuffleOnInstance(ActivePlaybackControlsInstance, e);
  }
  updateShuffleOnInstance(InlinePlaybackControlsInstance, e);
});

Global.Event.listen("playback:position", (e: number) => {
  if (Fullscreen.IsOpen) {
    if (ActiveSetupSongProgressBarInstance) {
      const updateTimelineState = ActiveSongProgressBarInstance_Map.get(
        "updateTimelineState_Function"
      );
      if (updateTimelineState) updateTimelineState(e);
    }
  }
  // Also update inline timeline
  if (InlineSongProgressBarInstance) {
    const updateTimelineState = InlineSongProgressBarInstance_Map.get(
      "updateTimelineState_Function"
    );
    if (updateTimelineState) updateTimelineState(e);
  }
});

Global.Event.listen("fullscreen:exit", () => {
  CleanUpActiveComponents();
  CleanupMediaBox();
  // Re-setup inline controls for regular view (timeline only)
  CleanUpInlineControls();
  if (NowBarObj._inlineSetupTimer) {
    clearTimeout(NowBarObj._inlineSetupTimer);
  }
  NowBarObj._inlineSetupTimer = setTimeout(() => {
    NowBarObj._inlineSetupTimer = null;
    if (PageView.IsOpened && NowBarObj.Open && !Fullscreen.IsOpen) {
      SetupInlineControls();
    }
  }, 100);
});

Global.Event.listen("page:destroy", () => {
  if (NowBarObj._inlineSetupTimer) {
    clearTimeout(NowBarObj._inlineSetupTimer);
    NowBarObj._inlineSetupTimer = null;
  }
  CleanupMediaBox();
  CleanUpActiveComponents();
  CleanUpInlineControls();
});

Global.Event.listen("nowbar:timeline:dragging", () => {
  ResetLastLine();
  QueueForceScroll();
});

export {
  OpenNowBar,
  CloseNowBar,
  ToggleNowBar,
  UpdateNowBar,
  Session_OpenNowBar,
  NowBar_SwapSides,
  Session_NowBar_SetSide,
  DeregisterNowBarBtn,
  CleanUpActiveComponents as CleanUpNowBarComponents,
};
