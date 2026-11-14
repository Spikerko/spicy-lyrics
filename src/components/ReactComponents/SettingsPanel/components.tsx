import React, { forwardRef, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
  aside,
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
  /** Sits at the right of the label, above a stacked control. */
  aside?: React.ReactNode;
}) {
  const labelWrap = (
    <div className="sl-sp-label-wrap">
      <span className="sl-sp-label">
        {label}
        {badge}
      </span>
      {description && <span className="sl-sp-description">{description}</span>}
      {disabled && disabledReason && <span className="sl-sp-reason">{disabledReason}</span>}
      {note && <span className="sl-sp-reason">{note}</span>}
    </div>
  );
  return (
    <div
      className={`sl-sp-row${disabled ? " sl-sp-row--disabled" : ""}${stacked ? " sl-sp-row--stacked" : ""}`}
    >
      {aside ? (
        <div className="sl-sp-row-head">
          {labelWrap}
          <div className="sl-sp-row-aside">{aside}</div>
        </div>
      ) : (
        labelWrap
      )}
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

// Keys the settings controls handle themselves. Spotify's own shortcuts listen on the document
// (Space plays/pauses, Escape leaves Cinema View), so a handled key goes no further.
function consume(event: React.KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

const isPrintable = (event: React.KeyboardEvent) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

// Room kept between the list and the window edge, and between the list and its button.
const LISTBOX_EDGE = 8;
const LISTBOX_GAP = 6;

/**
 * A select-only combobox. The list is a top-layer popover, so the pane and modal can't clip it;
 * focus stays on the button and follows the list through aria-activedescendant. */
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
  const listId = `sl-sp-listbox-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const optionId = (i: number) => `${listId}-${i}`;
  const labelOf = (i: number) => labels?.[i] ?? options[i];
  const selected = Math.max(0, options.indexOf(value));

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  // Opened from the keyboard: the list appears at once instead of scaling in.
  const [instant, setInstant] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef({ text: "", at: 0 });

  const show = (fromKeyboard: boolean, at = selected) => {
    setInstant(fromKeyboard);
    setActive(at);
    setOpen(true);
  };
  const commit = (i: number) => {
    typeahead.current.at = 0;
    setOpen(false);
    if (options[i] !== undefined && options[i] !== value) onChange(options[i]);
  };

  // Typing jumps to the next option starting with what was typed. Repeating one letter cycles.
  const findTyped = (char: string, from: number): number | undefined => {
    const now = Date.now();
    const state = typeahead.current;
    state.text = now - state.at > 500 ? char : state.text + char;
    state.at = now;
    const text = state.text.toLowerCase();
    const cycling = [...text].every((c) => c === text[0]);
    const needle = cycling ? text[0] : text;
    for (let step = cycling ? 1 : 0; step < options.length + (cycling ? 1 : 0); step++) {
      const i = (from + step) % options.length;
      if (labelOf(i).toLowerCase().startsWith(needle)) return i;
    }
    return undefined;
  };

  const place = () => {
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;
    const view = trigger.ownerDocument.defaultView ?? window;
    const box = trigger.getBoundingClientRect();
    list.style.minWidth = `${box.width}px`;
    const { offsetWidth: width, offsetHeight: height } = list;
    const roomBelow = view.innerHeight - box.bottom - LISTBOX_GAP - LISTBOX_EDGE;
    const roomAbove = box.top - LISTBOX_GAP - LISTBOX_EDGE;
    const above = height > roomBelow && roomAbove > roomBelow;
    list.dataset.placement = above ? "above" : "below";
    list.style.maxHeight = `${Math.max(120, above ? roomAbove : roomBelow)}px`;
    // Trailing edges line up: the button sits at the end of its row.
    const left = Math.min(Math.max(LISTBOX_EDGE, box.right - width), view.innerWidth - width - LISTBOX_EDGE);
    list.style.left = `${left}px`;
    list.style.top = above
      ? `${box.top - LISTBOX_GAP - Math.min(height, roomAbove)}px`
      : `${box.bottom + LISTBOX_GAP}px`;
  };

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (open) {
      if (!list.matches(":popover-open")) list.showPopover();
      place();
    } else if (list.matches(":popover-open")) {
      list.hidePopover();
    }
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`#${optionId(active)}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Closes without a change, as a native select does, on an outside press, a scroll that moves
  // the button (not the lyrics scrolling behind the panel), a resize or the window losing focus.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) return;
    const doc = trigger.ownerDocument;
    const view = doc.defaultView ?? window;
    const close = () => setOpen(false);
    const onPress = (event: Event) => {
      const target = event.target as Node;
      if (!trigger.contains(target) && !listRef.current?.contains(target)) close();
    };
    const onScroll = (event: Event) => {
      if ((event.target as Node).contains?.(trigger)) close();
    };
    // The settings panel closes on Escape from a capturing listener on the document, which
    // would run before the button's own. The window's capture phase comes first.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    view.addEventListener("keydown", onEscape, true);
    doc.addEventListener("pointerdown", onPress, true);
    doc.addEventListener("scroll", onScroll, true);
    view.addEventListener("resize", close);
    view.addEventListener("blur", close);
    return () => {
      view.removeEventListener("keydown", onEscape, true);
      doc.removeEventListener("pointerdown", onPress, true);
      doc.removeEventListener("scroll", onScroll, true);
      view.removeEventListener("resize", close);
      view.removeEventListener("blur", close);
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        consume(event);
        show(true);
      } else if (event.key === "Home" || event.key === "End") {
        consume(event);
        show(true, event.key === "Home" ? 0 : last);
      } else if (isPrintable(event)) {
        consume(event);
        show(true, findTyped(event.key, selected) ?? selected);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        consume(event);
        setActive((i) => Math.min(last, i + 1));
        return;
      case "ArrowUp":
        consume(event);
        if (event.altKey) commit(active);
        else setActive((i) => Math.max(0, i - 1));
        return;
      case "Home":
      case "PageUp":
        consume(event);
        setActive(0);
        return;
      case "End":
      case "PageDown":
        consume(event);
        setActive(last);
        return;
      case "Enter":
        consume(event);
        commit(active);
        return;
      case "Tab":
        // Focus moves on as usual, taking the highlighted choice with it.
        commit(active);
        return;
      case " ":
        consume(event);
        // A space inside a word being typed is part of the search.
        if (Date.now() - typeahead.current.at < 500) {
          const match = findTyped(" ", active);
          if (match !== undefined) setActive(match);
        } else {
          commit(active);
        }
        return;
      default:
        if (isPrintable(event)) {
          consume(event);
          const match = findTyped(event.key, active);
          if (match !== undefined) setActive(match);
        }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sl-sp-select"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        // Ahead of the click that opens the list, so its entrance isn't skipped (see Segmented).
        onPointerDown={() => setInstant(false)}
        onClick={() => (open ? setOpen(false) : show(false))}
        onKeyDown={onKeyDown}
      >
        {/* Every label sits in one grid cell, so the button is as wide as the longest one and
            never changes width when the choice does. */}
        <span className="sl-sp-select-value">
          {options.map((opt, i) => (
            <span key={opt} data-current={i === selected || undefined} aria-hidden={i !== selected || undefined}>
              {labelOf(i)}
            </span>
          ))}
        </span>
        <svg className="sl-sp-select-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <ul
        ref={listRef}
        id={listId}
        className="sl-sp-listbox"
        role="listbox"
        aria-label={label}
        popover="manual"
        data-instant={instant || undefined}
        // Keeps focus on the button while an option is pressed.
        onMouseDown={(event) => event.preventDefault()}
      >
        {options.map((opt, i) => (
          <li
            key={opt}
            id={optionId(i)}
            role="option"
            className="sl-sp-option"
            aria-selected={i === selected}
            data-active={(open && i === active) || undefined}
            onPointerMove={() => active !== i && setActive(i)}
            onClick={() => commit(i)}
          >
            <span>{labelOf(i)}</span>
            <svg className="sl-sp-option-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6.25 5 8.75 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </li>
        ))}
      </ul>
    </>
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
  nudges,
  editable,
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
  /** Small and large steps for the -/+ buttons either side of the value. */
  nudges?: [number, number];
  /** Lets the value be typed in. */
  editable?: boolean;
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
  const commit = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  const nudge = (by: number) => (
    <button
      type="button"
      className="sl-sp-slider-nudge"
      onClick={() => commit(clamped + by)}
      disabled={disabled}
    >
      {by > 0 ? `+${by}` : by}
    </button>
  );

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
      <div className={`sl-sp-slider-meta${nudges ? " sl-sp-slider-meta--nudges" : ""}`}>
        {nudges ? (
          <div className="sl-sp-slider-nudges">
            {nudge(-nudges[1])}
            {nudge(-nudges[0])}
            {editable ? (
              <SliderValueInput
                value={clamped}
                text={`${sign}${clamped}`}
                unit={unit}
                label={label}
                disabled={disabled}
                onCommit={commit}
              />
            ) : (
              <span className="sl-sp-slider-value">{valueLabel}</span>
            )}
            {nudge(nudges[0])}
            {nudge(nudges[1])}
          </div>
        ) : editable ? (
          <SliderValueInput
            value={clamped}
            text={`${sign}${clamped}`}
            unit={unit}
            label={label}
            disabled={disabled}
            onCommit={commit}
          />
        ) : (
          <span className="sl-sp-slider-value">{valueLabel}</span>
        )}
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

/** The slider's value as a field, applied on Enter or blur. Anything that isn't a number puts the old value back. */
function SliderValueInput({
  value,
  text,
  unit,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  text: string;
  unit?: string;
  label?: string;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(text);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(text);
  }, [text]);

  const apply = () => {
    if (!editing.current) return;
    editing.current = false;
    const parsed = Number.parseInt(draft.replace(/[^\d+-]/g, ""), 10);
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    // A clamped or unchanged result wouldn't change `text`, so the draft is reset here too.
    setDraft(text);
  };

  return (
    <label className="sl-sp-slider-value sl-sp-slider-value--editable">
      <input
        type="text"
        inputMode="numeric"
        className="sl-sp-slider-value-input"
        aria-label={label}
        value={draft}
        size={Math.max(draft.length, 2)}
        disabled={disabled}
        onFocus={(e) => {
          editing.current = true;
          e.currentTarget.select();
        }}
        onChange={(e) => {
          editing.current = true;
          setDraft(e.currentTarget.value);
        }}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          apply();
          e.currentTarget.blur();
        }}
      />
      {unit && <span className="sl-sp-slider-value-unit">{unit}</span>}
    </label>
  );
}

/** A radio group shown side by side. The cells share one width, so the thumb moves by whole
 * cells: it glides when pressed and jumps when moved with the arrow keys. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label?: string;
  disabled?: boolean;
}) {
  const picked = Math.max(0, options.findIndex((opt) => opt.value === value));
  const [instant, setInstant] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const usable = (i: number) => !disabled && !options[i]?.disabled;

  const pick = (i: number, fromKeyboard: boolean) => {
    if (!usable(i)) return;
    setInstant(fromKeyboard);
    if (options[i].value !== value) onChange(options[i].value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = options.length;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    let target: number | undefined;
    if (step) {
      // Wraps around and skips choices that can't be picked, as native radio groups do.
      for (let k = 1; k < count && target === undefined; k++) {
        const i = (picked + step * k + count * k) % count;
        if (usable(i)) target = i;
      }
    } else if (event.key === "Home" || event.key === "End") {
      const order = [...options.keys()];
      target = (event.key === "Home" ? order : order.reverse()).find(usable);
    } else if (event.key === " " || event.key === "Enter") {
      // The focused choice is already the picked one; the key only has to stay out of Spotify's way.
      consume(event);
      return;
    }
    if (target === undefined) return;
    consume(event);
    pick(target, true);
    buttons.current[target]?.focus();
  };

  return (
    <div
      className="sl-sp-segmented"
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-instant={instant || undefined}
      onKeyDown={onKeyDown}
      // Cleared a render ahead of the move: dropping the flag in the same update as the thumb's
      // new position would skip its transition.
      onPointerDown={() => setInstant(false)}
    >
      <span
        className="sl-sp-segmented-thumb"
        aria-hidden="true"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${picked * 100}%)`,
        }}
      />
      {options.map((opt, i) => (
        <button
          key={opt.value}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          type="button"
          role="radio"
          className="sl-sp-segmented-option"
          aria-checked={i === picked}
          tabIndex={i === picked ? 0 : -1}
          disabled={disabled || opt.disabled}
          onClick={() => pick(i, false)}
        >
          {opt.label}
        </button>
      ))}
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
