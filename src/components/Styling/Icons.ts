/*
 * View-control icons share one grid: 24×24, 2-unit round stroke, ink centred on 12,12.
 * Layout icons draw the page as it actually lays out (frame, cover square, lyric lines),
 * so they mirror and move with the page. Parts tagged `SL_Icon*` are driven by state
 * classes in default.css and NPVLyrics.css, which is why those buttons are never rebuilt
 * just to change state.
 *
 * Left as they are: the brand mark (LyricsPage), PiPMode (it sits in Spotify's playbar
 * and matches Spotify's own glyphs), and the filled transport/heart/volume set, whose
 * IDs, classes and aspect ratios the NowBar CSS depends on.
 */

const Line = (body: string) =>
  `<svg class="NoFill" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const Frame = `<rect x="3" y="4" width="18" height="16" rx="3"/>`;

const TrackSkip = `
	<div class="PlaybackControl TrackSkip REPLACEME">
		<svg viewBox="0 0 35 20" xmlns="http://www.w3.org/2000/svg">
			<path d="M 19.467 19.905 C 20.008 19.905 20.463 19.746 21.005 19.426 L 33.61 12.023 C 34.533 11.482 35 10.817 35 9.993 C 35 9.158 34.545 8.53 33.61 7.977 L 21.005 0.574 C 20.463 0.254 19.998 0.094 19.456 0.094 C 18.374 0.094 17.475 0.917 17.475 2.418 L 17.475 9.49 C 17.315 8.898 16.873 8.408 16.135 7.977 L 3.529 0.574 C 3 0.254 2.533 0.094 1.993 0.094 C 0.911 0.094 0 0.917 0 2.418 L 0 17.582 C 0 19.083 0.91 19.906 1.993 19.906 C 2.533 19.906 3 19.746 3.529 19.426 L 16.135 12.023 C 16.861 11.593 17.315 11.088 17.475 10.485 L 17.475 17.582 C 17.475 19.083 18.386 19.906 19.467 19.906 L 19.467 19.905 Z" fill-rule="nonzero"/>
		</svg>
	</div>
