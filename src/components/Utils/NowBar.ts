import { SongProgressBar } from './../../utils/Lyrics/SongProgressBar';
import storage from "../../utils/storage";
import Whentil from "@spikerko/tools/Whentil";
import Global from "../Global/Global";
import { SpotifyPlayer } from "../Global/SpotifyPlayer";
import PageView from "../Pages/PageView";
import { Icons } from "../Styling/Icons";
import Fullscreen, { CleanupMediaBox } from "./Fullscreen";
import { QueueForceScroll, ResetLastLine } from '../../utils/Scrolling/ScrollToActiveLine';
import { Maid } from '@socali/modules/Maid';
import { Interval } from '@socali/modules/Scheduler';
import BlobURLMaker from "../../utils/BlobURLMaker";
import { GetCurrentLyricsContainerInstance } from '../../utils/Lyrics/Applyer/CreateLyricsContainer';

// Define interfaces for our control instances
interface PlaybackControlsInstance {
    Apply: () => void;
    CleanUp: () => void;
    GetElement: () => HTMLElement;
}

interface SongProgressBarInstance {
    Apply: () => void;
    CleanUp: () => void;
    GetElement: () => HTMLElement;
}

let ActivePlaybackControlsInstance: PlaybackControlsInstance | null = null;
const ActiveSongProgressBarInstance_Map = new Map<string, any>();
let ActiveSetupSongProgressBarInstance: SongProgressBarInstance | null = null;

let ActiveHeartMaid: Maid | null = null;

export const NowBarObj = {
    Open: false
}

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


let NowBarFullscreenMaid: Maid | null = null;

