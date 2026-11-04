import { persistAtom } from "./stores.ts";

/*
 * Settings for the fullscreen clock. Kept apart from stores.ts so the clock and
 * its settings rows can both import them without pulling each other in.
 */

export type ClockShow = "both" | "time" | "date";
export type ClockTimeFormat = "24h" | "12h";
export type ClockDateFormat = "weekday" | "numeric" | "long";
export type ClockColours = "cover" | "white";

export const CLOCK_SHOW: readonly ClockShow[] = ["both", "time", "date"];
export const CLOCK_SHOW_LABELS = ["Time and date", "Time only", "Date only"];

export const CLOCK_TIME_FORMATS: readonly ClockTimeFormat[] = ["24h", "12h"];
export const CLOCK_TIME_FORMAT_LABELS = ["24-hour", "12-hour"];

export const CLOCK_DATE_FORMATS: readonly ClockDateFormat[] = ["weekday", "numeric", "long"];
export const CLOCK_DATE_FORMAT_LABELS = ["Weekday and date", "Numeric", "Full"];

export const CLOCK_COLOURS: readonly ClockColours[] = ["cover", "white"];
export const CLOCK_COLOUR_LABELS = ["Cover colors", "White"];

export const $clockShow = persistAtom<ClockShow>("clockShow", "both");
export const $clockTimeFormat = persistAtom<ClockTimeFormat>("clockTimeFormat", "24h");
export const $clockDateFormat = persistAtom<ClockDateFormat>("clockDateFormat", "weekday");
export const $clockColours = persistAtom<ClockColours>("clockColours", "cover");
