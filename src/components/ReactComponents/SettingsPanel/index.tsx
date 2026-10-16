import { useStore } from "@nanostores/react";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { $experimentOverrides } from "../../../utils/experiments.ts";
import { PopupModal } from "../../Modal.ts";
import About, { useUpdateStatus } from "./About.tsx";
import { advancedSection } from "./AdvancedSection.tsx";
import { appearanceSection } from "./AppearanceSection.tsx";
import { backgroundSection } from "./BackgroundSection.tsx";
import { Highlight, PeekContext, Row, SearchBar } from "./components.tsx";
import { experimentsSection } from "./ExperimentsSection.tsx";
import { AboutIcon, ChevronIcon, CloseIcon, PeekIcon } from "./icons.tsx";
import { interfaceSection } from "./InterfaceSection.tsx";
import { lyricsSection } from "./LyricsSection.tsx";
import {
  matchesLabel,
  matchesSetting,
  type SectionDef,
  type SectionId,
  type SettingDef,
  searchTerms,
} from "./model.ts";
import { playbackSection } from "./PlaybackSection.tsx";

const aboutSection: SectionDef = {
  id: "about",
  title: "About",
  icon: AboutIcon,
  secondary: true,
};

const SECTIONS: SectionDef[] = [
  lyricsSection,
  backgroundSection,
  playbackSection,
  interfaceSection,
  appearanceSection,
  experimentsSection,
  advancedSection,
  aboutSection,
];

const sectionById = (id: SectionId) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];

// Reopening the panel lands on the tab it was closed on, for the rest of the session.
let lastTab: SectionId = SECTIONS[0].id;

const notDisabled = () => false as const;

// Peeking only helps when lyrics are actually behind the panel: the lyrics page or
// the NPV card in this window. Popup Lyrics lives in its own window.
const lyricsBehindPanel = () => !!document.querySelector("#SpicyLyricsPage");

function SettingRow({ def, query }: { def: SettingDef; query: string }) {
  const useDisabled = def.useDisabled ?? notDisabled;
  const reason = useDisabled();
  const useNote = def.useNote ?? notDisabled;
  const note = useNote();
  const label = <Highlight text={def.label} query={query} />;

  if (def.render) return <>{def.render(label)}</>;
  if (!def.Control) return null;

  const Control = def.Control;
  return (
    <Row
      label={label}
      description={def.description}
      stacked={def.stacked}
      disabled={!!reason}
      disabledReason={reason || undefined}
      note={note || undefined}
    >
      <Control disabled={!!reason} label={def.label} />
    </Row>
  );
}

interface SearchHit {
  section: SectionDef;
  settings: SettingDef[];
}

function search(query: string): SearchHit[] {
  return SECTIONS.flatMap((section) => {
    const matched = (section.groups?.() ?? []).flatMap((group) =>
      group.settings.filter((setting) => matchesSetting(query, setting))
    );
    // Label hits first, then description-only ones, each in the tab's own order.
    const settings = [
      ...matched.filter((setting) => matchesLabel(query, setting)),
      ...matched.filter((setting) => !matchesLabel(query, setting)),
    ];
    return settings.length > 0 ? [{ section, settings }] : [];
  });
}

