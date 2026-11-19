import { useStore } from "@nanostores/react";
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  listSystemFonts,
  pickFontFile,
  setCustomFontFamily,
  setCustomFontFile,
  useSystemFont,
} from "../../../utils/CustomFont.ts";
import { $customFont, $customFontFamily, $skipSpicyFont } from "../../../utils/stores.ts";

const EDGE = 8;
const GAP = 6;

type Item =
  | { kind: "default" }
  | { kind: "system" }
  | { kind: "file" }
  | { kind: "family"; name: string; typed?: boolean };

// Each font's row is set in that font; the actions stay in the panel's own.
function previewStyle(item: Item): React.CSSProperties | undefined {
  if (item.kind === "default") return { fontFamily: "SpicyLyrics, sans-serif" };
  if (item.kind === "family" && !item.typed) return { fontFamily: `"${item.name}", sans-serif` };
  return undefined;
}

const itemKey = (item: Item) => (item.kind === "family" ? `f:${item.name}` : item.kind);

/**
 * One control for the lyrics font: the Spicy Lyrics font, a font file, or an installed font
 * picked from a searchable list (or typed, for a name the list doesn't have). The list is a
 * top-layer popover like Select's, and uses its look.
 */
export function FontPicker({ label }: { label: string }) {
  const file = useStore($customFont);
  const family = useStore($customFontFamily);
  const skip = useStore($skipSpicyFont);
  const current = file || family || (skip ? "System font" : "Spicy Lyrics");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fonts, setFonts] = useState<string[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const listId = `sl-sp-fonts-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Why `active` last changed: only opening and the keyboard scroll the list, never the pointer
  // passing over it (that would make the rows slide away under the cursor).
  const scrollTo = useRef<"center" | "nearest" | null>(null);

  const items = useMemo<Item[]>(() => {
    const text = query.trim().toLowerCase();
    const matches = (fonts ?? []).filter((name) => name.toLowerCase().includes(text));
    const out: Item[] = [];
    if (!text) out.push({ kind: "default" }, { kind: "system" }, { kind: "file" });
    const exact = matches.some((name) => name.toLowerCase() === text);
    // The typed name goes after the matches so Enter takes the first real font; it leads only
    // when nothing matched.
    const typed: Item[] =
      text && !exact ? [{ kind: "family", name: query.trim(), typed: true }] : [];
    if (matches.length === 0) out.push(...typed);
    for (const name of matches) out.push({ kind: "family", name });
    if (matches.length > 0) out.push(...typed);
    return out;
  }, [fonts, query]);

  const isSelected = (item: Item) =>
    item.kind === "default"
      ? !file && !family && !skip
      : item.kind === "system"
        ? !file && !family && skip
        : item.kind === "file"
        ? !!file
        : !file && item.name === family;

  const close = () => setOpen(false);
  const applyFile = (picked: File) =>
    setCustomFontFile(picked).then(
      () => setError(""),
      (err) => setError(err?.message === "tooLarge" ? "Over 30 MB" : "Not a font file"),
    );
  const choose = (item: Item) => {
    close();
    if (item.kind === "file") {
      void pickFontFile().then((picked) => {
        if (picked === "unsupported") fileRef.current?.click();
        else if (picked) void applyFile(picked);
      });
      return;
    }
    setError("");
    if (item.kind === "system") void useSystemFont();
    else void setCustomFontFamily(item.kind === "default" ? "" : item.name);
  };

  const show = () => {
    setQuery("");
    setActive(0);
    setOpen(true);
    // The first call may ask the browser's permission; that needs this click's gesture.
    void listSystemFonts().then(setFonts);
  };

  // Decided once per opening and anchored to the edge next to the button, so the list only
  // grows or shrinks away from it as the search narrows and the fonts arrive.
  const place = () => {
    const trigger = triggerRef.current;
    const sheet = sheetRef.current;
    if (!trigger || !sheet) return;
    const view = trigger.ownerDocument.defaultView ?? window;
    const box = trigger.getBoundingClientRect();
    // A fixed width: while it fades out the sheet is laid out as a plain block, and one sized
    // by its contents would grow to the widest row and slide sideways.
    const width = Math.max(box.width, 280);
    sheet.style.width = `${width}px`;
    const roomBelow = view.innerHeight - box.bottom - GAP - EDGE;
    const roomAbove = box.top - GAP - EDGE;
    const above = roomBelow < 300 && roomAbove > roomBelow;
    sheet.dataset.placement = above ? "above" : "below";
    sheet.style.maxHeight = `${Math.max(160, Math.min(above ? roomAbove : roomBelow, 420))}px`;
    sheet.style.left = `${Math.min(Math.max(EDGE, box.right - width), view.innerWidth - width - EDGE)}px`;
    if (above) {
      sheet.style.top = "auto";
      sheet.style.bottom = `${view.innerHeight - box.top + GAP}px`;
    } else {
      sheet.style.bottom = "auto";
      sheet.style.top = `${box.bottom + GAP}px`;
    }
  };

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (open) {
      if (!sheet.matches(":popover-open")) sheet.showPopover();
      place();
      searchRef.current?.focus({ preventScroll: true });
    } else if (sheet.matches(":popover-open")) {
      sheet.hidePopover();
    }
  }, [open]);

  // Opening lands on the current choice, also once the font list arrives and moves it down.
  useEffect(() => {
    if (!open || query) return;
    const at = items.findIndex(isSelected);
    scrollTo.current = "center";
    setActive(at < 0 ? 0 : at);
  }, [open, fonts]);

  useEffect(() => {
    const block = scrollTo.current;
    scrollTo.current = null;
    if (open && block) {
      sheetRef.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block });
    }
  }, [open, active]);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) return;
    const doc = trigger.ownerDocument;
    const view = doc.defaultView ?? window;
    const onPress = (event: Event) => {
      const target = event.target as Node;
      if (!trigger.contains(target) && !sheetRef.current?.contains(target)) close();
    };
    const onScroll = (event: Event) => {
      if ((event.target as Node).contains?.(trigger)) close();
    };
    // The panel closes on Escape from a capturing document listener; the window's comes first.
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      trigger.focus();
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

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const last = items.length - 1;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === "ArrowDown" || event.key === "ArrowUp") scrollTo.current = "nearest";
    if (event.key === "ArrowDown") {
      stop();
      setActive((i) => Math.min(last, i + 1));
    } else if (event.key === "ArrowUp") {
      stop();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      stop();
      if (items[active]) choose(items[active]);
    } else if (event.key === "Tab") {
      close();
    }
  };

  const status =
    fonts === null
      ? "Loading installed fonts…"
      : fonts.length === 0
        ? "Installed fonts can't be listed here. Type a font name instead."
        : "";

  return (
    <>
      {error && <span className="sl-sp-fontpicker-error">{error}</span>}
      <button
        ref={triggerRef}
        type="button"
        className="sl-sp-select sl-sp-fontpicker-trigger"
        aria-label={`${label}: ${current}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? close() : show())}
      >
        <span className="sl-sp-fontpicker-value">{current}</span>
        <svg className="sl-sp-select-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        hidden
        onChange={(e) => {
          const picked = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!picked) return;
          void applyFile(picked);
        }}
      />
      <div
        ref={sheetRef}
        className="sl-sp-listbox sl-sp-fontlist"
        popover="manual"
        // Keeps focus in the search box while an option is pressed.
        onMouseDown={(event) => {
          if (event.target !== searchRef.current) event.preventDefault();
        }}
      >
        <input
          ref={searchRef}
          className="sl-sp-fontlist-search"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${listId}-options`}
          aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
          aria-label="Search installed fonts"
          placeholder="Search or type a font name"
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={onSearchKeyDown}
        />
        <ul id={`${listId}-options`} className="sl-sp-fontlist-options" role="listbox" aria-label={label}>
          {items.map((item, i) => (
            <Fragment key={itemKey(item)}>
            <li
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              className="sl-sp-option"
              aria-selected={isSelected(item)}
              data-active={i === active || undefined}
              onPointerMove={() => active !== i && setActive(i)}
              onClick={() => choose(item)}
            >
              <span style={previewStyle(item)}>
                {item.kind === "default"
                  ? "Spicy Lyrics (default)"
                  : item.kind === "system"
                    ? "System font"
                    : item.kind === "file"
                      ? "Choose a font file…"
                      : item.typed
                        ? `Use “${item.name}”`
                        : item.name}
              </span>
              <svg className="sl-sp-option-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 6.25 5 8.75 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </li>
            {item.kind === "file" && <li role="separator" className="sl-sp-fontlist-sep" />}
            </Fragment>
          ))}
          {status && <li className="sl-sp-fontlist-status">{status}</li>}
        </ul>
      </div>
    </>
  );
}
