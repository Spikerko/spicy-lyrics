import Animator from "../../utils/Animator";
import { ResetLastLine } from "../../utils/Scrolling/ScrollToActiveLine";
import storage from "../../utils/storage";
import Defaults from "../Global/Defaults";
import Global from "../Global/Global";
import PageView, { PageRoot, Tooltips } from "../Pages/PageView";
import { CloseNowBar, DeregisterNowBarBtn, OpenNowBar } from "./NowBar";
import TransferElement from "./TransferElement";

const ArtworkBrightness = {
    Start: 0.72,
    End: 0.5,
    Duration: 0.3,
    ParentHover: {
        Start: 1,
        End: 0.72,
        Duration: 0.3
    }
};

const ArtworkBlur = {
    Start: 0.1,
    End: 0.2,
    Duration: 0.3,
    ParentHover: {
        Start: 0,
        End: 0.1,
        Duration: 0.3
    }
};

const ControlsOpacity = {
    Start: 0.55,
    End: 1,
    Duration: 0.3,
    ParentHover: {
        Start: 0,
        End: 0.55,
        Duration: 0.3
    }
};

const Fullscreen = {
    Open,
    Close,
    Toggle,
    IsOpen: false,
    CinemaViewOpen: false,
};

const MediaBox_Data = {
    Eventified: false,
    hoverTimeoutId: null,
    Functions: {
        MouseIn: () => {
            // Clear any existing timeout when entering MediaBox
            if (MediaBox_Data.hoverTimeoutId) {
                clearTimeout(MediaBox_Data.hoverTimeoutId);
                MediaBox_Data.hoverTimeoutId = null;
            }

            if (Defaults.PrefersReducedMotion) {
                MediaBox_Data.Functions.Target.style.setProperty("--ArtworkBrightness", `${ArtworkBrightness.End}`);
                MediaBox_Data.Functions.Target.style.setProperty("--ArtworkBlur", `${ArtworkBlur.End}px`);
                MediaBox_Data.Functions.Target.style.setProperty("--ControlsOpacity", `${ControlsOpacity.End}`);
                return;
            }
            
            if (MediaBox_Data.Animators.brightness.reversed) MediaBox_Data.Animators.brightness.Reverse();
            if (MediaBox_Data.Animators.blur.reversed) MediaBox_Data.Animators.blur.Reverse();
            if (MediaBox_Data.Animators.opacity.reversed) MediaBox_Data.Animators.opacity.Reverse();
            MediaBox_Data.Animators.brightness.Start();
            MediaBox_Data.Animators.blur.Start();
            MediaBox_Data.Animators.opacity.Start();
        },
        NowBarMouseIn: () => {
            // Clear any existing timeout when entering NowBar
            if (MediaBox_Data.hoverTimeoutId) {
                clearTimeout(MediaBox_Data.hoverTimeoutId);
                MediaBox_Data.hoverTimeoutId = null;
            }

            if (Defaults.PrefersReducedMotion) {
                MediaBox_Data.Functions.Target.style.setProperty("--ArtworkBrightness", `${ArtworkBrightness.ParentHover.End}`);
                MediaBox_Data.Functions.Target.style.setProperty("--ArtworkBlur", `${ArtworkBlur.ParentHover.End}px`);
                MediaBox_Data.Functions.Target.style.setProperty("--ControlsOpacity", `${ControlsOpacity.ParentHover.End}`);
                return;
            }
            
            // Use half-strength animators
            if (MediaBox_Data.Animators.brightnessHalf.reversed) MediaBox_Data.Animators.brightnessHalf.Reverse();
            if (MediaBox_Data.Animators.blurHalf.reversed) MediaBox_Data.Animators.blurHalf.Reverse();
            if (MediaBox_Data.Animators.opacityHalf.reversed) MediaBox_Data.Animators.opacityHalf.Reverse();
            MediaBox_Data.Animators.brightnessHalf.Start();
            MediaBox_Data.Animators.blurHalf.Start();
            MediaBox_Data.Animators.opacityHalf.Start();
        },
        MouseOut: (event?: MouseEvent) => {
            // Clear any existing timeout when leaving
            if (MediaBox_Data.hoverTimeoutId) {
                clearTimeout(MediaBox_Data.hoverTimeoutId);
                MediaBox_Data.hoverTimeoutId = null;
            }

            if (Defaults.PrefersReducedMotion) {
                MediaBox_Data.Functions.Target.style.setProperty("--ArtworkBrightness", `${ArtworkBrightness.Start}`);
                MediaBox_Data.Functions.Target.style.setProperty("--ArtworkBlur", `${ArtworkBlur.Start}px`);
                MediaBox_Data.Functions.Target.style.setProperty("--ControlsOpacity", `${ControlsOpacity.Start}`);
                return;
            }

            // Check if we're moving to the NowBar
            const NowBar = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .NowBar");
            if (event && NowBar && NowBar.contains(event.relatedTarget as Node)) {
                // Only reverse full-strength animators when moving to NowBar
                if (!MediaBox_Data.Animators.brightness.reversed) MediaBox_Data.Animators.brightness.Reverse();
                if (!MediaBox_Data.Animators.blur.reversed) MediaBox_Data.Animators.blur.Reverse();
                if (!MediaBox_Data.Animators.opacity.reversed) MediaBox_Data.Animators.opacity.Reverse();
                
                MediaBox_Data.Animators.brightness.Start();
                MediaBox_Data.Animators.blur.Start();
                MediaBox_Data.Animators.opacity.Start();
            } else {
                // If any half-strength animator is still not reversed, set timeout to reverse them
                if (!MediaBox_Data.Animators.brightnessHalf.reversed || 
                    !MediaBox_Data.Animators.blurHalf.reversed || 
                    !MediaBox_Data.Animators.opacityHalf.reversed) {
                    
                    MediaBox_Data.hoverTimeoutId = setTimeout(() => {
                        MediaBox_Data.Animators.brightnessHalf.Reverse();
                        MediaBox_Data.Animators.blurHalf.Reverse();
                        MediaBox_Data.Animators.opacityHalf.Reverse();
                        
                        MediaBox_Data.Animators.brightnessHalf.Start();
                        MediaBox_Data.Animators.blurHalf.Start();
                        MediaBox_Data.Animators.opacityHalf.Start();
                    }, 750);
                }

                // Reverse all animators when leaving completely
                if (!MediaBox_Data.Animators.brightness.reversed) MediaBox_Data.Animators.brightness.Reverse();
                if (!MediaBox_Data.Animators.blur.reversed) MediaBox_Data.Animators.blur.Reverse();
                if (!MediaBox_Data.Animators.opacity.reversed) MediaBox_Data.Animators.opacity.Reverse();
                
                MediaBox_Data.Animators.brightness.Start();
                MediaBox_Data.Animators.blur.Start();
                MediaBox_Data.Animators.opacity.Start();
            }
        },
        handleNowBarMove: (event: MouseEvent) => {
            const MediaBox = MediaBox_Data.Functions.Target;
            const NowBar = event.currentTarget as HTMLElement;
            
            // Don't handle moves if mouse is over MediaBox
            if (MediaBox && event.target && MediaBox.contains(event.target as Node)) {
                return;
            }

            // If animations are reversed, bring them back
            if (MediaBox_Data.Animators.brightnessHalf.reversed) {
                MediaBox_Data.Animators.brightnessHalf.Reverse();
                MediaBox_Data.Animators.blurHalf.Reverse();
                MediaBox_Data.Animators.opacityHalf.Reverse();
                
                MediaBox_Data.Animators.brightnessHalf.Start();
                MediaBox_Data.Animators.blurHalf.Start();
                MediaBox_Data.Animators.opacityHalf.Start();
            }

            // Clear existing timeout
            if (MediaBox_Data.hoverTimeoutId) {
                clearTimeout(MediaBox_Data.hoverTimeoutId);
            }

            // Set new timeout
            MediaBox_Data.hoverTimeoutId = setTimeout(() => {
                // Only reverse if we're still in NowBar state
                if (!MediaBox_Data.Animators.brightnessHalf.reversed) {
                    MediaBox_Data.Animators.brightnessHalf.Reverse();
                    MediaBox_Data.Animators.blurHalf.Reverse();
                    MediaBox_Data.Animators.opacityHalf.Reverse();
                    
                    MediaBox_Data.Animators.brightnessHalf.Start();
                    MediaBox_Data.Animators.blurHalf.Start();
                    MediaBox_Data.Animators.opacityHalf.Start();
                }
            }, 750);
        },
        Reset: (MediaBox: HTMLElement) => {
            MediaBox.style.removeProperty("--ArtworkBrightness");
            MediaBox.style.removeProperty("--ArtworkBlur");
            MediaBox.style.removeProperty("--ControlsOpacity");
        },
        Eventify: (MediaBox: HTMLElement) => {
            MediaBox_Data.Functions.Target = MediaBox;
            
            // Full strength animation events
            MediaBox_Data.Animators.brightness.on("progress", (progress) => {
                MediaBox.style.setProperty("--ArtworkBrightness", `${progress}`);
            });
            MediaBox_Data.Animators.blur.on("progress", (progress) => {
                MediaBox.style.setProperty("--ArtworkBlur", `${progress}px`);
            });
            MediaBox_Data.Animators.opacity.on("progress", (progress) => {
                MediaBox.style.setProperty("--ControlsOpacity", `${progress}`);
            });
            
            // Half strength animation events
            MediaBox_Data.Animators.brightnessHalf.on("progress", (progress) => {
                MediaBox.style.setProperty("--ArtworkBrightness", `${progress}`);
            });
            MediaBox_Data.Animators.blurHalf.on("progress", (progress) => {
                MediaBox.style.setProperty("--ArtworkBlur", `${progress}px`);
            });
            MediaBox_Data.Animators.opacityHalf.on("progress", (progress) => {
                MediaBox.style.setProperty("--ControlsOpacity", `${progress}`);
            });
            
            MediaBox_Data.Eventified = true;
        },
        Target: null,
    },
    Animators: {
        brightness: new Animator(ArtworkBrightness.Start, ArtworkBrightness.End, ArtworkBrightness.Duration),
        blur: new Animator(ArtworkBlur.Start, ArtworkBlur.End, ArtworkBlur.Duration),
        opacity: new Animator(ControlsOpacity.Start, ControlsOpacity.End, ControlsOpacity.Duration),
        brightnessHalf: new Animator(ArtworkBrightness.ParentHover.Start, ArtworkBrightness.ParentHover.End, ArtworkBrightness.ParentHover.Duration),
        blurHalf: new Animator(ArtworkBlur.ParentHover.Start, ArtworkBlur.ParentHover.End, ArtworkBlur.ParentHover.Duration),
        opacityHalf: new Animator(ControlsOpacity.ParentHover.Start, ControlsOpacity.ParentHover.End, ControlsOpacity.ParentHover.Duration)
    }
};