function OpenNowBar(skipSaving: boolean = false) {
    const NowBar = document.querySelector("#SpicyLyricsPage .ContentBox .NowBar");
    if (!NowBar) return;
    UpdateNowBar(true);
    NowBar.classList.add("Active");

    const spicyLyricsPage = document.querySelector("#SpicyLyricsPage");
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
        const MediaBox = document.querySelector(
            "#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaContent"
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
                const svgElement = HeartElement.querySelector('svg');
                if (svgElement) {
                    svgElement.style.pointerEvents = 'none';
                    // Also set pointer-events: none for all child paths
                    const paths = svgElement.querySelectorAll('path');
                    paths.forEach(path => {
                        path.style.pointerEvents = 'none';
                    });
                }

                const onclick = async () => {
                    SpotifyPlayer.ToggleLike();
                    setTimeout(() => {
                        const IsLiked = SpotifyPlayer.IsLiked();
                        if (IsLiked) {
                            HeartElement.classList.add("Filled");
                        } else {
                            HeartElement.classList.remove("Filled");
                        }
                    }, 85)
                };

                HeartElement.addEventListener("click", onclick);
                ActiveHeartMaid.Give(() => {
                    HeartElement.removeEventListener("click", onclick);
                });

                let lastStatus: boolean | null = null;
                ActiveHeartMaid.Give(Interval(0.05, () => {
                    const IsLiked = SpotifyPlayer.IsLiked();
                    if (IsLiked === lastStatus) return;
                    lastStatus = IsLiked;
                    if (IsLiked) {
                        HeartElement.classList.add("Filled");
                    } else {
                        HeartElement.classList.remove("Filled");
                    }
                }))

                AppendQueue.push(HeartElement);
            }

            const SetupPlaybackControls = () => {
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
                        ${
                            SpotifyPlayer.LoopType === "track"
                                ? Icons.LoopTrack
                                : Icons.Loop
                        }
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

                // Store event handlers so they can be removed later
                const eventHandlers = {
                    pressHandlers: new Map(),
                    releaseHandlers: new Map(),
                    clickHandlers: new Map(),
                };

                // Find all playback controls
                const playbackControls =
                    ControlsElement.querySelectorAll(".PlaybackControl");

                // Add event listeners to each control with named functions
                playbackControls.forEach((control) => {
                    // Create handlers for this specific control
                    const pressHandler = () => {
                        control.classList.add("Pressed");
                    };

                    const releaseHandler = () => {
                        control.classList.remove("Pressed");
                    };

                    // Store handlers in the Map with the control as the key
                    eventHandlers.pressHandlers.set(control, pressHandler);
                    eventHandlers.releaseHandlers.set(control, releaseHandler);

                    // Add event listeners
                    control.addEventListener("mousedown", pressHandler);
                    control.addEventListener("touchstart", pressHandler);

                    control.addEventListener("mouseup", releaseHandler);
                    control.addEventListener("mouseleave", releaseHandler);
                    control.addEventListener("touchend", releaseHandler);
                });

                const PlayPauseControl =
                    ControlsElement.querySelector(".PlayStateToggle");
                const PrevTrackControl = ControlsElement.querySelector(".PrevTrack");
                const NextTrackControl = ControlsElement.querySelector(".NextTrack");
                const ShuffleControl = ControlsElement.querySelector(".ShuffleToggle");
                const LoopControl = ControlsElement.querySelector(".LoopToggle");

                // Create named handlers for click events
                const playPauseHandler = () => {
                    SpotifyPlayer.TogglePlayState();
                };

                const prevTrackHandler = () => {
                    SpotifyPlayer.Skip.Prev();
                };

                const nextTrackHandler = () => {
                    SpotifyPlayer.Skip.Next();
                };

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
                }

                const loopHandler = () => {
                    if (!LoopControl) return;

                    if (SpotifyPlayer.LoopType === "none") {
                        LoopControl.classList.add("Enabled");
                    } else {
                        LoopControl.classList.remove("Enabled");
                    }

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
                }

                // Store click handlers
                eventHandlers.clickHandlers.set(PlayPauseControl, playPauseHandler);
                eventHandlers.clickHandlers.set(PrevTrackControl, prevTrackHandler);
                eventHandlers.clickHandlers.set(NextTrackControl, nextTrackHandler);
                eventHandlers.clickHandlers.set(ShuffleControl, shuffleHandler);
                eventHandlers.clickHandlers.set(LoopControl, loopHandler);

                // Add click event listeners
                if (PlayPauseControl) {
                    PlayPauseControl.addEventListener("click", playPauseHandler);
                }
                if (PrevTrackControl) {
                    PrevTrackControl.addEventListener("click", prevTrackHandler);
                }
                if (NextTrackControl) {
                    NextTrackControl.addEventListener("click", nextTrackHandler);
                }
                if (ShuffleControl) {
                    ShuffleControl.addEventListener("click", shuffleHandler);
                }
                if (LoopControl) {
                    LoopControl.addEventListener("click", loopHandler);
                }

                // Create and return a cleanup function
                const cleanup = () => {
                    // Remove press/release handlers
                    playbackControls.forEach((control) => {
                        const pressHandler = eventHandlers.pressHandlers.get(control);
                        const releaseHandler = eventHandlers.releaseHandlers.get(control);

                        control.removeEventListener("mousedown", pressHandler);
                        control.removeEventListener("touchstart", pressHandler);

                        control.removeEventListener("mouseup", releaseHandler);
                        control.removeEventListener("mouseleave", releaseHandler);
                        control.removeEventListener("touchend", releaseHandler);
                    });

                    // Remove click handlers
                    if (PlayPauseControl) {
                        PlayPauseControl.removeEventListener(
                            "click",
                            eventHandlers.clickHandlers.get(PlayPauseControl)
                        );
                    }
                    if (PrevTrackControl) {
                        PrevTrackControl.removeEventListener(
                            "click",
                            eventHandlers.clickHandlers.get(PrevTrackControl)
                        );
                    }
                    if (NextTrackControl) {
                        NextTrackControl.removeEventListener(
                            "click",
                            eventHandlers.clickHandlers.get(NextTrackControl)
                        );
                    }
                    if (ShuffleControl) {
                        ShuffleControl.removeEventListener(
                            "click",
                            eventHandlers.clickHandlers.get(ShuffleControl)
                        );
                    }
                    if (LoopControl) {
                        LoopControl.removeEventListener(
                            "click",
                            eventHandlers.clickHandlers.get(LoopControl)
                        );
                    }

                    // Clear the maps
                    eventHandlers.pressHandlers.clear();
                    eventHandlers.releaseHandlers.clear();
                    eventHandlers.clickHandlers.clear();

                    // Remove the controls element from DOM if it exists
                    if (ControlsElement.parentNode) {
                        ControlsElement.parentNode.removeChild(ControlsElement);
                    }
                };

                return {
                    Apply: () => {
                        AppendQueue.push(ControlsElement);
                    },
                    CleanUp: cleanup,
                    GetElement: () => ControlsElement,
                };
            };

            const SetupSongProgressBar = () => {
                const songProgressBar = new SongProgressBar();
                ActiveSongProgressBarInstance_Map.set("SongProgressBar_ClassInstance", songProgressBar);

                // Update initial values
                songProgressBar.Update({
                    duration: SpotifyPlayer.GetPosition() ?? 0,
                    position: SpotifyPlayer.GetDuration() ?? 0
                });

                const TimelineElem = document.createElement("div");
                ActiveSongProgressBarInstance_Map.set("TimeLineElement", TimelineElem);
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

                const updateTimelineState = (e = null) => {
                    const PositionElem = TimelineElem.querySelector<HTMLElement>(".Time.Position");
                    const DurationElem = TimelineElem.querySelector<HTMLElement>(".Time.Duration");

                    if (!PositionElem || !DurationElem || !SliderBar) {
                        console.error("Missing required elements for timeline update");
                        return;
                    }

                    // Update the progress bar state
                    songProgressBar.Update({
                        duration: SpotifyPlayer.GetDuration() ?? 0,
                        position: e ?? (SpotifyPlayer.GetPosition() ?? 0)
                    });

                    const sliderPercentage = songProgressBar.GetProgressPercentage();
                    const formattedPosition = songProgressBar.GetFormattedPosition();
                    const formattedDuration = songProgressBar.GetFormattedDuration();

                    SliderBar.style.setProperty("--SliderProgress", sliderPercentage.toString());
                    DurationElem.textContent = formattedDuration;
                    PositionElem.textContent = formattedPosition;

                    /* // console.log("Slider Percentage:", sliderPercentage);
                    // console.log("Formatted Position:", formattedPosition);
                    // console.log("Formatted Duration:", formattedDuration);

                    // console.log("Position:", SpotifyPlayer.GetTrackPosition());
                    // console.log("Duration:", SpotifyPlayer.GetTrackDuration()); */
                };

                const sliderBarHandler = (event: MouseEvent) => {
                    // Direct use of the SliderBar element for click calculation
                    const positionMs = songProgressBar.CalculatePositionFromClick({
                        sliderBar: SliderBar,
                        event: event
                    });

                    // Use the calculated position (in milliseconds)
                    if (typeof SpotifyPlayer !== 'undefined' && SpotifyPlayer.Seek) {
                        SpotifyPlayer.Seek(positionMs);
                    }
                };

                // Add drag functionality
                let isDragging = false;

                const handleDragStart = (event: MouseEvent | TouchEvent) => {
                    isDragging = true;
                    document.body.style.userSelect = 'none'; // Prevent text selection during drag

                    // Add the event listeners for drag movement and end
                    document.addEventListener('mousemove', handleDragMove);
                    document.addEventListener('touchmove', handleDragMove);
                    document.addEventListener('mouseup', handleDragEnd);
                    document.addEventListener('touchend', handleDragEnd);

                    // Emit event that dragging has started
                    Global.Event.evoke("nowbar:timeline:dragging", { isDragging: true });

                    // Handle the initial position update
                    handleDragMove(event);
                };

                const handleDragMove = (event: MouseEvent | TouchEvent) => {
                    if (!isDragging) return;

                    // Get the mouse/touch position
                    let clientX: number;
                    if ('touches' in event) {
                        clientX = event.touches[0].clientX;
                    } else {
                        clientX = event.clientX;
                    }

                    const rect = SliderBar.getBoundingClientRect();
                    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

                    // Update the slider visually during drag
                    SliderBar.style.setProperty("--SliderProgress", percentage.toString());

                    // Calculate position in milliseconds
                    const positionMs = Math.floor(percentage * (SpotifyPlayer.GetDuration() ?? 0));

                    // Update the position text during drag
                    songProgressBar.Update({
                        duration: SpotifyPlayer.GetDuration() ?? 0,
                        position: positionMs
                    });

                    // Emit event with current drag position
                    Global.Event.evoke("nowbar:timeline:dragging", {
                        isDragging: true,
                        percentage: percentage,
                        positionMs: positionMs
                    });

                    const PositionElem = TimelineElem.querySelector<HTMLElement>(".Time.Position");
                    if (PositionElem) {
                        PositionElem.textContent = songProgressBar.GetFormattedPosition();
                    }
                };

                const handleDragEnd = (event: MouseEvent | TouchEvent) => {
                    if (!isDragging) return;
                    isDragging = false;
                    document.body.style.userSelect = ''; // Restore text selection

                    // Remove the event listeners
                    document.removeEventListener('mousemove', handleDragMove);
                    document.removeEventListener('touchmove', handleDragMove);
                    document.removeEventListener('mouseup', handleDragEnd);
                    document.removeEventListener('touchend', handleDragEnd);

                    // Get the final position
                    let clientX: number;
                    if ('changedTouches' in event) {
                        clientX = event.changedTouches[0].clientX;
                    } else {
                        clientX = (event as MouseEvent).clientX;
                    }

                    const rect = SliderBar.getBoundingClientRect();
                    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

                    // Calculate the position in milliseconds
                    const positionMs = Math.floor(percentage * (SpotifyPlayer.GetDuration() ?? 0));

                    // Emit event that dragging has ended with final position
                    Global.Event.evoke("nowbar:timeline:dragging", {
                        isDragging: false,
                        percentage: percentage,
                        positionMs: positionMs,
                        finalPosition: true
                    });

                    // Seek to the new position
                    if (typeof SpotifyPlayer !== 'undefined' && SpotifyPlayer.Seek) {
                        SpotifyPlayer.Seek(positionMs);
                    }
                };

                // Add event listeners for drag
                SliderBar.addEventListener('mousedown', handleDragStart);
                SliderBar.addEventListener('touchstart', handleDragStart);

                // Keep the click handler for simple clicks
                SliderBar.addEventListener('click', sliderBarHandler);

                // Run initial update
                updateTimelineState();
                ActiveSongProgressBarInstance_Map.set("updateTimelineState_Function", updateTimelineState);

                const cleanup = () => {
                    // Remove event listeners
                    if (SliderBar) {
                        SliderBar.removeEventListener('click', sliderBarHandler);
                        SliderBar.removeEventListener('mousedown', handleDragStart);
                        SliderBar.removeEventListener('touchstart', handleDragStart);

                        // Also remove any potentially active document listeners
                        document.removeEventListener('mousemove', handleDragMove);
                        document.removeEventListener('touchmove', handleDragMove);
                        document.removeEventListener('mouseup', handleDragEnd);
                        document.removeEventListener('touchend', handleDragEnd);
                    }

                    // Clean up the progress bar instance
                    const progressBar = ActiveSongProgressBarInstance_Map.get("SongProgressBar_ClassInstance");
                    if (progressBar) {
                        progressBar.Destroy();
                    }

                    // Remove the timeline element from DOM if it's attached
                    if (TimelineElem.parentNode) {
                        TimelineElem.parentNode.removeChild(TimelineElem);
                    }

                    // Clear the map
                    ActiveSongProgressBarInstance_Map.clear();
                };

                return {
                    Apply: () => {
                        AppendQueue.push(TimelineElem)
                    },
                    GetElement: () => TimelineElem,
                    CleanUp: cleanup
                };
            };

            ActivePlaybackControlsInstance = SetupPlaybackControls();
            if (ActivePlaybackControlsInstance) {
                ActivePlaybackControlsInstance.Apply();
            }

            ActiveSetupSongProgressBarInstance = SetupSongProgressBar();
            if (ActiveSetupSongProgressBarInstance) {
                ActiveSetupSongProgressBarInstance.Apply();
            }

            // Use a more reliable approach to add elements
            Whentil.When(
                () =>
                    document.querySelector(
                        "#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaContent .ViewControls"
                    ),
                () => {
                    const MediaBox = document.querySelector(
                        "#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaContent"
                    );
                    if (!MediaBox) return;

                    // Ensure there's no duplicate elements before appending
                    const viewControls = MediaBox.querySelector(".ViewControls");

                    // Create a temporary fragment to avoid multiple reflows
                    const fragment = document.createDocumentFragment();
                    AppendQueue.forEach((element) => {
                        fragment.appendChild(element);
                    });

                    // Ensure proper order - first view controls, then our custom elements
                    MediaBox.innerHTML = '';
                    if (viewControls) MediaBox.appendChild(viewControls);
                    MediaBox.appendChild(fragment);

                    /* AppendQueue.forEach((element) => {
                        if (element.classList.contains("marqueeify")) {
                            const childMarquee = element.querySelector("span");
                            if (!childMarquee) return;

                            // Use text measurement instead of element width
                            const textWidth = measureTextWidth(childMarquee.textContent || "");

                            // Only apply marquee if text width is greater than 200px
                            if (textWidth > 200) {
                                const marquee = ApplyMarquee(
                                    element.getAttribute("marquee-base-width") ?? "100%",
                                    `${textWidth}px`,
                                    "albumName"
                                );
                                childMarquee.style.animation = `${marquee.getComputedName()} 25s linear infinite`;
                            } else {
                                // Center the text if it doesn't need marquee
                                childMarquee.style.textAlign = "center";
                                childMarquee.style.width = "100%";
                            }
                        }
                    }); */
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
    const MediaBox = document.querySelector(
        "#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaContent"
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
    const NowBar = document.querySelector("#SpicyLyricsPage .ContentBox .NowBar");
    if (!NowBar) return;
    NowBar.classList.remove("Active");
    storage.set("IsNowBarOpen", "false");
    CleanUpActiveComponents();

    const spicyLyricsPage = document.querySelector("#SpicyLyricsPage");
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


function UpdateNowBar(force = false) {
    const NowBar = document.querySelector("#SpicyLyricsPage .ContentBox .NowBar");
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
        MediaImage.style.backgroundImage = "";
        MediaImage.classList.add("Skeletoned");
        const finalUrl = `https://i.scdn.co/image/${coverArt.replace("spotify:image:", "")}`;
        BlobURLMaker(finalUrl)
        .catch(() => null)
        .then(coverArtUrl => {
            MediaImage.classList.remove("Skeletoned")
            MediaImage.style.backgroundImage = `url("${coverArtUrl ?? coverArt}")`;
            MediaImage.setAttribute("last-image", coverArt ?? "");
        })
    }

    const songName = SpotifyPlayer.GetName();
    if (SongNameSpan) {
        SongNameSpan.textContent = songName ?? "";

        /* // Check width and apply/remove MarqueeContainer class
        const songNameContainer = SongNameSpan.parentElement as HTMLElement;
        if (songNameContainer) {
            const containerWidth = songNameContainer.offsetWidth;
            const thresholdWidth = containerWidth * 0.85;
            if ((SongNameSpan as HTMLElement).offsetWidth > thresholdWidth) {
                SongNameSpan.classList.add("MarqueeContainer");
            } else {
                SongNameSpan.classList.remove("MarqueeContainer");
            }
        } */
    }

    const artists = SpotifyPlayer.GetArtists();
    if (artists && ArtistsSpan) {
        const processedArtists = artists.map(artist => artist.name)?.join(", ");
        ArtistsSpan.textContent = processedArtists ?? "";

        /* // Check width and apply/remove MarqueeContainer class
        const artistsSpanContainer = ArtistsSpan.parentElement as HTMLElement;
        if (artistsSpanContainer) {
            const containerWidth = artistsSpanContainer.offsetWidth;
            const thresholdWidth = containerWidth * 0.80; // 80% of container width
            if ((ArtistsSpan as HTMLElement).offsetWidth > thresholdWidth) {
                ArtistsSpan.classList.add("MarqueeContainer");
            } else {
                ArtistsSpan.classList.remove("MarqueeContainer");
            }
        } */
    }
}

function NowBar_SwapSides() {
    const NowBar = document.querySelector("#SpicyLyricsPage .ContentBox .NowBar");
    if (!NowBar) return;

    const spicyLyricsPage = document.querySelector("#SpicyLyricsPage");
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
}

function Session_NowBar_SetSide() {
    const NowBar = document.querySelector("#SpicyLyricsPage .ContentBox .NowBar");
    if (!NowBar) return;

    const spicyLyricsPage = document.querySelector("#SpicyLyricsPage");
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
}

function DeregisterNowBarBtn() {
    /* const nowBarButton = document.querySelector(
        "#SpicyLyricsPage .ContentBox .ViewControls #NowBarToggle"
    );
    nowBarButton?.remove(); */
    PageView.AppendViewControls(true);
}

Global.Event.listen("playback:playpause", (e: { data: { isPaused: boolean } }) => {
    // console.log("PlayPause", e);
    if (Fullscreen.IsOpen) {
        // console.log("Fullscreen Opened");
        if (ActivePlaybackControlsInstance) {
            // console.log("ActivePlaybackControlsInstance - Exists");
            const PlaybackControls = ActivePlaybackControlsInstance.GetElement();
            const PlayPauseButton = PlaybackControls.querySelector(".PlayStateToggle");
            if (!PlayPauseButton) return;

            if (e.data.isPaused) {
                // console.log("Paused");
                PlayPauseButton.classList.remove("Playing");
                PlayPauseButton.classList.add("Paused");
                const SVG = PlayPauseButton.querySelector("svg");
                if (SVG) {
                    SVG.innerHTML = Icons.Play;
                }
            } else {
                // console.log("Playing");
                PlayPauseButton.classList.remove("Paused");
                PlayPauseButton.classList.add("Playing");
                const SVG = PlayPauseButton.querySelector("svg");
                if (SVG) {
                    SVG.innerHTML = Icons.Pause;
                }
            }
        }
    }
});

Global.Event.listen("playback:loop", (e: string) => {
    // console.log("Loop", e);
    if (Fullscreen.IsOpen) {
        // console.log("Fullscreen Opened");
        if (ActivePlaybackControlsInstance) {
            // console.log("ActivePlaybackControlsInstance - Exists");
            const PlaybackControls = ActivePlaybackControlsInstance.GetElement();
            const LoopButton = PlaybackControls.querySelector(".LoopToggle");
            if (!LoopButton) return;

            const SVG = LoopButton.querySelector("svg");
            if (!SVG) return;

            // First reset any inline styles
            SVG.style.filter = "";

            // Update loop icon
            if (e === "track") {
                SVG.innerHTML = Icons.LoopTrack;
            } else {
                SVG.innerHTML = Icons.Loop;
            }

            // Toggle class for brightness
            if (e !== "none") {
                LoopButton.classList.add("Enabled");
                // Apply drop-shadow directly via style
                SVG.style.filter = "drop-shadow(0 0 5px white)";
            } else {
                LoopButton.classList.remove("Enabled");
            }
        }
    }
});

Global.Event.listen("playback:shuffle", (e: string) => {
    // console.log("Shuffle", e);
    if (Fullscreen.IsOpen) {
        // console.log("Fullscreen Opened");
        if (ActivePlaybackControlsInstance) {
            // console.log("ActivePlaybackControlsInstance - Exists");
            const PlaybackControls = ActivePlaybackControlsInstance.GetElement();
            const ShuffleButton = PlaybackControls.querySelector(".ShuffleToggle");
            if (!ShuffleButton) return;

            const SVG = ShuffleButton.querySelector("svg");
            if (!SVG) return;

            // First reset any inline styles
            SVG.style.filter = "";

            // Toggle class for brightness
            if (e !== "none") {
                ShuffleButton.classList.add("Enabled");
                // Apply drop-shadow directly via style
                SVG.style.filter = "drop-shadow(0 0 5px white)";
            } else {
                ShuffleButton.classList.remove("Enabled");
            }
        }
    }
});

Global.Event.listen("playback:position", (e: number) => {
    if (Fullscreen.IsOpen) {
        if (ActiveSetupSongProgressBarInstance) {
            const updateTimelineState = ActiveSongProgressBarInstance_Map.get("updateTimelineState_Function");
            updateTimelineState(e);
            // console.log("Timeline Updated!");
        }
    }
})

Global.Event.listen("fullscreen:exit", () => {
    CleanUpActiveComponents();
    CleanupMediaBox();
})

Global.Event.listen("page:destroy", () => {
    CleanupMediaBox();
    CleanUpActiveComponents();
});

Global.Event.listen("nowbar:timeline:dragging", () => {
    ResetLastLine();
    QueueForceScroll();
})

export {
    OpenNowBar,
    CloseNowBar,
    ToggleNowBar,
    UpdateNowBar,
    Session_OpenNowBar,
    NowBar_SwapSides,
    Session_NowBar_SetSide,
    DeregisterNowBarBtn,
    CleanUpActiveComponents as CleanUpNowBarComponents
};
