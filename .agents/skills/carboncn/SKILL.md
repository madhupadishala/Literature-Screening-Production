---
name: carboncn
description: >
  Build UIs with carboncn-design-system — IBM Carbon Design System components
  reimagined with shadcn/ui architecture. 75+ accessible components, 14 chart types,
  Tailwind CSS + Radix UI, IBM Plex fonts. Copy-paste, fully customizable, own your code.
license: MIT
metadata:
  version: "1.0.0"
---

# carboncn-design-system — shadcn/ui architecture on Carbon tokens

**Repository**: [GaragePlug-AI/carboncn-design-system](https://github.com/GaragePlug-AI/carboncn-design-system)

This is a **design system that combines IBM Carbon's design language with shadcn/ui's developer experience**. It reimplements Carbon components using shadcn/ui patterns: Radix UI primitives, Tailwind CSS, class-variance-authority, and copy-paste architecture.

## What you get

| Category | Components |
|----------|------------|
| **Actions** | 8 components (Button, ButtonGroup, IconButton, etc.) |
| **Forms** | 18 components (Input, Select, Checkbox, RadioGroup, Form, etc.) |
| **Navigation** | 8 components (Breadcrumb, NavigationMenu, Pagination, Tabs, etc.) |
| **Data Display** | 25+ components (DataTable, Card, Badge, Avatar, Tooltip, etc.) |
| **Feedback** | 6 components (Alert, Toast, Progress, Skeleton, etc.) |
| **Overlays** | 8 components (Dialog, Sheet, Popover, DropdownMenu, etc.) |
| **Layout** | 6 components (Container, Grid, Stack, Separator, etc.) |
| **Charts** | 14 Recharts-based (Bar, Line, Area, Pie, Donut, Gauge, Sparkline, Combo, Heatmap, Treemap, Radar, Funnel, Scatter, Waterfall) |

## Stack

- **React 18+**, TypeScript
- **Tailwind CSS** (with Carbon design tokens)
- **Radix UI** primitives (accessible, unstyled)
- **class-variance-authority** (cva) for variant APIs
- **IBM Plex Sans/Mono** fonts (built into Tailwind config)
- **Recharts** for data visualization
- **Lucide React** for icons

## Quick Start

```bash
# Clone the reference implementation
git clone https://github.com/GaragePlug-AI/carboncn-design-system.git
cd carboncn-design-system && npm install && npm run dev

# Or copy components into your project
# Components are in: src/components/ui/ and src/components/charts/
# Tailwind config: tailwind.config.ts
# Global styles: src/app/globals.css
```

## Key Files to Reference

| File | Purpose |
|------|---------|
| `tailwind.config.ts` | Carbon design tokens (colors, spacing, typography, border radius) |
| `src/app/globals.css` | CSS variables for theming (light/dark + 5 accents), IBM Plex fonts |
| `src/components/ui/` | 75+ shadcn-style components |
| `src/components/charts/` | 14 chart components |
| `src/lib/utils.ts` | `cn()` utility (clsx + tailwind-merge) |

## Usage in Your Project

```tsx
// Import like shadcn/ui
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { BarChart } from '@/components/charts/bar-chart'

// Use Carbon tokens via Tailwind
<div className="bg-carbon-gray-10 text-carbon-gray-90 p-4 rounded-lg">
  <Button variant="primary">Primary Action</Button>
</div>
```

## Carbon Design Tokens in Tailwind

The `tailwind.config.ts` exposes Carbon's design tokens:

- **Colors**: `carbon-gray-10` through `carbon-gray-100`, `carbon-blue-60`, `carbon-red-60`, etc.
- **Spacing**: Carbon's spacing scale (4px base)
- **Typography**: IBM Plex Sans/Mono with Carbon type scale
- **Border Radius**: Carbon's radius tokens
- **Shadows**: Carbon's elevation tokens

## Theming

- **Light/Dark mode** via CSS variables (`.light`, `.dark` classes)
- **5 accent colors**: blue, cyan, green, purple, red
- Switch themes by changing `data-theme` attribute or CSS class

## Accessibility

- WCAG 2.1 AA compliant
- Built on Radix UI primitives (ARIA attributes, keyboard navigation)
- Focus management, screen reader support

## Export Tool

The repo includes an **export tool** to download selected components + Tailwind config + global CSS + `PROMPT.md` for LLM integration.

## When to Use This Skill

Use this skill when:
- Building UIs with **IBM Carbon design language** but want **shadcn/ui DX**
- Need **accessible, customizable components** you own (copy-paste)
- Want **Carbon charts** (Recharts-based) for data visualization
- Building **dashboards, data tables, forms** for enterprise apps
- Need **light/dark theming** with Carbon tokens

## References

- **Live demo**: [carboncn-design-system.vercel.app](https://carboncn-design-system.vercel.app)
- **Repository**: [github.com/GaragePlug-AI/carboncn-design-system](https://github.com/GaragePlug-AI/carboncn-design-system)
- **Figma**: IBM Carbon Design System community file
- **Carbon docs**: [carbondesignsystem.com](https://carbondesignsystem.com)
- **shadcn/ui**: [ui.shadcn.com](https://ui.shadcn.com)

## License

MIT (combines Carbon Apache-2.0, IBM Plex SIL OFL, shadcn/ui MIT)