function Open(skipDocumentFullscreen: boolean = false) {
    const SpicyPage = document.querySelector<HTMLElement>(".Root__main-view #SpicyLyricsPage");
    const Root = document.body as HTMLElement;

    if (SpicyPage) {
        // Set state first
        Fullscreen.IsOpen = true;
        Fullscreen.CinemaViewOpen = skipDocumentFullscreen;

        // Handle DOM changes
        TransferElement(SpicyPage, Root);
        SpicyPage.classList.add("Fullscreen");

        Tooltips.NowBarToggle?.destroy();

        const NowBarToggle = document.querySelector<HTMLElement>("#SpicyLyricsPage .ViewControls #NowBarToggle");
        if (NowBarToggle) {
            NowBarToggle.remove();
        }

        OpenNowBar(true);

        // Handle fullscreen state
        const handleFullscreen = async () => {
            try {
                if (!skipDocumentFullscreen) {
                    if (!document.fullscreenElement) {
                        await Root.querySelector("#SpicyLyricsPage").requestFullscreen();
                    }
                } else if (document.fullscreenElement) {
                    await document.exitFullscreen();
                }
                
                // Update controls after fullscreen state is settled
                PageView.AppendViewControls(true);
            } catch (err) {
                console.error(`Fullscreen error: ${err.message}`);
            }
        };

        handleFullscreen();
        ResetLastLine();

        // Setup media box interactions
        const MediaBox = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox");
        const MediaImage = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaImage");

        if (MediaBox && MediaImage) {
            MediaBox_Data.Functions.Eventify(MediaBox);
            MediaBox.addEventListener("mouseenter", MediaBox_Data.Functions.MouseIn);
            MediaBox.addEventListener("mouseleave", (e) => MediaBox_Data.Functions.MouseOut(e));
            
            // Add NowBar hover animation and movement tracking
            const NowBar = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .NowBar");
            if (NowBar) {
                NowBar.addEventListener("mouseenter", MediaBox_Data.Functions.NowBarMouseIn);
                NowBar.addEventListener("mousemove", MediaBox_Data.Functions.handleNowBarMove);
            }
        }

        Global.Event.evoke("fullscreen:open", null);
    }
}

