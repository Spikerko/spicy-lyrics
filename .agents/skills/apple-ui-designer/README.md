# Apple UI Designer

A design skill that applies iOS Human Interface Guidelines and modern Apple design language. Interfaces feel native, calm, and inevitable — like first-party Apple apps.

## Design Philosophy

- **Native over custom** — System components feel right
- **Subtle over expressive** — Confidence without noise
- **Calm and human** — Respectful of user attention
- **"Feels obvious"** — Not "looks fancy"

## Design Example

![Apple Music UX Case Study - Dock](../../images/apple.png)

This Apple Music "Now Playing" UX case study by Jaymie Gill demonstrates key principles of Apple-native design:

### Dock Pattern Analysis

The four screens showcase progressive disclosure and contextual UI expansion:

1. **Base State** — Clean playback controls with minimal chrome. Album art dominates the visual hierarchy.

2. **Up Next Reveal** — A subtle dock slides up from the bottom edge, showing the next track. Information appears only when needed.

3. **Audio Routing** — AirPods status and device indicators appear in a compact dock without disrupting the main interface.

4. **Expanded Sheet** — AirPlay device selection uses a native bottom sheet with clear hierarchy. Background content blurs to maintain focus.

### Key Design Principles Demonstrated

| Principle | Implementation |
|-----------|----------------|
| **Translucency & Depth** | Frosted glass effect on dock and sheets creates layered hierarchy |
| **Progressive Disclosure** | Information reveals contextually, not all at once |
| **System-like Components** | Native bottom sheets, standard control layouts |
| **Touch Target Clarity** | Large, comfortable hit areas for playback controls |
| **Color Restraint** | Accent color (pink) used sparingly for brand identity |
| **Gesture-first** | Swipe-up dock, drag-to-dismiss sheets |

### Typography Usage

- **Track Title** — Large, bold SF Pro Display for primary information
- **Artist & Album** — Regular weight, secondary gray for supporting details
- **Time & Status** — Small, monospace-style numerals for precision

### Motion & Interaction

- Dock slides with natural spring physics
- Background blur animates smoothly with sheet presentation
- All transitions feel calm and intentional

## When to Use This Skill

- iOS-native mobile apps
- Apps requiring Human Interface Guidelines compliance
- Native-feeling system UI components
- Music, media, or content playback interfaces
- Any interface that should feel "Apple-like"

## Usage

```
$apple-ui-designer <your design request>
```

## See Also

- [SKILL.md](./SKILL.md) — Full design system specification
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
