import React, { forwardRef, useContext, useRef } from "react";
import { searchTerms } from "./model.ts";

/**
 * Peeking clears the panel away so the lyrics behind it show: the row passed in
 * stays (a slider being dragged), or nothing does (null, the hold-to-peek button).
 * `end` brings the panel back. A no-op outside the settings panel.
 */
export const PeekContext = React.createContext<{
  start: (keep: HTMLElement | null) => void;
  end: () => void;
}>({ start: () => {}, end: () => {} });

export function Row({
  label,
  description,
  children,
  disabled,
  disabledReason,
  note,
  stacked,
  badge,
}: {
  label: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  disabled?: boolean;
  /** Shown under the description while the row is disabled, so the way out is in plain sight. */
  disabledReason?: string;
  /** Shown under the description whether or not the row is disabled, e.g. another setting overriding it. */
  note?: string;
  stacked?: boolean;
  /** Inline tag after the label, e.g. a "Forced on" marker. */
  badge?: React.ReactNode;
}) {
  return (
    <div
      className={`sl-sp-row${disabled ? " sl-sp-row--disabled" : ""}${stacked ? " sl-sp-row--stacked" : ""}`}
    >
      <div className="sl-sp-label-wrap">
        <span className="sl-sp-label">
          {label}
          {badge}
        </span>
        {description && <span className="sl-sp-description">{description}</span>}
        {disabled && disabledReason && <span className="sl-sp-reason">{disabledReason}</span>}
        {note && <span className="sl-sp-reason">{note}</span>}
      </div>
      <div className="sl-sp-control">{children}</div>
    </div>
  );
}

/** Marks every search term inside `text`. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const terms = searchTerms(query);
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        // split() with one capture group puts the matches at the odd indices.
        i % 2 === 1 ? (
          <mark key={i} className="sl-sp-mark">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export function Toggle({
  checked,
  onChange,
  locked,
  onLockedPress,
  busy,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Shown but unchangeable. Pressing it nudges the knob and snaps it back. */
  locked?: boolean;
  onLockedPress?: () => void;
  /**
   * Briefly unchangeable while something it depends on settles. Behaves like
   * `locked`, but leaves the look to the parent so a short wait never flickers.
   */
  busy?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const frozen = locked || busy;
  const trackRef = useRef<HTMLSpanElement>(null);

  // A locked toggle still answers the press: the knob leans a few px toward the
  // state it can't reach and springs back, so the click isn't met with silence.
  const nudge = () => {
    onLockedPress?.();
    const track = trackRef.current;
    if (!track || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rest = checked ? 18 : 0;
    const lean = checked ? rest - 4 : rest + 4;
    track.animate(
      [
        { transform: `translateX(${rest}px)` },
        { transform: `translateX(${lean}px)`, offset: 0.35 },
        { transform: `translateX(${rest}px)` },
      ],
      { duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)", pseudoElement: "::after" }
    );
  };

  return (
    <label
      className={`sl-sp-toggle${locked ? " sl-sp-toggle--locked" : ""}${busy ? " sl-sp-toggle--busy" : ""}`}
      onPointerDown={frozen ? nudge : undefined}
    >
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={frozen || disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="sl-sp-toggle-track" ref={trackRef} />
    </label>
  );
}

export function Select({
  value,
  options,
  labels,
  onChange,
  disabled,
  label,
}: {
  value: string;
  options: string[];
  labels?: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <select
      className="sl-sp-select"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      disabled={disabled}
    >
      {options.map((opt, i) => (
        <option key={opt} value={opt}>
          {labels?.[i] ?? opt}
        </option>
      ))}
    </select>
  );
}

/**
 * Bipolar position slider — a snapping range control centred on a neutral
 * point with a negative axis to the left and a positive axis to the right.
 * The filled segment grows outward from the centre toward the thumb, so the
 * sign of the value is conveyed by the direction of the fill. Pass a
 * `defaultValue` to surface an inline Reset affordance.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit,
  onChange,
  disabled,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  // Keep in sync with the thumb width in settings-panel.css.
  const THUMB = 16;
  const range = max - min || 1;
  const clamped = Math.min(max, Math.max(min, value));
  const frac = (clamped - min) / range;
  const isBipolar = min < 0 && max > 0;
  const zeroFrac = ((isBipolar ? 0 : min) - min) / range;

  // Position of a fraction along the track, compensating for the thumb width
  // so the fill and centre tick line up with the native thumb at both ends.
  const posFor = (f: number) =>
    `calc(${(f * 100).toFixed(4)}% + ${((0.5 - f) * THUMB).toFixed(3)}px)`;

  const fillFrom = Math.min(zeroFrac, frac);
  const fillSpan = Math.abs(frac - zeroFrac);

  // A bipolar fill grows out of the centre tick. A one-sided fill must start at
  // the track's own left edge — anchoring it to the thumb's centre at `min` left
  // a bare stub of track to the left of the fill.
  const fillStyle = isBipolar
    ? {
        left: posFor(fillFrom),
        width: `calc(${(fillSpan * 100).toFixed(4)}% - ${(fillSpan * THUMB).toFixed(3)}px)`,
      }
    : { left: "0px", width: posFor(frac) };

  const peek = useContext(PeekContext);
  // Dragging a slider shows its effect on the lyrics live, so the panel steps aside
  // until it's let go. The window hears the release even off the thumb.
  const peekWhileDragging = (event: React.PointerEvent<HTMLInputElement>) => {
    if (event.button !== 0) return;
    peek.start(event.currentTarget.closest<HTMLElement>(".sl-sp-row"));
    const release = () => {
      peek.end();
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
  };

  const sign = isBipolar && clamped > 0 ? "+" : "";
  const valueLabel = `${sign}${clamped}${unit ? ` ${unit}` : ""}`;
  const changed = defaultValue !== undefined && clamped !== defaultValue;

  return (
    <div className={`sl-sp-slider${disabled ? " sl-sp-slider--disabled" : ""}`}>
      <div className="sl-sp-slider-track-wrap">
        <span className="sl-sp-slider-track" />
        <span className="sl-sp-slider-fill" style={fillStyle} />
        {isBipolar && <span className="sl-sp-slider-center" style={{ left: posFor(zeroFrac) }} />}
        <input
          type="range"
          className="sl-sp-slider-input"
          aria-label={label}
          aria-valuetext={valueLabel}
          min={min}
          max={max}
          step={step}
          value={clamped}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          onPointerDown={peekWhileDragging}
          disabled={disabled}
        />
      </div>
      <div className="sl-sp-slider-meta">
        <span className="sl-sp-slider-value">{valueLabel}</span>
        {changed && !disabled && (
          <button
            type="button"
            className="sl-sp-slider-reset"
            onClick={() => onChange(defaultValue!)}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

export const SearchBar = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    placeholder?: string;
  }
>(function SearchBar({ value, onChange, onKeyDown, placeholder = "Search settings" }, ref) {
  return (
    <div className="sl-sp-search-wrap">
      <svg
        className="sl-sp-search-icon"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <line
          x1="9.5"
          y1="9.5"
          x2="13"
          y2="13"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <input
        ref={ref}
        className="sl-sp-search"
        type="search"
        aria-label="Search all settings"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          className="sl-sp-search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <line
              x1="1"
              y1="1"
              x2="9"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="1"
              x2="1"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
});
