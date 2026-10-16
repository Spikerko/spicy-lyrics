import React from "react";

/** 16px line icons for the sidebar, drawn on one 1.5px stroke so they read as a set. */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const LyricsIcon = (
  <Icon>
    <path d="M2.5 4h11M2.5 8h7.5M2.5 12h9" />
  </Icon>
);

export const BackgroundIcon = (
  <Icon>
    <rect x="2" y="2.75" width="12" height="10.5" rx="2" />
    <path d="M2.5 11l3.25-3.25L9 11l1.75-1.75L13.5 12" />
    <circle cx="10.75" cy="5.75" r="1" />
  </Icon>
);

// A stopwatch: the tab holds the sync offset and scroll timing.
export const PlaybackIcon = (
  <Icon>
    <circle cx="8" cy="9" r="5" />
    <path d="M8 6.75V9l1.5 1M6.5 1.75h3M8 1.75V4" />
  </Icon>
);

export const InterfaceIcon = (
  <Icon>
    <rect x="2" y="2.75" width="12" height="10.5" rx="2" />
    <path d="M6 2.75v10.5" />
  </Icon>
);

// Type specimen: the tab is the font and how smoothly it draws.
export const AppearanceIcon = (
  <Icon>
    <path d="M1.75 13 5.5 3l3.75 10M3.1 9.5h4.8" />
    <circle cx="12" cy="10.75" r="2.25" />
    <path d="M14.25 8.5V13" />
  </Icon>
);

export const ExperimentsIcon = (
  <Icon>
    <path d="M6.25 2h3.5M6.75 2v4.25L3 12.25A1.25 1.25 0 0 0 4.1 14h7.8a1.25 1.25 0 0 0 1.1-1.75L9.25 6.25V2" />
    <path d="M4.75 10h6.5" />
  </Icon>
);

export const AdvancedIcon = (
  <Icon>
    <path d="M3 4.5l3 3.5-3 3.5M8 11.5h5" />
  </Icon>
);

export const AboutIcon = (
  <Icon>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 7.25v3.5" />
    <circle cx="8" cy="5" r="0.4" fill="currentColor" />
  </Icon>
);

export const PeekIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M1.5 8s2.4-4.75 6.5-4.75S14.5 8 14.5 8 12.1 12.75 8 12.75 1.5 8 1.5 8z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export const CloseIcon = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path
      d="M1.5 1.5l9 9M10.5 1.5l-9 9"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const ChevronIcon = (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
    <path
      d="M3.5 2l3 3-3 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
