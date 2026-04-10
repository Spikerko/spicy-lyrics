import React, { useEffect, useRef, useState } from "react";

export function matches(query: string, label: string, description?: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return label.toLowerCase().includes(q) || (description ?? "").toLowerCase().includes(q);
}

export function Row({
  label,
  description,
  children,
  disabled,
  disabledReason,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className={`sl-sp-row${disabled ? " sl-sp-row--disabled" : ""}`}>
      <div className="sl-sp-label-wrap">
        <span className="sl-sp-label">{label}</span>
        {description && <span className="sl-sp-description">{description}</span>}
      </div>
      <div className="sl-sp-control">{children}</div>
      {disabled && disabledReason && (
        <div className="sl-sp-row-tooltip">{disabledReason}</div>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="sl-sp-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="sl-sp-toggle-track" />
    </label>
  );
}

export function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="sl-sp-select"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="sl-sp-section-title">{children}</p>;
}

export function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sl-sp-search-wrap">
      <svg
        className="sl-sp-search-icon"
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        className="sl-sp-search"
        type="text"
        placeholder="Search settings…"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        spellCheck={false}
      />
      {value && (
        <button className="sl-sp-search-clear" onClick={() => onChange("")} aria-label="Clear search">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="sl-sp-tooltip-wrap">
      {children}
      <div className="sl-sp-tooltip-bubble">{text}</div>
    </div>
  );
}

export function FilterDropdown({
  sections,
  value,
  onChange,
}: {
  sections: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const allOptions = ["All", ...sections];

  return (
    <div className={`sl-sp-filter-wrap${open ? " sl-sp-filter-wrap--open" : ""}`} ref={ref}>
      <button
        className={`sl-sp-filter-btn${open ? " open" : ""}${value !== "All" ? " active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <svg
          className="sl-sp-filter-icon"
          width="13"
          height="12"
          viewBox="0 0 13 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M1 1h11M3 5h7M5 9h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="sl-sp-filter-label">{value === "All" ? "Filter" : value}</span>
        <svg
          className={`sl-sp-filter-chevron${open ? " rotated" : ""}`}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="sl-sp-filter-menu" role="listbox" onClick={(e) => e.stopPropagation()}>
          {allOptions.map((s) => {
            const isActive = value === s;
            return (
              <button
                key={s}
                role="option"
                aria-selected={isActive}
                className={`sl-sp-filter-item${isActive ? " sl-sp-filter-item--active" : ""}`}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                <span className="sl-sp-filter-item-check">
                  {isActive && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