function Close() {
    const SpicyPage = document.querySelector<HTMLElement>("#SpicyLyricsPage");

    if (SpicyPage) {
        // Set state first
        const wasOpen = Fullscreen.IsOpen;
        Fullscreen.IsOpen = false;
        Fullscreen.CinemaViewOpen = false;

        // Handle DOM changes
        TransferElement(SpicyPage, PageRoot);
        SpicyPage.classList.remove("Fullscreen");

        // Handle fullscreen exit
        const handleFullscreenExit = async () => {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
            
            // Only update controls after fullscreen state is settled
            if (wasOpen) {
                PageView.AppendViewControls(true);
            }
        };

        handleFullscreenExit();

        const NoLyrics = storage.get("currentLyricsData")?.toString()?.includes("NO_LYRICS");
        if (NoLyrics) {
            OpenNowBar();
            document.querySelector("#SpicyLyricsPage .ContentBox .LyricsContainer")?.classList.add("Hidden");
            DeregisterNowBarBtn();
        }

        ResetLastLine();

        if (storage.get("IsNowBarOpen") !== "true") {
            CloseNowBar();
        }

        // Cleanup media box interactions
        const MediaBox = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox");
        const MediaImage = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .NowBar .Header .MediaBox .MediaImage");

        if (MediaBox && MediaImage) {
            MediaBox.removeEventListener("mouseenter", MediaBox_Data.Functions.MouseIn);
            MediaBox.removeEventListener("mouseleave", MediaBox_Data.Functions.MouseOut);
            
            // Remove NowBar hover animation and movement tracking
            const NowBar = document.querySelector<HTMLElement>("#SpicyLyricsPage .ContentBox .NowBar");
            if (NowBar) {
                NowBar.removeEventListener("mouseenter", MediaBox_Data.Functions.NowBarMouseIn);
                NowBar.removeEventListener("mousemove", MediaBox_Data.Functions.handleNowBarMove);
            }
            
            // Clear any existing timeout
            if (MediaBox_Data.hoverTimeoutId) {
                clearTimeout(MediaBox_Data.hoverTimeoutId);
                MediaBox_Data.hoverTimeoutId = null;
            }
            
            MediaBox_Data.Functions.Reset(MediaBox);
        }

        Global.Event.evoke("fullscreen:exit", null);
    }
}

function Toggle(skipDocumentFullscreen: boolean = false) {
    const SpicyPage = document.querySelector<HTMLElement>("#SpicyLyricsPage");

    if (SpicyPage) {
        if (Fullscreen.IsOpen) {
            Close();
        } else {
            Open(skipDocumentFullscreen);
        }
    }
}

export default Fullscreen;