import React, { useState, useEffect } from "react";
import type { FontPack } from "./initial.tsx";

const FontPackView: React.FC<{
  pack: FontPack;
  onBack: () => void;
  direction: "left" | "right";
}> = ({ pack, onBack, direction }) => {
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(pack.data.sourceUrl)
      .then((res) => {
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("text/css")) {
          throw new Error("Font source is not of type text/css.");
        }
        return res.text();
      })
      .then((text) => {
        if (!cancelled) {
          setSource(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSource(
            err && err.message === "Font source is not of type text/css."
              ? "Error: Font source is not of type text/css."
              : "Failed to fetch font source."
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pack]);

  return (
    <div
      className={`fontpack-view animated-slide-in ${direction === "right" ? "from-right" : "from-left"}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        minHeight: "100%",
        background: "var(--spice-player)",
        zIndex: 2,
        padding: "2rem 1rem",
        boxSizing: "border-box",
        overflowY: "auto",
        transition: "transform 0.35s cubic-bezier(.4,0,.2,1), opacity 0.35s cubic-bezier(.4,0,.2,1)",
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "var(--spice-button)",
          fontWeight: 600,
          fontSize: "1.1rem",
          cursor: "pointer",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5em",
        }}
      >
        <span style={{ fontSize: "1.3em", lineHeight: 1, display: "inline-block", transform: "translateY(1px)" }}>←</span>
        Back to Font Packs
      </button>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "1.2rem" }}>
        <img
          src={pack.author.avatar}
          alt={pack.author.username}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            marginRight: "1rem",
            border: "2px solid var(--spice-highlight-elevated)",
            objectFit: "cover",
          }}
        />
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "1.3rem",
              color: "var(--spice-text)",
              fontFamily: `'${pack.data.fontName}', sans-serif`,
              marginBottom: "0.2rem",
            }}
          >
            {pack.name}
          </div>
          <div style={{ fontSize: "1.05rem", color: "var(--spice-subtext)" }}>
            by {pack.author.username}
          </div>
        </div>
      </div>
      <div style={{ fontSize: "1.05rem", color: "var(--spice-misc)", marginBottom: "1.2rem" }}>
        {pack.description}
      </div>
      <div
        style={{
          fontFamily: `'${pack.data.fontName}', sans-serif`,
          fontSize: "1.35rem",
          background: "var(--spice-card)",
          borderRadius: "0.5rem",
          padding: "0.7rem 1rem",
          color: "var(--spice-text)",
          marginBottom: "1.2rem",
          width: "100%",
          textAlign: "center",
          letterSpacing: "0.01em",
          border: "1px solid var(--spice-highlight)",
        }}
      >
        The quick brown fox jumps over the lazy dog.
      </div>
      <div style={{ marginBottom: "1.2rem" }}>
        <a
          href={pack.data.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "var(--spice-button)",
            textDecoration: "none",
            fontWeight: 500,
            fontSize: "1.05rem",
            transition: "color 0.15s",
          }}
        >
          Open Font Source in New Tab →
        </a>
      </div>
      <div>
        <div style={{ fontWeight: 600, marginBottom: "0.5rem", color: "var(--spice-text)" }}>
          Font Source:
        </div>
        <pre
          style={{
            background: "var(--spice-main-elevated)",
            color: "var(--spice-text)",
            borderRadius: "0.5rem",
            padding: "1rem",
            fontSize: "0.95rem",
            overflowX: "auto",
            border: "1px solid var(--spice-highlight-elevated)",
            minHeight: "120px",
            maxHeight: "40vh",
          }}
        >
          {loading ? "Loading..." : source}
        </pre>
      </div>
    </div>
  );
};


export default FontPackView;