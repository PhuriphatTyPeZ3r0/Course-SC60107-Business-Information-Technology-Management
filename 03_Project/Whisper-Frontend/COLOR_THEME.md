# Whisper Color Theme

Source of truth: `src/app/globals.css`. All values are defined once under a combined
`:root, .dark` selector — **this app is dark-theme only**, there is no separate
light palette to switch to.

Colors are authored in [OKLCH](https://oklch.com/) (perceptually uniform, better for
generating consistent shades than HSL/RGB). HEX equivalents below are provided for
convenience (Figma, Slack swatches, etc.) — they're a rendering of the OKLCH value,
not the source of truth, so if you ever see a mismatch, trust `globals.css`.

## Core semantic colors

| Token | CSS variable | OKLCH | HEX | Usage |
|---|---|---|---|---|
| Background | `--background` | `oklch(0.15 0.025 265)` | `#060B16` | Page background (near-black indigo) |
| Foreground | `--foreground` | `oklch(0.96 0.01 260)` | `#EEF2F9` | Default body text |
| Card | `--card` | `oklch(0.2 0.03 265)` | `#0F1624` | Card/panel surface |
| Card foreground | `--card-foreground` | `oklch(0.96 0.01 260)` | `#EEF2F9` | Text on cards |
| Popover | `--popover` | `oklch(0.19 0.03 265)` | `#0D1321` | Dropdowns, dialogs, tooltips |
| Popover foreground | `--popover-foreground` | `oklch(0.96 0.01 260)` | `#EEF2F9` | Text on popovers |
| Primary | `--primary` | `oklch(0.72 0.19 292)` | `#A989FF` | Brand violet — primary buttons, links, active states |
| Primary foreground | `--primary-foreground` | `oklch(0.98 0.01 292)` | `#F8F7FF` | Text/icons on primary-colored elements |
| Secondary | `--secondary` | `oklch(0.27 0.03 265)` | `#1F2635` | Secondary buttons, subtle fills |
| Secondary foreground | `--secondary-foreground` | `oklch(0.96 0.01 260)` | `#EEF2F9` | Text on secondary elements |
| Muted | `--muted` | `oklch(0.25 0.03 265)` | `#1B2130` | Low-emphasis backgrounds (skeletons, disabled fills) |
| Muted foreground | `--muted-foreground` | `oklch(0.7 0.02 260)` | `#979FAB` | Low-emphasis text (captions, placeholders) |
| Accent | `--accent` | `oklch(0.78 0.13 200)` | `#17D0D8` | Cyan accent — secondary highlight, complements primary |
| Accent foreground | `--accent-foreground` | `oklch(0.15 0.03 200)` | `#000F10` | Text/icons on accent-colored elements |
| Destructive | `--destructive` | `oklch(0.66 0.22 25)` | `#FC4447` | Errors, delete actions, destructive confirmations |
| Border | `--border` | `oklch(1 0 0 / 12%)` | white @ 12% | Default hairline borders |
| Input | `--input` | `oklch(1 0 0 / 14%)` | white @ 14% | Form input borders |
| Ring | `--ring` | `oklch(0.72 0.19 292 / 60%)` | `#A989FF` @ 60% | Focus ring (primary at reduced opacity) |

## Chart colors

Used for data visualizations (e.g. usage/analytics charts). Reuses the brand palette
plus 3 additional hues for a 5-color categorical scale.

| Token | CSS variable | OKLCH | HEX |
|---|---|---|---|
| Chart 1 | `--chart-1` | `oklch(0.72 0.19 292)` | `#A989FF` (= primary) |
| Chart 2 | `--chart-2` | `oklch(0.78 0.13 200)` | `#17D0D8` (= accent) |
| Chart 3 | `--chart-3` | `oklch(0.8 0.15 150)` | `#6ED889` (green) |
| Chart 4 | `--chart-4` | `oklch(0.75 0.18 60)` | `#FE8D00` (orange) |
| Chart 5 | `--chart-5` | `oklch(0.65 0.2 20)` | `#F04C5A` (red) |

## Sidebar colors

A dedicated, slightly darker palette so the sidebar reads as a distinct surface from
the main content area.

| Token | CSS variable | OKLCH | HEX | Usage |
|---|---|---|---|---|
| Sidebar | `--sidebar` | `oklch(0.18 0.03 265)` | `#0B111F` | Sidebar background |
| Sidebar foreground | `--sidebar-foreground` | `oklch(0.96 0.01 260)` | `#EEF2F9` | Sidebar text |
| Sidebar primary | `--sidebar-primary` | `oklch(0.72 0.19 292)` | `#A989FF` | Active/selected nav item |
| Sidebar primary foreground | `--sidebar-primary-foreground` | `oklch(0.98 0.01 292)` | `#F8F7FF` | Text on active nav item |
| Sidebar accent | `--sidebar-accent` | `oklch(0.27 0.03 265)` | `#1F2635` | Hover state on nav items |
| Sidebar accent foreground | `--sidebar-accent-foreground` | `oklch(0.96 0.01 260)` | `#EEF2F9` | Text on hovered nav item |
| Sidebar border | `--sidebar-border` | `oklch(1 0 0 / 10%)` | white @ 10% | Sidebar divider line |
| Sidebar ring | `--sidebar-ring` | `oklch(0.72 0.19 292 / 60%)` | `#A989FF` @ 60% | Focus ring inside sidebar |

## Other places color shows up

These aren't tokens, but they reuse the palette above and are worth knowing about:

- **Body background gradient** — two soft radial gradients using `primary` (25% opacity)
  and `accent` (15% opacity) behind the page content.
- **`.glass-panel`** — the translucent "liquid glass" card treatment (white at ~6–9%
  opacity + blur), used for cards/panels throughout the dashboard.
- **`.glow-text`** — a soft `primary`-colored text-shadow, used sparingly for emphasis.

## Notes

- No Tailwind config file — colors are wired up via Tailwind v4's CSS-native
  `@theme inline` block (also in `globals.css`), mapping each `--color-*` utility to
  the variables above. Use them in JSX as Tailwind classes, e.g. `bg-primary`,
  `text-muted-foreground`, `border-border`.
- Border/input/ring/sidebar-border/sidebar-ring are semi-transparent whites layered
  over the dark background rather than flat colors — their HEX is shown as the base
  color plus an opacity percentage, not a single flat swatch.