`;

export const Icons = {
  LyricsPage: `
        <svg class="Svg-sc-ytk21e-0 Svg-img-16-icon" id="SpicyLyricsPageSvg" version="1.0" xmlns="http://www.w3.org/2000/svg" width="22px" height="22px" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet">
            <path d="M18.9962 5.00357C18.5208 4.52802 17.9233 4.19298 17.2696 4.03541C16.6159 3.87784 15.9313 3.90387 15.2915 4.11061C14.6516 4.31735 14.0813 4.69678 13.6433 5.20705C13.2054 5.71733 12.9169 6.33862 12.8097 7.00242L16.9973 11.1897C17.6611 11.0825 18.2824 10.794 18.7927 10.3561C19.303 9.91824 19.6825 9.34793 19.8893 8.7081C20.096 8.06827 20.122 7.38377 19.9645 6.73009C19.8069 6.07641 19.4718 5.47894 18.9962 5.00357ZM15.2227 12.153L11.845 8.77431C10.4947 10.3119 9.14443 11.8495 7.79421 13.3871L4.34436 17.3139C4.06732 17.6308 3.92106 18.0412 3.93518 18.4618C3.94929 18.8825 4.12273 19.2821 4.42039 19.5798C4.71804 19.8774 5.11767 20.0508 5.53838 20.0649C5.9591 20.0791 6.36945 19.9328 6.68639 19.6558L10.6328 16.1894L15.224 12.1543L15.2227 12.153ZM10.8636 6.96374C10.9806 5.9186 11.3904 4.92775 12.0457 4.10518C12.701 3.28261 13.5752 2.66176 14.5678 2.31407C15.5604 1.96638 16.631 1.90598 17.6564 2.13981C18.6818 2.37365 19.6203 2.89222 20.364 3.63586C21.1077 4.3795 21.6263 5.31798 21.8602 6.34331C22.094 7.36865 22.0336 8.43917 21.6859 9.43169C21.3382 10.4242 20.7173 11.2984 19.8947 11.9537C19.0721 12.6089 18.0811 13.0187 17.0359 13.1357L11.9108 17.6402L7.96445 21.1079C7.27835 21.7096 6.38902 22.0279 5.47687 21.9981C4.56473 21.9683 3.69808 21.5926 3.05275 20.9473C2.40742 20.302 2.03174 19.4354 2.00192 18.5234C1.97211 17.6113 2.29039 16.722 2.8922 16.0359L6.34334 12.1092L10.8636 6.96374Z"/>
            <path d="M8.35932 0.380176C8.40765 0.249583 8.59235 0.249583 8.64068 0.380176L9.15129 1.76009C9.16648 1.80114 9.19886 1.83352 9.23991 1.84871L10.6198 2.35932C10.7504 2.40765 10.7504 2.59235 10.6198 2.64068L9.23991 3.15129C9.19886 3.16648 9.16648 3.19886 9.15129 3.23991L8.64068 4.61982C8.59235 4.75042 8.40765 4.75042 8.35932 4.61982L7.84871 3.23991C7.83352 3.19886 7.80114 3.16648 7.76009 3.15129L6.38018 2.64068C6.24958 2.59235 6.24958 2.40765 6.38018 2.35932L7.76009 1.84871C7.80114 1.83352 7.83352 1.80114 7.84871 1.76009L8.35932 0.380176Z"/>
            <path d="M19.8593 14.3802C19.9076 14.2496 20.0924 14.2496 20.1407 14.3802L21.0564 16.855C21.0716 16.896 21.104 16.9284 21.145 16.9436L23.6198 17.8593C23.7504 17.9076 23.7504 18.0924 23.6198 18.1407L21.145 19.0564C21.104 19.0716 21.0716 19.104 21.0564 19.145L20.1407 21.6198C20.0924 21.7504 19.9076 21.7504 19.8593 21.6198L18.9436 19.145C18.9284 19.104 18.896 19.0716 18.855 19.0564L16.3802 18.1407C16.2496 18.0924 16.2496 17.9076 16.3802 17.8593L18.855 16.9436C18.896 16.9284 18.9284 16.896 18.9436 16.855L19.8593 14.3802Z"/>
            <path d="M13.3593 18.3802C13.4076 18.2496 13.5924 18.2496 13.6407 18.3802L14.1513 19.7601C14.1665 19.8011 14.1989 19.8335 14.2399 19.8487L15.6198 20.3593C15.7504 20.4076 15.7504 20.5924 15.6198 20.6407L14.2399 21.1513C14.1989 21.1665 14.1665 21.1989 14.1513 21.2399L13.6407 22.6198C13.5924 22.7504 13.4076 22.7504 13.3593 22.6198L12.8487 21.2399C12.8335 21.1989 12.8011 21.1665 12.7601 21.1513L11.3802 20.6407C11.2496 20.5924 11.2496 20.4076 11.3802 20.3593L12.7601 19.8487C12.8011 19.8335 12.8335 19.8011 12.8487 19.7601L13.3593 18.3802Z"/>
            <path d="M3.85932 3.38018C3.90765 3.24958 4.09235 3.24958 4.14068 3.38018L5.05643 5.85495C5.07162 5.89601 5.10399 5.92838 5.14505 5.94357L7.61982 6.85932C7.75042 6.90765 7.75042 7.09235 7.61982 7.14068L5.14505 8.05643C5.10399 8.07162 5.07162 8.10399 5.05643 8.14505L4.14068 10.6198C4.09235 10.7504 3.90765 10.7504 3.85932 10.6198L2.94357 8.14505C2.92838 8.10399 2.89601 8.07162 2.85495 8.05643L0.380176 7.14068C0.249583 7.09235 0.249583 6.90765 0.380176 6.85932L2.85495 5.94357C2.89601 5.92838 2.92838 5.89601 2.94357 5.85495L3.85932 3.38018Z"/>
        </svg>
    `,
  Close: Line(`<path d="m5.5 5.5 13 13"/><path d="m18.5 5.5-13 13"/>`),
  // The page in miniature: cover and title on the NowBar's side, lyric lines on the other.
  NowBar: Line(
    `<g class="SL_IconPart SL_IconCover"><rect x="3" y="5" width="9" height="9" rx="2"/><path d="M4.5 18.5h6"/></g><g class="SL_IconPart SL_IconLyrics"><path d="M15.5 7.5h5"/><path d="M15.5 11.5h5"/><path d="M15.5 15.5h3"/></g>`
  ),
  // Screen edges, no window: the whole display.
  Fullscreen: Line(
    `<path class="SL_IconPart SL_NudgeTL" d="M3.5 8.5V6A2.5 2.5 0 0 1 6 3.5h2.5"/><path class="SL_IconPart SL_NudgeTR" d="M15.5 3.5H18A2.5 2.5 0 0 1 20.5 6v2.5"/><path class="SL_IconPart SL_NudgeBR" d="M20.5 15.5V18a2.5 2.5 0 0 1-2.5 2.5h-2.5"/><path class="SL_IconPart SL_NudgeBL" d="M8.5 20.5H6A2.5 2.5 0 0 1 3.5 18v-2.5"/>`
  ),
  // Fullscreen turned inside out: the way back to Cinema View from fullscreen. Each corner
  // leans toward the centre on hover, so it carries the opposite nudge to its position.
  CloseFullscreen: Line(
    `<path class="SL_IconPart SL_NudgeBR" d="M8.5 3.5V6A2.5 2.5 0 0 1 6 8.5H3.5"/><path class="SL_IconPart SL_NudgeBL" d="M20.5 8.5H18A2.5 2.5 0 0 1 15.5 6V3.5"/><path class="SL_IconPart SL_NudgeTL" d="M15.5 20.5V18a2.5 2.5 0 0 1 2.5-2.5h2.5"/><path class="SL_IconPart SL_NudgeTR" d="M3.5 15.5H6A2.5 2.5 0 0 1 8.5 18v2.5"/>`
  ),
  // The Spotify window, with the lyrics growing to its edges.
  CinemaView: Line(
    `${Frame}<path class="SL_IconPart SL_NudgeTL" d="M10.5 10.5 7 7m0 3V7h3"/><path class="SL_IconPart SL_NudgeBR" d="M13.5 13.5 17 17m0-3v3h-3"/>`
  ),
  // Spotify's layout: lyrics leave the right sidebar for the main view.
  OpenPage: Line(
    `${Frame}<path d="M15 4v16"/><path class="SL_NudgeL" d="M11.5 12H6.5m2.5-2.5L6.5 12 9 14.5"/>`
  ),

  PrevTrack: TrackSkip.replace("REPLACEME", "PrevTrack"),
  Play: `
		<svg viewBox="0 0 18 20" xmlns="http://www.w3.org/2000/svg" class="Play">
			<path d="M 1.558 20 C 2.006 20 2.381 19.838 2.874 19.561 L 16.622 11.572 C 17.527 11.053 17.894 10.65 17.894 9.997 C 17.894 9.35 17.527 8.948 16.622 8.419 L 2.874 0.439 C 2.381 0.153 2.006 0 1.558 0 C 0.706 0 0.106 0.654 0.106 1.694 L 0.106 18.298 C 0.106 19.346 0.706 20 1.558 20 L 1.558 20 Z" fill-rule="nonzero" transform="matrix(1, 0, 0, 1, 0, 8.881784197001252e-16)"/>
		</svg>
	`,
  Pause: `
		<svg viewBox="0 0 15 20" xmlns="http://www.w3.org/2000/svg" class="Pause">
			<path d="M 4.427 19.963 C 5.513 19.963 6.06 19.416 6.06 18.33 L 6.06 1.66 C 6.06 0.545 5.513 0.037 4.427 0.037 L 1.633 0.037 C 0.548 0.037 0 0.575 0 1.66 L 0 18.331 C -0.009 19.416 0.538 19.963 1.633 19.963 L 4.427 19.963 Z M 13.377 19.963 C 14.462 19.963 15 19.416 15 18.33 L 15 1.66 C 15 0.545 14.462 0.037 13.376 0.037 L 10.573 0.037 C 9.487 0.037 8.949 0.575 8.949 1.66 L 8.949 18.331 C 8.949 19.416 9.487 19.963 10.573 19.963 L 13.376 19.963 L 13.377 19.963 Z" fill-rule="nonzero"/>
		</svg>
	`,
  NextTrack: TrackSkip.replace("REPLACEME", "NextTrack"),
  Shuffle: `
        <svg viewBox="0 0 25 20" xmlns="http://www.w3.org/2000/svg">
            <path d="M 19.857 19.948 C 20.135 19.94 20.403 19.841 20.62 19.663 L 24.632 16.281 C 25.123 15.868 25.123 15.223 24.632 14.797 L 20.62 11.402 C 20.403 11.224 20.135 11.125 19.857 11.117 C 19.212 11.117 18.81 11.518 18.81 12.164 L 18.81 14.1 L 17.003 14.1 C 15.853 14.1 15.144 13.738 14.33 12.782 L 11.956 9.981 L 14.33 7.167 C 15.17 6.186 15.802 5.849 16.939 5.849 L 18.81 5.849 L 18.81 7.838 C 18.81 8.471 19.212 8.871 19.857 8.871 C 20.133 8.868 20.403 8.773 20.62 8.6 L 24.632 5.216 C 25.123 4.803 25.123 4.145 24.632 3.732 L 20.62 0.337 C 20.406 0.154 20.136 0.053 19.857 0.052 C 19.212 0.052 18.81 0.453 18.81 1.087 L 18.81 3.241 L 16.925 3.241 C 15.015 3.241 13.827 3.771 12.472 5.398 L 10.277 7.992 L 7.992 5.269 C 6.738 3.798 5.55 3.241 3.719 3.241 L 1.393 3.241 C 0.569 3.241 0 3.784 0 4.546 C 0 5.308 0.567 5.849 1.393 5.849 L 3.628 5.849 C 4.712 5.849 5.436 6.199 6.249 7.167 L 8.611 9.967 L 6.247 12.782 C 5.423 13.752 4.763 14.1 3.691 14.1 L 1.393 14.1 C 0.569 14.1 0 14.641 0 15.403 C 0 16.165 0.567 16.707 1.393 16.707 L 3.783 16.707 C 5.617 16.707 6.738 16.153 7.992 14.68 L 10.29 11.956 L 12.537 14.629 C 13.815 16.153 15.066 16.707 16.925 16.707 L 18.81 16.707 L 18.81 18.902 C 18.81 19.548 19.212 19.948 19.857 19.948 Z"/>
        </svg>
	`,
  Loop: `
		<svg viewBox="0 0 20 17" xmlns="http://www.w3.org/2000/svg" class="Loop">
			<path d="M 1.148 8.951 C 1.786 8.956 2.307 8.441 2.307 7.803 L 2.307 7.201 C 2.307 5.853 3.255 4.949 4.705 4.949 L 11.426 4.949 L 11.426 6.778 C 11.426 7.325 11.773 7.67 12.33 7.67 C 12.572 7.67 12.806 7.583 12.988 7.424 L 16.454 4.515 C 16.879 4.158 16.879 3.589 16.454 3.233 L 12.988 0.301 C 12.806 0.142 12.572 0.055 12.33 0.055 C 11.773 0.055 11.428 0.402 11.428 0.948 L 11.428 2.686 L 4.872 2.686 C 1.895 2.686 0 4.37 0 7.001 L 0 7.803 C 0 8.44 0.513 8.951 1.148 8.951 L 1.148 8.951 Z M 7.681 16.945 C 8.227 16.945 8.572 16.6 8.572 16.053 L 8.572 14.303 L 15.128 14.303 C 18.116 14.303 20 12.619 20 9.988 L 20 9.186 C 20 8.302 19.043 7.75 18.278 8.192 C 17.922 8.397 17.703 8.776 17.703 9.186 L 17.703 9.788 C 17.703 11.136 16.745 12.04 15.295 12.04 L 8.572 12.04 L 8.572 10.223 C 8.572 9.676 8.227 9.331 7.681 9.331 C 7.436 9.331 7.199 9.417 7.012 9.576 L 3.556 12.497 C 3.121 12.842 3.133 13.41 3.556 13.767 L 7.012 16.711 C 7.202 16.862 7.438 16.944 7.681 16.945 L 7.681 16.945 Z" fill-rule="nonzero"/>
		</svg>
	`,
  LoopTrack: `
		<svg viewBox="0 0 20 17" xmlns="http://www.w3.org/2000/svg" class="LoopTrack">
			<path d="M 18.885 6.353 C 19.52 6.353 19.888 6.008 19.888 5.318 L 19.888 1.236 C 19.888 0.511 19.409 0.022 18.696 0.022 C 18.105 0.022 17.758 0.21 17.302 0.556 L 16.176 1.437 C 15.907 1.639 15.819 1.839 15.819 2.073 C 15.819 2.418 16.074 2.697 16.488 2.697 C 16.666 2.697 16.81 2.641 16.956 2.529 L 17.781 1.839 L 17.859 1.839 L 17.859 5.318 C 17.859 6.008 18.227 6.353 18.885 6.353 L 18.885 6.353 Z M 1.147 8.986 C 1.791 9.003 2.319 8.48 2.306 7.836 L 2.306 7.234 C 2.306 5.886 3.254 4.982 4.703 4.982 L 9.274 4.982 L 9.274 6.811 C 9.274 7.358 9.62 7.703 10.178 7.703 C 10.42 7.703 10.653 7.616 10.836 7.457 L 14.302 4.548 C 14.727 4.191 14.727 3.621 14.302 3.265 L 10.837 0.333 C 10.655 0.175 10.421 0.087 10.179 0.088 C 9.622 0.088 9.275 0.434 9.275 0.981 L 9.275 2.719 L 4.873 2.719 C 1.895 2.719 0 4.403 0 7.034 L 0 7.836 C 0 8.494 0.502 8.984 1.148 8.984 L 1.147 8.986 Z M 7.68 16.978 C 8.226 16.978 8.572 16.633 8.572 16.086 L 8.572 14.336 L 15.127 14.336 C 18.115 14.336 20 12.652 20 10.021 L 20 9.219 C 20.013 8.58 19.491 8.058 18.851 8.071 C 18.21 8.054 17.686 8.578 17.703 9.219 L 17.703 9.821 C 17.703 11.169 16.744 12.073 15.295 12.073 L 8.572 12.073 L 8.572 10.256 C 8.572 9.709 8.226 9.364 7.68 9.364 C 7.435 9.364 7.198 9.45 7.011 9.609 L 3.555 12.53 C 3.12 12.875 3.132 13.443 3.555 13.8 L 7.011 16.744 C 7.201 16.895 7.437 16.977 7.68 16.978 L 7.68 16.978 Z" fill-rule="nonzero" transform="matrix(1, 0, 0, 1, 0, -8.881784197001252e-16)"/>
		</svg>
	`,
  // One SVG for every volume state — the waves and the mute cross are toggled via
  // opacity by the .Muted / .Low / .High classes on .VolumeControl, so the markup
  // never has to be swapped while the level changes.
  Volume: `
		<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="Volume">
			<path id="SpicyLyrics_VolumeSpeaker" d="M11 4.5 6.5 8.5H3.5c-.83 0-1.5.67-1.5 1.5v4c0 .83.67 1.5 1.5 1.5h3l4.5 4c.65.58 1.5.1 1.5-.68V5.18c0-.78-.85-1.26-1.5-.68z"/>
			<path id="SpicyLyrics_VolumeWaveLow" d="M15.2 9.6a1 1 0 0 1 1.4 0 3.4 3.4 0 0 1 0 4.8 1 1 0 1 1-1.4-1.4 1.4 1.4 0 0 0 0-2 1 1 0 0 1 0-1.4z"/>
			<path id="SpicyLyrics_VolumeWaveHigh" d="M17.9 6.9a1 1 0 0 1 1.4 0 7.2 7.2 0 0 1 0 10.2 1 1 0 1 1-1.4-1.4 5.2 5.2 0 0 0 0-7.4 1 1 0 0 1 0-1.4z"/>
			<path id="SpicyLyrics_VolumeMute" d="M15.3 8.8a1 1 0 0 1 1.4 0l1.8 1.8 1.8-1.8a1 1 0 1 1 1.4 1.4L19.9 12l1.8 1.8a1 1 0 0 1-1.4 1.4l-1.8-1.8-1.8 1.8a1 1 0 0 1-1.4-1.4l1.8-1.8-1.8-1.8a1 1 0 0 1 0-1.4z"/>
		</svg>
	`,
  // One chevron for both card states; NPVLyrics.css turns the whole svg over when the card
  // collapses. The card's morph keeps the main thread busy, so only composited motion shows.
  CardToggle: Line(`<path d="m6 15 6-6 6 6"/>`),
  // The card stretching to the sidebar's top and bottom, then the arrows turned inward once
  // it has. Both are stacked so NPVLyrics.css can cross-fade them on the compositor.
  CardExpand: `<span class="SL_IconStack">${Line(
    `<path d="M6 3.5h12"/><path d="M6 20.5h12"/><path d="M12 10.5v-4m-2.5 2.5L12 6.5l2.5 2.5"/><path d="M12 13.5v4m-2.5-2.5 2.5 2.5 2.5-2.5"/>`
  )}${Line(
    `<path d="M6 3.5h12"/><path d="M6 20.5h12"/><path d="M12 6.5v4m-2.5-2.5 2.5 2.5 2.5-2.5"/><path d="M12 17.5v-4m-2.5 2.5 2.5-2.5 2.5 2.5"/>`
  )}</span>`,
  // Cover on the NowBar's current side, pointing at the side it will move to.
  NowBarSideSwap: Line(
    `${Frame}<rect class="SL_IconPart SL_IconCover" x="6" y="9.5" width="5" height="5" rx="1.25"/><path class="SL_IconPart SL_IconSwapArrow" d="M14 12h4m-1.75-1.75L18 12l-1.75 1.75"/>`
  ),
  Heart: `
        <svg viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g id="SpicyLyrics_HeartFrame">
                <g id="SpicyLyrics_Heart" clip-path="url(#clip0_1_2)">
                    <g id="SpicyLyrics_HeartOutline">
                        <path id="Vector" d="M982.995 324.097C982.995 180.45 866.598 64 723.02 64C628.493 64 545.998 114.641 500.496 190.119C454.992 114.641 372.499 64 277.973 64C134.394 64 18 180.45 18 324.097C18 356.935 24.3385 388.224 35.436 417.155C121.399 664.536 500.499 936 500.499 936C500.499 936 879.595 664.536 965.562 417.155C976.659 388.226 982.995 356.935 982.995 324.097Z" stroke="white" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
                    </g>
                    <g id="SpicyLyrics_HeartFill">
                        <ellipse cx="276.5" cy="285.5" rx="244.5" ry="215.5" fill="white"/>
                        <ellipse cx="725" cy="285.5" rx="247" ry="217.5" fill="white"/>
                        <ellipse cx="189" cy="325.5" rx="165" ry="214.5" fill="white"/>
                        <ellipse cx="234.335" cy="472.198" rx="150" ry="272" transform="rotate(-34.3576 234.335 472.198)" fill="white"/>
                        <ellipse cx="298.508" cy="629.28" rx="97.5117" ry="183.378" transform="rotate(-42.2757 298.508 629.28)" fill="white"/>
                        <ellipse cx="390.743" cy="718.138" rx="102.44" ry="192.646" transform="rotate(-42.2757 390.743 718.138)" fill="white"/>
                        <ellipse cx="669.263" cy="652.69" rx="102.44" ry="328.343" transform="rotate(42.28 669.263 652.69)" fill="white"/>
                        <ellipse cx="788.346" cy="447.149" rx="150" ry="262.498" transform="rotate(-143.364 788.346 447.149)" fill="white"/>
                        <ellipse cx="500" cy="588" rx="150" ry="327" fill="white"/>
                        <ellipse cx="499.5" cy="914.5" rx="24.5" ry="13.5" fill="white"/>
                        <ellipse cx="822.516" cy="623.447" rx="55.9753" ry="13.5" transform="rotate(-52.0641 822.516 623.447)" fill="white"/>
                    </g>
                </g>
            </g>
            <defs>
                <clipPath id="clip0_1_2">
                    <rect width="994" height="994" fill="white" transform="translate(3 3)"/>
                </clipPath>
            </defs>
        </svg>
    `,
  // A stack of lyric sheets: the local TTML files this panel manages.
  LyricsManager: Line(
    `<path d="M8 3h8.5A2.5 2.5 0 0 1 19 5.5V16"/><rect x="5" y="6" width="11" height="15" rx="2.5"/><path d="M8 10.5h5"/><path d="M8 14h5"/><path d="M8 17.5h3"/>`
  ),
  // A and ア are both "a", which is the whole idea of romanization. The script the
  // button switches to is drawn at full strength, the one it leaves dimmed.
  DisableRomanization: Line(
    `<g opacity=".4"><path d="M2.5 18 6.75 6 11 18"/><path d="M4 14h5.5"/></g><path d="M13.5 6.5h8L19 9.75"/><path d="M17.25 9.75v1.75c0 2.75-1.25 5-3.75 6.5"/>`
  ),
  EnableRomanization: Line(
    `<path d="M2.5 18 6.75 6 11 18"/><path d="M4 14h5.5"/><g opacity=".4"><path d="M13.5 6.5h8L19 9.75"/><path d="M17.25 9.75v1.75c0 2.75-1.25 5-3.75 6.5"/></g>`
  ),
  // Compact layout: small cover and title on one row, lyrics underneath.
  EnableCompactModeIcon: Line(
    `<rect x="3.5" y="4.5" width="6" height="6" rx="1.5"/><path d="M13 5.75h7.5"/><path d="M13 9.25h4.5"/><path d="M3.5 15h17"/><path d="M3.5 19.5h11"/>`
  ),
  // Regular layout: large cover with its title, lyrics beside it.
  DisableCompactModeIcon: Line(
    `<rect x="3" y="5" width="9" height="9" rx="2"/><path d="M4.5 18.5h6"/><path d="M15.5 7.5h5"/><path d="M15.5 11.5h5"/><path d="M15.5 15.5h3"/>`
  ),
  PiPMode: `<svg data-encore-id="icon" role="img" aria-hidden="true" class="e-91000-icon e-91000-baseline" viewBox="0 0 16 16" style="--encore-icon-height: var(--encore-graphic-size-decorative-smaller); --encore-icon-width: var(--encore-graphic-size-decorative-smaller);"><path d="M16 2.45c0-.8-.65-1.45-1.45-1.45H1.45C.65 1 0 1.65 0 2.45v11.1C0 14.35.65 15 1.45 15h5.557v-1.5H1.5v-11h13V7H16z"></path><path d="M15.25 9.007a.75.75 0 0 1 .75.75v4.493a.75.75 0 0 1-.75.75H9.325a.75.75 0 0 1-.75-.75V9.757a.75.75 0 0 1 .75-.75z"></path></svg>`,
  // Eight teeth, so the 45° hover turn in default.css lands on an identical gear.
  Settings: Line(
    `<g class="SL_IconPart SL_IconGear"><path d="M10.07 5.69L10.48 3.38A8.75 8.75 0 0 1 13.52 3.38L13.93 5.69A6.6 6.6 0 0 1 15.1 6.17L17.02 4.83A8.75 8.75 0 0 1 19.17 6.98L17.83 8.9A6.6 6.6 0 0 1 18.31 10.07L20.62 10.48A8.75 8.75 0 0 1 20.62 13.52L18.31 13.93A6.6 6.6 0 0 1 17.83 15.1L19.17 17.02A8.75 8.75 0 0 1 17.02 19.17L15.1 17.83A6.6 6.6 0 0 1 13.93 18.31L13.52 20.62A8.75 8.75 0 0 1 10.48 20.62L10.07 18.31A6.6 6.6 0 0 1 8.9 17.83L6.98 19.17A8.75 8.75 0 0 1 4.83 17.02L6.17 15.1A6.6 6.6 0 0 1 5.69 13.93L3.38 13.52A8.75 8.75 0 0 1 3.38 10.48L5.69 10.07A6.6 6.6 0 0 1 6.17 8.9L4.83 6.98A8.75 8.75 0 0 1 6.98 4.83L8.9 6.17A6.6 6.6 0 0 1 10.07 5.69Z"/><circle cx="12" cy="12" r="2.75"/></g>`
  ),
};
