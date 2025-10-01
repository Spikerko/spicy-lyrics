export type FontPack = {
  name: string;
  author: {
    username: string;
    avatar: string;
  };
  description: string;
  id: string;
  data: {
    sourceUrl: string;
    fontName: string;
  };
};

const FontPacks: FontPack[] = [
  {
    name: "Spicy Lyrics",
    author: {
      username: "Spikerko",
      avatar: "https://github.com/Spikerko.png",    
    },
    description: "The default Spicy Lyrics font",
    id: "spicy-lyrics",
    data: {
      sourceUrl: "https://fonts.spikerko.org/spicy-lyrics/source.css",
      fontName: "SpicyLyrics",
    }
  },
  {
    name: "Groovy Sans",
    author: {
      username: "FontWizard",
      avatar: "https://randomuser.me/api/portraits/men/32.jpg",
    },
    description: "A groovy sans-serif font for modern vibes.",
    id: "groovy-sans-001",
    data: {
      sourceUrl: "https://fonts.spikerko.org/groovy-sans/source.css",
      fontName: "Groovy Sans",
    }
  },
  {
    name: "Retro Mono",
    author: {
      username: "TypewriterJane",
      avatar: "https://randomuser.me/api/portraits/women/44.jpg",
    },
    description: "Monospaced font inspired by vintage typewriters.",
    id: "retro-mono-002",
    data: {
      sourceUrl: "https://fonts.spikerko.org/retro-mono/source.css",
      fontName: "Retro Mono",
    }
  },
  {
    name: "Elegant Serif",
    author: {
      username: "SerifMaster",
      avatar: "https://randomuser.me/api/portraits/men/65.jpg",
    },
    description: "Classic serif font for a touch of elegance.",
    id: "elegant-serif-003",
    data: {
      sourceUrl: "https://fonts.spikerko.org/elegant-serif/source.css",
      fontName: "Elegant Serif",
    }
  },
  {
    name: "Pixel Pop",
    author: {
      username: "PixelPete",
      avatar: "https://randomuser.me/api/portraits/men/12.jpg",
    },
    description: "Fun pixel-style font for retro games and UIs.",
    id: "pixel-pop-004",
    data: {
      sourceUrl: "https://fonts.spikerko.org/pixel-pop/source.css",
      fontName: "Pixel Pop",
    }
  },
  {
    name: "Midnight Script",
    author: {
      username: "NightOwl",
      avatar: "https://randomuser.me/api/portraits/men/23.jpg",
    },
    description: "A flowing script font perfect for late-night vibes.",
    id: "midnight-script-005",
    data: {
      sourceUrl: "https://fonts.spikerko.org/midnight-script/source.css",
      fontName: "Midnight Script",
    }
  },
  {
    name: "Comic Quirk",
    author: {
      username: "ComicFan",
      avatar: "https://randomuser.me/api/portraits/women/55.jpg",
    },
    description: "Playful comic-style font for fun and casual designs.",
    id: "comic-quirk-006",
    data: {
      sourceUrl: "https://fonts.spikerko.org/comic-quirk/source.css",
      fontName: "Comic Quirk",
    }
  },
  {
    name: "Minimal Grotesk",
    author: {
      username: "Minimalist",
      avatar: "https://randomuser.me/api/portraits/men/77.jpg",
    },
    description: "Clean, modern grotesk font for minimal interfaces.",
    id: "minimal-grotesk-007",
    data: {
      sourceUrl: "https://fonts.spikerko.org/minimal-grotesk/source.css",
      fontName: "Minimal Grotesk",
    }
  },
  {
    name: "Sunshine Hand",
    author: {
      username: "SunnyDay",
      avatar: "https://randomuser.me/api/portraits/women/21.jpg",
    },
    description: "Handwritten font with a bright, cheerful style.",
    id: "sunshine-hand-008",
    data: {
      sourceUrl: "https://fonts.spikerko.org/sunshine-hand/source.css",
      fontName: "Sunshine Hand",
    }
  },
  {
    name: "Cyber Neon",
    author: {
      username: "NeonNerd",
      avatar: "https://randomuser.me/api/portraits/men/41.jpg",
    },
    description: "Futuristic neon font for cyberpunk aesthetics.",
    id: "cyber-neon-009",
    data: {
      sourceUrl: "https://fonts.spikerko.org/cyber-neon/source.css",
      fontName: "Cyber Neon",
    }
  },
  {
    name: "Classic Roman",
    author: {
      username: "HistoryBuff",
      avatar: "https://randomuser.me/api/portraits/men/19.jpg",
    },
    description: "Traditional Roman font for timeless designs.",
    id: "classic-roman-010",
    data: {
      sourceUrl: "https://fonts.spikerko.org/classic-roman/source.css",
      fontName: "Classic Roman",
    }
  },
  {
    name: "Bubble Pop",
    author: {
      username: "BubbleQueen",
      avatar: "https://randomuser.me/api/portraits/women/60.jpg",
    },
    description: "Rounded, bubbly font for playful interfaces.",
    id: "bubble-pop-011",
    data: {
      sourceUrl: "https://fonts.spikerko.org/bubble-pop/source.css",
      fontName: "Bubble Pop",
    }
  },
  {
    name: "Sharp Edge",
    author: {
      username: "EdgyGuy",
      avatar: "https://randomuser.me/api/portraits/men/88.jpg",
    },
    description: "Edgy, angular font for bold statements.",
    id: "sharp-edge-012",
    data: {
      sourceUrl: "https://fonts.spikerko.org/sharp-edge/source.css",
      fontName: "Sharp Edge",
    }
  },
  {
    name: "Pastel Dreams",
    author: {
      username: "Dreamer",
      avatar: "https://randomuser.me/api/portraits/women/33.jpg",
    },
    description: "Soft, pastel-inspired font for dreamy designs.",
    id: "pastel-dreams-013",
    data: {
      sourceUrl: "https://fonts.spikerko.org/pastel-dreams/source.css",
      fontName: "Pastel Dreams",
    }
  },
  {
    name: "Heavy Block",
    author: {
      username: "Blocky",
      avatar: "https://randomuser.me/api/portraits/men/53.jpg",
    },
    description: "Bold, blocky font for maximum impact.",
    id: "heavy-block-014",
    data: {
      sourceUrl: "https://fonts.spikerko.org/heavy-block/source.css",
      fontName: "Heavy Block",
    }
  }
]

