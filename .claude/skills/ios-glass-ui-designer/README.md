# iOS Glass UI Designer

A design skill that applies iOS material system with tasteful glass effects (translucency, blur, depth). Glass is used as a tool for hierarchy and focus — not as decoration.

## Design Philosophy

- **Native over custom** — System components feel right
- **Restraint over spectacle** — Glass is functional, not decorative
- **Material is hierarchy** — Translucency creates depth and context
- **"Feels obvious"** — Not "looks fancy"

## Design Example

![iOS Glass UI - Widgets](../../images/glass-ui.webp)

This iOS home screen demonstrates the glass material system in action:

### Glass Material Analysis

The widgets showcase how iOS uses translucency to create layered hierarchy:

1. **Weather Widget** — Ultra-thin glass material allows the vibrant background to show through while maintaining text legibility. The blur adapts to background complexity.

2. **Reminders Widget** — Regular material with higher opacity ensures list items remain scannable. The glass separates content from the busy background without harsh borders.

3. **Clock Widget** — Thick material provides strong contrast for the analog clock face, ensuring readability regardless of background.

4. **Control Center Grid** — Consistent glass treatment across icon buttons creates visual unity while letting background texture provide depth.

5. **Dock Icons** — Subtle glass backing on app icons maintains the layered feel without competing with widget content.

### Key Design Principles Demonstrated

| Principle | Implementation |
|-----------|----------------|
| **Material Hierarchy** | Different blur/opacity levels based on content needs |
| **Background Adaptation** | Glass intensity scales with background complexity |
| **Legibility First** | Text remains clear despite translucency |
| **Restraint** | Glass only where it aids hierarchy, not everywhere |
| **System Consistency** | All glass surfaces feel unified and native |
| **Depth Without Borders** | Separation achieved through material, not outlines |

### Typography Usage

- **Primary Numbers** — Large, bold SF Pro for temperature and date
- **Secondary Labels** — Regular weight for supporting information
- **List Items** — Consistent rhythm with comfortable line height

### Material Behavior

- Blur intensity responds to scroll and background changes
- Glass surfaces have subtle inner shadows for depth
- No harsh edges — materials fade naturally into surroundings

## When to Use This Skill

- iOS apps with layered UI (sheets, overlays, floating controls)
- Interfaces needing depth and material hierarchy
- Modern iOS aesthetic with restrained glassmorphism
- Widget-style interfaces
- Any UI that should feel like native iOS with depth

## Usage

```
ios-glass-ui-designer <your design request>
```

## See Also

- [SKILL.md](./SKILL.md) — Full design system specification
- [Apple Human Interface Guidelines - Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
