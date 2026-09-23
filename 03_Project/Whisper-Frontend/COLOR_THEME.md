# Whisper Color Theme

Source of truth: `src/app/globals.css`. The app now supports both a light and a dark
theme — `:root` holds the light palette, `.dark` holds the dark palette — switched via
`next-themes` (see "Theme switching" below).

Colors are authored in [OKLCH](https://oklch.com/) (perceptually uniform, better for
generating consistent shades than HSL/RGB). HEX equivalents below are provided for
convenience (Figma, Slack swatches, etc.) — they're a rendering of the OKLCH value,
not the source of truth, so if you ever see a mismatch, trust `globals.css`.

The light palette is a **polarity swap** of the dark palette (surfaces/text invert)
that keeps the same brand hues — violet primary (hue 292), cyan accent (hue 200) — so
the two themes read as the same brand, not two different apps.

## Theme switching

- Library: [`next-themes`](https://github.com/pacocoursey/next-themes), wired up in
  `src/components/providers.tsx`.
- Default: follows the OS `prefers-color-scheme` (`defaultTheme="system"`).
- Once a user picks a theme explicitly (via the toggle button in the header — sun/moon
  icon, next to the language switcher), it's persisted to `localStorage` and overrides
  the system preference on future visits.

## Core semantic colors

| Token | CSS variable | Light | Dark | Usage |
|---|---|---|---|---|
| Background | `--background` | `oklch(0.97 0.006 265)` `#F3F5F9` | `oklch(0.15 0.025 265)` `#060B16` | Page background |
| Foreground | `--foreground` | `oklch(0.2 0.03 265)` `#0F1624` | `oklch(0.96 0.01 260)` `#EEF2F9` | Default body text |
| Card | `--card` | `oklch(1 0 0)` `#FFFFFF` | `oklch(0.2 0.03 265)` `#0F1624` | Card/panel surface |
| Card foreground | `--card-foreground` | `oklch(0.2 0.03 265)` `#0F1624` | `oklch(0.96 0.01 260)` `#EEF2F9` | Text on cards |
| Popover | `--popover` | `oklch(0.995 0.003 265)` `#FCFDFF` | `oklch(0.19 0.03 265)` `#0D1321` | Dropdowns, dialogs, tooltips |
| Popover foreground | `--popover-foreground` | `oklch(0.2 0.03 265)` `#0F1624` | `oklch(0.96 0.01 260)` `#EEF2F9` | Text on popovers |
| Primary | `--primary` | `oklch(0.55 0.2 292)` `#7850DA` | `oklch(0.72 0.19 292)` `#A989FF` | Brand violet — primary buttons, links, active states |
| Primary foreground | `--primary-foreground` | `oklch(0.99 0.005 292)` `#FCFBFF` | `oklch(0.98 0.01 292)` `#F8F7FF` | Text/icons on primary-colored elements |
| Secondary | `--secondary` | `oklch(0.94 0.015 265)` `#E6EBF6` | `oklch(0.27 0.03 265)` `#1F2635` | Secondary buttons, subtle fills |
| Secondary foreground | `--secondary-foreground` | `oklch(0.22 0.03 265)` `#141A29` | `oklch(0.96 0.01 260)` `#EEF2F9` | Text on secondary elements |
| Muted | `--muted` | `oklch(0.95 0.012 265)` `#EAEFF7` | `oklch(0.25 0.03 265)` `#1B2130` | Low-emphasis backgrounds (skeletons, disabled fills) |
| Muted foreground | `--muted-foreground` | `oklch(0.48 0.02 260)` `#575E69` | `oklch(0.7 0.02 260)` `#979FAB` | Low-emphasis text (captions, placeholders) |
| Accent | `--accent` | `oklch(0.55 0.14 200)` `#008892` | `oklch(0.78 0.13 200)` `#17D0D8` | Cyan accent — secondary highlight, complements primary |
| Accent foreground | `--accent-foreground` | `oklch(0.98 0.01 200)` `#F1FBFB` | `oklch(0.15 0.03 200)` `#000F10` | Text/icons on accent-colored elements |
| Destructive | `--destructive` | `oklch(0.55 0.22 25)` `#D40924` | `oklch(0.66 0.22 25)` `#FC4447` | Errors, delete actions, destructive confirmations |
| Border | `--border` | `oklch(0 0 0 / 10%)` black @ 10% | `oklch(1 0 0 / 12%)` white @ 12% | Default hairline borders |
| Input | `--input` | `oklch(0 0 0 / 12%)` black @ 12% | `oklch(1 0 0 / 14%)` white @ 14% | Form input borders |
| Ring | `--ring` | `oklch(0.55 0.2 292 / 45%)` primary @ 45% | `oklch(0.72 0.19 292 / 60%)` primary @ 60% | Focus ring |

All light-theme colors were checked against WCAG contrast: body text ≈17:1, primary/accent
text on their own background ≈9-10:1, muted-foreground on background ≈14:1 — comfortably
above the 4.5:1 minimum for normal text.

## Chart colors

Used for data visualizations (e.g. usage/analytics charts). Reuses the brand palette
plus 3 additional hues for a 5-color categorical scale. Dark-theme values are brighter/
lighter to stay visible on a dark background; light-theme values are deepened so they
stay visible on white.

| Token | CSS variable | Light | Dark |
|---|---|---|---|
| Chart 1 | `--chart-1` | `oklch(0.55 0.2 292)` `#7850DA` (= primary) | `oklch(0.72 0.19 292)` `#A989FF` (= primary) |
| Chart 2 | `--chart-2` | `oklch(0.55 0.14 200)` `#008892` (= accent) | `oklch(0.78 0.13 200)` `#17D0D8` (= accent) |
| Chart 3 | `--chart-3` | `oklch(0.62 0.16 150)` `#20A04E` (green) | `oklch(0.8 0.15 150)` `#6ED889` (green) |
| Chart 4 | `--chart-4` | `oklch(0.62 0.18 60)` `#D16400` (orange) | `oklch(0.75 0.18 60)` `#FE8D00` (orange) |
| Chart 5 | `--chart-5` | `oklch(0.58 0.2 20)` `#D73246` (red) | `oklch(0.65 0.2 20)` `#F04C5A` (red) |

## Sidebar colors

A dedicated palette so the sidebar reads as a distinct surface from the main content
area (slightly lighter than the page background in both themes).

| Token | CSS variable | Light | Dark | Usage |
|---|---|---|---|---|
| Sidebar | `--sidebar` | `oklch(0.985 0.004 265)` `#F9FAFD` | `oklch(0.18 0.03 265)` `#0B111F` | Sidebar background |
| Sidebar foreground | `--sidebar-foreground` | `oklch(0.2 0.03 265)` `#0F1624` | `oklch(0.96 0.01 260)` `#EEF2F9` | Sidebar text |
| Sidebar primary | `--sidebar-primary` | `oklch(0.55 0.2 292)` `#7850DA` | `oklch(0.72 0.19 292)` `#A989FF` | Active/selected nav item |
| Sidebar primary foreground | `--sidebar-primary-foreground` | `oklch(0.99 0.005 292)` `#FCFBFF` | `oklch(0.98 0.01 292)` `#F8F7FF` | Text on active nav item |
| Sidebar accent | `--sidebar-accent` | `oklch(0.94 0.015 265)` `#E6EBF6` | `oklch(0.27 0.03 265)` `#1F2635` | Hover state on nav items |
| Sidebar accent foreground | `--sidebar-accent-foreground` | `oklch(0.22 0.03 265)` `#141A29` | `oklch(0.96 0.01 260)` `#EEF2F9` | Text on hovered nav item |
| Sidebar border | `--sidebar-border` | `oklch(0 0 0 / 8%)` black @ 8% | `oklch(1 0 0 / 10%)` white @ 10% | Sidebar divider line |
| Sidebar ring | `--sidebar-ring` | `oklch(0.55 0.2 292 / 45%)` primary @ 45% | `oklch(0.72 0.19 292 / 60%)` primary @ 60% | Focus ring inside sidebar |

## Other places color shows up

These aren't tokens, but they reuse the palette above and are worth knowing about:

- **Body background gradient** — two soft radial gradients, fixed to the dark theme's
  primary (25% opacity) and accent (15% opacity) values regardless of active theme —
  they still read as a pleasant subtle tint on the light background.
- **`.glass-panel`** — the translucent "liquid glass" card treatment. It has a genuinely
  different implementation per theme, not just different variables: dark mode floats a
  white-tinted pane (white at ~6–9% opacity) over the dark background; light mode floats
  a white pane (white at 70–85% opacity) with a black-tinted border/shadow instead,
  since white-on-white would be invisible.
- **`.glow-text`** — a soft `primary`-colored text-shadow (fixed to the dark theme's
  primary value), used sparingly for emphasis on the landing page headline.

## Notes

- No Tailwind config file — colors are wired up via Tailwind v4's CSS-native
  `@theme inline` block (also in `globals.css`), mapping each `--color-*` utility to
  the variables above. Use them in JSX as Tailwind classes, e.g. `bg-primary`,
  `text-muted-foreground`, `border-border`. Don't hardcode `border-white/10` or similar
  in components — it'll only look right in dark mode. Use the semantic token instead.
- Border/input/ring/sidebar-border/sidebar-ring are semi-transparent overlays (black in
  light mode, white in dark mode) rather than flat colors — their HEX is shown as the
  base color plus an opacity percentage, not a single flat swatch.