import React, { useState, useRef, useEffect } from "react";
import FontPackView from "./FontPackView.tsx";

const FontPacksInitial: React.FC = () => {
  const [selectedPack, setSelectedPack] = useState<typeof FontPacks[0] | null>(null);
  const [transitionDir, setTransitionDir] = useState<"left" | "right">("right");
  const containerRef = useRef<HTMLDivElement>(null);

  // For accessibility, focus the container on transition
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus?.();
    }
  }, [selectedPack]);

  return (
    <div
      className="fontpack-anim-container"
      ref={containerRef}
      tabIndex={-1}
      style={{
        width: "100%",
        minHeight: "60vh",
        position: "relative",
      }}
    >
      {!selectedPack && (
        <div
          className="slm fontpack-grid-container w-50 animated-slide-in from-left"
          style={{
            maxHeight: "60vh",
            overflowY: "auto",
            padding: "1.5rem 0.5rem",
            background: "var(--spice-player)",
            transition: "transform 0.35s cubic-bezier(.4,0,.2,1), opacity 0.35s cubic-bezier(.4,0,.2,1)",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            className="fontpack-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {FontPacks.map((pack) => (
              <div
                key={pack.id}
                className="fontpack-card"
                style={{
                  background: "var(--spice-main-elevated)",
                  borderRadius: "1rem",
                  boxShadow: "0 2px 12px 0 rgba(var(--spice-rgb-shadow),0.12)",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  transition: "box-shadow 0.2s",
                  border: "1px solid var(--spice-highlight-elevated)",
                }}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    setTransitionDir("right");
                    setSelectedPack(pack);
                  }
                }}
                aria-label={`View details for ${pack.name}`}
              >
                <div style={{ display: "flex", alignItems: "center", marginBottom: "0.75rem" }}>
                  <img
                    src={pack.author.avatar}
                    alt={pack.author.username}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      marginRight: "0.75rem",
                      border: "2px solid var(--spice-highlight-elevated)",
                      objectFit: "cover",
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "1.1rem",
                        color: "var(--spice-text)",
                        fontFamily: `'${pack.data.fontName}', sans-serif`,
                        transition: "font-family 0.2s",
                      }}
                    >
                      {pack.name}
                    </div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        color: "var(--spice-subtext)",
                      }}
                    >
                      by {pack.author.username}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "0.98rem",
                    color: "var(--spice-misc)",
                    marginBottom: "0.7rem",
                    minHeight: "2.2em",
                  }}
                >
                  {pack.description}
                </div>
                <div
                  style={{
                    fontFamily: `'${pack.data.fontName}', sans-serif`,
                    fontSize: "1.25rem",
                    background: "var(--spice-card)",
                    borderRadius: "0.5rem",
                    padding: "0.5rem 0.75rem",
                    color: "var(--spice-text)",
                    marginBottom: "0.5rem",
                    width: "100%",
                    textAlign: "center",
                    letterSpacing: "0.01em",
                    border: "1px solid var(--spice-highlight)",
                  }}
                >
                  The quick brown fox jumps over the lazy dog.
                </div>
                <div
                  style={{
                    marginTop: "auto",
                    color: "var(--spice-button)",
                    textDecoration: "none",
                    fontWeight: 500,
                    fontSize: "0.98rem",
                    alignSelf: "flex-end",
                    transition: "color 0.15s",
                    cursor: "pointer",
                    opacity: 0.8,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransitionDir("right");
                    setSelectedPack(pack);
                  }}
                >
                  Click to view font source →
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedPack && (
        <FontPackView
          pack={selectedPack}
          onBack={(e) => {
            e.stopPropagation();
            setTransitionDir("left");
            setSelectedPack(null);
          }}
          direction={transitionDir}
        />
      )}
    </div>
  );
};

export default FontPacksInitial;