export default function SettingsPanel() {
  // Experiments' rows are rebuilt from the overrides, so they re-render with them.
  useStore($experimentOverrides);

  const [tab, setTab] = useState<SectionId>(() => {
    sectionById(lastTab).onEnter?.();
    return lastTab;
  });
  const [query, setQuery] = useState("");
  // Pointer-driven tab changes get a short fade. Keyboard changes and typing
  // swap instantly: they repeat too often for motion to be anything but drag.
  const [instant, setInstant] = useState(true);
  const updateStatus = useUpdateStatus();

  // What the panel keeps while peeking: a row (a slider being dragged), or nothing.
  const [peek, setPeek] = useState<{ keep: HTMLElement | null } | null>(null);
  const canPeek = lyricsBehindPanel();
  const peekControls = useMemo(
    () => ({
      start: (keep: HTMLElement | null) => {
        if (lyricsBehindPanel()) setPeek({ keep });
      },
      end: () => setPeek(null),
    }),
    []
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<SectionId, HTMLButtonElement>());
  const queryRef = useRef(query);
  queryRef.current = query;

  const searching = searchTerms(query).length > 0;
  const hits = searching ? search(query) : [];
  const hitCount = hits.reduce((n, hit) => n + hit.settings.length, 0);
  const section = sectionById(tab);

  const select = (id: SectionId, viaKeyboard = false) => {
    if (id !== tab || searching) {
      if (id !== tab) sectionById(id).onEnter?.();
      lastTab = id;
      setTab(id);
      setQuery("");
      setInstant(viaKeyboard);
    }
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    setInstant(true);
  };

  // The overlay and the modal's glass sit outside the panel, so the state goes on
  // the overlay for settings-panel.css to clear them away.
  useLayoutEffect(() => {
    const overlay = rootRef.current?.closest(".sl-modal-overlay");
    if (!overlay || !peek) return;
    overlay.setAttribute("data-peek", peek.keep ? "row" : "all");
    peek.keep?.setAttribute("data-peek-keep", "");
    return () => {
      overlay.removeAttribute("data-peek");
      peek.keep?.removeAttribute("data-peek-keep");
    };
  }, [peek]);

  // A new page starts at its top.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    headerRef.current?.removeAttribute("data-scrolled");
  }, [tab, searching]);

  useEffect(() => {
    // The panel renders before the modal is attached, so focus has to wait a frame.
    const focusFrame = requestAnimationFrame(() =>
      searchRef.current?.focus({ preventScroll: true })
    );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Keeps Spotify's own Escape shortcut from also firing.
        event.preventDefault();
        event.stopImmediatePropagation();
        if (queryRef.current) setQuery("");
        else PopupModal.hide();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopImmediatePropagation();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    // Capture on the document: focus can sit anywhere, including outside the modal.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  // The header's hairline only shows once content has scrolled under it.
  const onScroll = () => {
    const scrolled = (scrollRef.current?.scrollTop ?? 0) > 0;
    const header = headerRef.current;
    if (header && header.hasAttribute("data-scrolled") !== scrolled) {
      header.toggleAttribute("data-scrolled", scrolled);
    }
  };

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    const order = SECTIONS.map((s) => s.id);
    const at = order.indexOf(tab);
    const next =
      event.key === "ArrowDown"
        ? order[(at + 1) % order.length]
        : event.key === "ArrowUp"
          ? order[(at - 1 + order.length) % order.length]
          : event.key === "Home"
            ? order[0]
            : event.key === "End"
              ? order[order.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    select(next, true);
    tabRefs.current.get(next)?.focus();
  };

  const renderTab = (s: SectionDef) => {
    const count = searching
      ? (hits.find((hit) => hit.section.id === s.id)?.settings.length ?? 0)
      : null;
    const active = !searching && s.id === tab;
    return (
      <button
        key={s.id}
        ref={(el) => {
          if (el) tabRefs.current.set(s.id, el);
          else tabRefs.current.delete(s.id);
        }}
        type="button"
        role="tab"
        id={`sl-sp-tab-${s.id}`}
        aria-selected={active}
        aria-controls="sl-sp-panel"
        tabIndex={s.id === tab ? 0 : -1}
        className="sl-sp-tab"
        data-active={active || undefined}
        data-empty={count === 0 || undefined}
        onClick={() => select(s.id)}
      >
        <span className="sl-sp-tab-icon">{s.icon}</span>
        <span className="sl-sp-tab-label">{s.title}</span>
        {count !== null && count > 0 && <span className="sl-sp-tab-count">{count}</span>}
        {count === null && s.id === "about" && updateStatus === "outdated" && (
          <span className="sl-sp-tab-dot" aria-label="Update available" />
        )}
      </button>
    );
  };

  const groups = section.groups?.() ?? [];
  const hasRows = groups.some((group) => group.settings.length > 0);
  const Accessory = section.Accessory;

  return (
    <PeekContext.Provider value={peekControls}>
    <div className="sl-sp" ref={rootRef}>
      <nav className="sl-sp-sidebar" aria-label="Settings sections">
        <div className="sl-sp-brand">
          <span className="sl-sp-brand-line">Spicy Lyrics</span>
          <h1 className="sl-sp-title">Settings</h1>
        </div>

        <SearchBar ref={searchRef} value={query} onChange={onQueryChange} />

        <div
          className="sl-sp-tabs"
          role="tablist"
          aria-orientation="vertical"
          onKeyDown={onTabKeyDown}
        >
          {SECTIONS.filter((s) => !s.secondary).map(renderTab)}
          <div className="sl-sp-tabs-divider" role="presentation" />
          {SECTIONS.filter((s) => s.secondary).map(renderTab)}
        </div>
      </nav>

      <section className="sl-sp-pane">
        <div className="sl-sp-pane-header" ref={headerRef}>
          <h2 className="sl-sp-pane-title">{searching ? "Results" : section.title}</h2>
          {searching ? (
            <span className="sl-sp-pane-count">
              {hitCount === 1 ? "1 setting" : `${hitCount} settings`}
            </span>
          ) : (
            Accessory && <Accessory />
          )}
          {canPeek && (
            <button
              type="button"
              className="sl-sp-peek"
              aria-label="Peek at the lyrics"
              title="Hold to see the lyrics behind the settings"
              aria-pressed={peek !== null && peek.keep === null}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                peekControls.start(null);
              }}
              onPointerUp={peekControls.end}
              onPointerCancel={peekControls.end}
              onLostPointerCapture={peekControls.end}
              onKeyDown={(event) => {
                if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                  event.preventDefault();
                  peekControls.start(null);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") peekControls.end();
              }}
              onBlur={peekControls.end}
            >
              {PeekIcon}
            </button>
          )}
          <button
            type="button"
            className="sl-sp-close"
            aria-label="Close settings"
            onClick={() => PopupModal.hide()}
          >
            {CloseIcon}
          </button>
        </div>

        <div
          className="sl-sp-pane-scroll"
          ref={scrollRef}
          onScroll={onScroll}
          id="sl-sp-panel"
          role="tabpanel"
          aria-labelledby={searching ? undefined : `sl-sp-tab-${tab}`}
          aria-label={searching ? "Search results" : undefined}
        >
          <div
            key={searching ? "search" : tab}
            className="sl-sp-pane-body"
            data-instant={instant || undefined}
          >
            {searching ? (
              hits.length > 0 ? (
                hits.map(({ section: s, settings }) => (
                  <div className="sl-sp-group" key={s.id}>
                    <button
                      type="button"
                      className="sl-sp-group-title sl-sp-group-link"
                      onClick={() => select(s.id)}
                    >
                      {s.title}
                      {ChevronIcon}
                    </button>
                    <div className="sl-sp-card">
                      {settings.map((def) => (
                        <SettingRow key={def.id} def={def} query={query} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="sl-sp-empty">
                  <p className="sl-sp-empty-title">No results for “{query.trim()}”</p>
                  <p className="sl-sp-empty-hint">Check the spelling, or try a shorter word.</p>
                </div>
              )
            ) : section.id === "about" ? (
              <About status={updateStatus} />
            ) : (
              <>
                {section.intro && <p className="sl-sp-intro">{section.intro}</p>}
                {hasRows ? (
                  groups.map((group, i) => (
                    <div className="sl-sp-group" key={group.title ?? i}>
                      {group.title && <h3 className="sl-sp-group-title">{group.title}</h3>}
                      <div className="sl-sp-card">
                        {group.settings.map((def) => (
                          <SettingRow key={def.id} def={def} query="" />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sl-sp-empty">
                    <p className="sl-sp-empty-title">{section.emptyText ?? "Nothing here yet."}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
    </PeekContext.Provider>
  );
}
