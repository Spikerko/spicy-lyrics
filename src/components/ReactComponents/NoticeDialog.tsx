import React from "react";
import { flushSync } from "react-dom";
import ReactDOM from "react-dom/client";

// Same outlines as BRAND_MARK_PATHS in builds/main/entrypoint.mjs.
const BRAND_MARK_PATHS = [
  "M18.9962 5.00357C18.5208 4.52802 17.9233 4.19298 17.2696 4.03541C16.6159 3.87784 15.9313 3.90387 15.2915 4.11061C14.6516 4.31735 14.0813 4.69678 13.6433 5.20705C13.2054 5.71733 12.9169 6.33862 12.8097 7.00242L16.9973 11.1897C17.6611 11.0825 18.2824 10.794 18.7927 10.3561C19.303 9.91824 19.6825 9.34793 19.8893 8.7081C20.096 8.06827 20.122 7.38377 19.9645 6.73009C19.8069 6.07641 19.4718 5.47894 18.9962 5.00357ZM15.2227 12.153L11.845 8.77431C10.4947 10.3119 9.14443 11.8495 7.79421 13.3871L4.34436 17.3139C4.06732 17.6308 3.92106 18.0412 3.93518 18.4618C3.94929 18.8825 4.12273 19.2821 4.42039 19.5798C4.71804 19.8774 5.11767 20.0508 5.53838 20.0649C5.9591 20.0791 6.36945 19.9328 6.68639 19.6558L10.6328 16.1894L15.224 12.1543L15.2227 12.153ZM10.8636 6.96374C10.9806 5.9186 11.3904 4.92775 12.0457 4.10518C12.701 3.28261 13.5752 2.66176 14.5678 2.31407C15.5604 1.96638 16.631 1.90598 17.6564 2.13981C18.6818 2.37365 19.6203 2.89222 20.364 3.63586C21.1077 4.3795 21.6263 5.31798 21.8602 6.34331C22.094 7.36865 22.0336 8.43917 21.6859 9.43169C21.3382 10.4242 20.7173 11.2984 19.8947 11.9537C19.0721 12.6089 18.0811 13.0187 17.0359 13.1357L11.9108 17.6402L7.96445 21.1079C7.27835 21.7096 6.38902 22.0279 5.47687 21.9981C4.56473 21.9683 3.69808 21.5926 3.05275 20.9473C2.40742 20.302 2.03174 19.4354 2.00192 18.5234C1.97211 17.6113 2.29039 16.722 2.8922 16.0359L6.34334 12.1092L10.8636 6.96374Z",
  "M8.35932 0.380176C8.40765 0.249583 8.59235 0.249583 8.64068 0.380176L9.15129 1.76009C9.16648 1.80114 9.19886 1.83352 9.23991 1.84871L10.6198 2.35932C10.7504 2.40765 10.7504 2.59235 10.6198 2.64068L9.23991 3.15129C9.19886 3.16648 9.16648 3.19886 9.15129 3.23991L8.64068 4.61982C8.59235 4.75042 8.40765 4.75042 8.35932 4.61982L7.84871 3.23991C7.83352 3.19886 7.80114 3.16648 7.76009 3.15129L6.38018 2.64068C6.24958 2.59235 6.24958 2.40765 6.38018 2.35932L7.76009 1.84871C7.80114 1.83352 7.83352 1.80114 7.84871 1.76009L8.35932 0.380176Z",
  "M19.8593 14.3802C19.9076 14.2496 20.0924 14.2496 20.1407 14.3802L21.0564 16.855C21.0716 16.896 21.104 16.9284 21.145 16.9436L23.6198 17.8593C23.7504 17.9076 23.7504 18.0924 23.6198 18.1407L21.145 19.0564C21.104 19.0716 21.0716 19.104 21.0564 19.145L20.1407 21.6198C20.0924 21.7504 19.9076 21.7504 19.8593 21.6198L18.9436 19.145C18.9284 19.104 18.896 19.0716 18.855 19.0564L16.3802 18.1407C16.2496 18.0924 16.2496 17.9076 16.3802 17.8593L18.855 16.9436C18.896 16.9284 18.9284 16.896 18.9436 16.855L19.8593 14.3802Z",
  "M13.3593 18.3802C13.4076 18.2496 13.5924 18.2496 13.6407 18.3802L14.1513 19.7601C14.1665 19.8011 14.1989 19.8335 14.2399 19.8487L15.6198 20.3593C15.7504 20.4076 15.7504 20.5924 15.6198 20.6407L14.2399 21.1513C14.1989 21.1665 14.1665 21.1989 14.1513 21.2399L13.6407 22.6198C13.5924 22.7504 13.4076 22.7504 13.3593 22.6198L12.8487 21.2399C12.8335 21.1989 12.8011 21.1665 12.7601 21.1513L11.3802 20.6407C11.2496 20.5924 11.2496 20.4076 11.3802 20.3593L12.7601 19.8487C12.8011 19.8335 12.8335 19.8011 12.8487 19.7601L13.3593 18.3802Z",
  "M3.85932 3.38018C3.90765 3.24958 4.09235 3.24958 4.14068 3.38018L5.05643 5.85495C5.07162 5.89601 5.10399 5.92838 5.14505 5.94357L7.61982 6.85932C7.75042 6.90765 7.75042 7.09235 7.61982 7.14068L5.14505 8.05643C5.10399 8.07162 5.07162 8.10399 5.05643 8.14505L4.14068 10.6198C4.09235 10.7504 3.90765 10.7504 3.85932 10.6198L2.94357 8.14505C2.92838 8.10399 2.89601 8.07162 2.85495 8.05643L0.380176 7.14068C0.249583 7.09235 0.249583 6.90765 0.380176 6.85932L2.85495 5.94357C2.89601 5.92838 2.92838 5.89601 2.94357 5.85495L3.85932 3.38018Z",
];

const BrandMark = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {BRAND_MARK_PATHS.map((d) => (
      <path key={d.slice(0, 12)} d={d} />
    ))}
  </svg>
);

export const NoticeLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="sl-notice-link" href={href} target="_blank" rel="noreferrer">
    {children}
  </a>
);

export type NoticeOptions = {
  title: string;
  content: React.ReactElement<{ style?: React.CSSProperties }>[];
  primary: { label: string; onClick: () => void };
  secondaryLabel: string;
  /** Escape, a backdrop click, and the secondary button all land here. */
  onDismiss?: () => void;
  /** A box the dialog grows out of, like the toast that opened it. */
  origin?: DOMRect | null;
};

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const centerOf = (rect: DOMRect, width = rect.width) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
  width,
});

let closeActive: ((immediate?: boolean) => void) | null = null;

export function showNotice({ title, content, primary, secondaryLabel, onDismiss, origin }: NoticeOptions) {
  closeActive?.(true);

  const host = document.createElement("div");
  // body > div without an id or class is hidden by a global rule.
  host.className = "sl-notice-host";
  const root = ReactDOM.createRoot(host);
  const previousFocus = document.activeElement;
  let closed = false;
  // Only a press that starts and ends on the backdrop dismisses, so a text selection dragged outside doesn't.
  let pressedBackdrop = false;

  const close = (immediate = false) => {
    if (closed) return;
    closed = true;
    if (closeActive === close) closeActive = null;
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("focusin", onFocusIn);
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    const remove = () => {
      root.unmount();
      host.remove();
    };
    if (immediate) return remove();
    overlay.classList.add("is-closing");
    overlay.classList.remove("is-open");
    setTimeout(remove, 200);
  };

  const dismiss = () => {
    if (closed) return;
    close();
    onDismiss?.();
  };

  // Listens on the document, not the overlay: Spotify can take focus after startup, and the keys must still work.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // Keeps Spotify's own Escape shortcut from also firing.
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...overlay.querySelectorAll<HTMLElement>("a[href], button")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement as HTMLElement;
    if (event.shiftKey && (current === first || !focusable.includes(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !focusable.includes(current))) {
      event.preventDefault();
      first.focus();
    }
  };

  const onFocusIn = (event: FocusEvent) => {
    if (!overlay.contains(event.target as Node)) primaryButton.focus({ preventScroll: true });
  };

  const stagger = (index: number) => ({ "--sl-i": index }) as React.CSSProperties;

  flushSync(() => {
    root.render(
      <div
        className="sl-notice-overlay"
        onPointerDown={(event) => (pressedBackdrop = event.target === event.currentTarget)}
        onClick={(event) => {
          if (pressedBackdrop && event.target === event.currentTarget) dismiss();
        }}
      >
        <div className="sl-notice" role="dialog" aria-modal="true" aria-labelledby="sl-notice-title" tabIndex={-1}>
          <div className="sl-notice-mark">
            <BrandMark />
          </div>
          <div className="sl-notice-heading" style={stagger(0)}>
            <p className="sl-notice-brand">
              <BrandMark />
              Spicy Lyrics
            </p>
            <h2 className="sl-notice-title" id="sl-notice-title">
              {title}
            </h2>
          </div>
          {content.map((node, index) =>
            React.cloneElement(node, { key: index, style: { ...node.props.style, ...stagger(index + 1) } })
          )}
          <div className="sl-notice-actions" style={stagger(content.length + 1)}>
            <button type="button" className="sl-notice-button sl-notice-button--quiet" onClick={dismiss}>
              {secondaryLabel}
            </button>
            <button
              type="button"
              className="sl-notice-button sl-notice-button--primary"
              onClick={() => {
                close();
                primary.onClick();
              }}
            >
              {primary.label}
            </button>
          </div>
        </div>
      </div>
    );
  });

  const overlay = host.firstElementChild as HTMLElement;
  const dialog = overlay.firstElementChild as HTMLElement;
  const primaryButton = overlay.querySelector<HTMLElement>(".sl-notice-button--primary")!;
  document.body.append(host);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("focusin", onFocusIn);
  // Spotify blurs the page once while starting up, which drops focus to <body> without a focusin.
  overlay.addEventListener("focusout", (event) => {
    if (event.relatedTarget) return;
    setTimeout(() => {
      if (!closed && document.activeElement === document.body) primaryButton.focus({ preventScroll: true });
    });
  });
  overlay.getBoundingClientRect();
  overlay.classList.add("is-open");

  if (origin && !reducedMotion.matches) {
    const from = centerOf(dialog.getBoundingClientRect(), dialog.offsetWidth);
    const to = centerOf(origin);
    dialog.animate(
      [
        { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.width / from.width})`, opacity: 0 },
        { opacity: 1, offset: 0.35 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 420, easing: EASE_OUT }
    );
  }
  primaryButton.focus({ preventScroll: true });

  closeActive = close;
  return { close: () => close() };
}
