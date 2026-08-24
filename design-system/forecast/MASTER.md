# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/forecast/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.
>
> Visual specimen: `design-system/forecast/reference-cockpit.jsx`.
> Implemented tokens live in `app/globals.css` and `tailwind.config.ts`. Those files win if this document drifts.

---

**Project:** Forecast (Red Light Creative)
**Edition:** Instrument Edition
**Category:** Internal monitoring tool — music release forecast + daily health
**Mode:** Light only. Do not add a dark theme.

---

## Philosophy

This is a **studio instrument**, not a consumer dashboard and not a music-entertainment brand site.

- Cool gray canvas, white surfaces, 1px borders, 4px corners.
- Chartreuse accent (`#C8E600`) is a **signal**, never body text.
- Numbers are IBM Plex Mono, page titles are Source Serif 4, UI is IBM Plex Sans.
- No drop shadows, no gradients, no glass, no emoji icons.
- Hide empty modules. Do not render placeholder cards.

Catalog-generated palettes (musical red, warm amber, Righteous/Poppins, dark-first SaaS) are **rejected**. Do not replace Instrument Edition tokens.

---

## Global Rules

### Color Palette

Use Tailwind token names (`bg-canvas`, `text-accent-readable`). Raw hex only in `globals.css`, `tailwind.config.ts`, and chart palettes that read CSS variables.

| Role | Hex | Tailwind | Notes |
|------|-----|----------|-------|
| Canvas | `#EDEEF1` | `canvas` | App background |
| Canvas subtle | `#F4F5F7` | `canvas-subtle` | Sidebar |
| Surface | `#FFFFFF` | `surface` | Cards, tables |
| Border | `#E2E6EB` | `border` | Card edges |
| Border subtle | `#ECEEF2` | `border-subtle` | Internal dividers, chart grid |
| Foreground | `#12151A` | `foreground` | Titles, figures, actuals |
| Secondary | `#545B66` | `secondary` | Body copy |
| Muted | `#868E98` | `muted` | Labels, captions, unused |
| Disabled | `#555555` | `disabled` | Disabled control text |
| Accent | `#C8E600` | `accent` | Left rules, selected fills, focus ring |
| Accent hover | `#B3CF00` | `accent-hover` | Hover on accent fills |
| Accent readable | `#5A6600` | `accent-readable` | Text on tint / links |
| Accent tint | `#F7FCE8` | `accent-tint` | Locked banner, selected chips, nav active |
| Accent border | `#DFEBA3` | `accent-border` | Selected chip outline |
| Positive | `#1F6B52` / `#ECF5F1` | `semantic-positive` / `-bg` | On track, above band |
| Warning | `#8A6400` / `#F8F3E4` | `semantic-warning` / `-bg` | Lagging save velocity |
| Negative | `#9B2335` / `#F9ECEE` | `semantic-negative` / `-bg` | Health lagging |
| Info | `#1565A8` / `#ECF2FA` | `semantic-info` / `-bg` | Flags, info series |
| Projected | `#1565A8` | `projected` | Live model line |

**Accent on white fails contrast.** Never put `#C8E600` on a white or canvas background as text. Use `accent-readable`. Never put white text on the lime fill.

### Chart series (fixed)

| Series | Hex | Token |
|--------|-----|-------|
| Locked organic | `#8FA800` | `chart-locked` |
| Spotify Marquee | `#1DB954` | `chart-spotify-marquee` |
| Spotify Showcase | `#0D7A3A` | `chart-spotify-showcase` |
| Meta ads | `#1877F2` | `chart-meta-ads` |
| Projected | `#1565A8` | `chart-projected` |
| Actual | `#12151A` | `chart-actual` |
| Grid / axis | `#ECEEF2` / `#868E98` | `chart-grid` / `chart-axis` |

Do not invent additional series colors. Brand platform greens/blues stay as chart identity only.

### Typography

Loaded in `app/layout.tsx`: Source Serif 4, IBM Plex Sans, IBM Plex Mono.

| Role | Font | Size token / value | Weight | Tracking |
|------|------|--------------------|--------|----------|
| Page title (h1) | Serif | `text-release-title` / 1.75rem / 1.2 | 600 | default |
| Section title (h2) | Sans | `text-section` / 1.0625rem / 1.3 | 600 | default |
| Metric figure | Mono | ~2.25–2.5rem / 1.1 | 600 | -0.02em, `tabular-nums` |
| Compact metric | Mono | `text-metric-value` / 1.75rem | 600 | tabular |
| Body | Sans | 0.875rem / 1.5 | 400 | default |
| Body small | Sans | `text-body-sm` / 0.8125rem / 1.5 | 400 | default |
| Caption | Sans | `text-caption` / 0.75rem / 1.4 | 400 | default |
| Label / overline | Sans | `text-label` / 0.6875rem | 500 | 0.06em uppercase |
| Micro label | Sans | 10px | 500 | 0.06–0.08em uppercase |
| Bracket tag | Mono | 10–13px | 600 | 0.04–0.05em |
| Grid cell | Mono | `text-xs` | 400 | tabular |

Artist name in an h1 is serif 400 + `text-secondary`, after a ` · ` separator.

### Spacing

Dense dashboard scale. Prefer 4px increments.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Chip padding, tight stacks |
| sm | 8px | Icon-to-label, pill gaps |
| md | 12px | Compact card padding, flag rows |
| lg | 16px | Standard card padding, header gap |
| xl | 20px | Page gutter (`px-5`), larger cards |
| 2xl | 24px | Section stack (`gap-6`), page-title margin |
| 3xl | 32px | Rare; list-to-table on dashboard (`mt-8`) |

Page chrome: `mx-auto max-w-6xl px-5 py-8` for working views. Forms use `max-w-3xl`. Sidebar is `w-56`.

### Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-instrument` | 4px | Cards, buttons, inputs, nav items |
| `rounded-tag` | 2px | Bracket tags, series checkboxes |
| `rounded-full` | pill | `StatusPill` only |

No `rounded-xl`, `rounded-2xl`, or `rounded-lg` on product UI.

### Elevation

**None.** Separation is border + surface-on-canvas. No `shadow-*`, no blur, no gradient fills.

---

## Component Specs

### Shell

- Internal routes wrap in `AppShell` → sticky `AppSidebar` (`bg-canvas-subtle`, 3px accent bar on the active item).
- Public routes (`/login`, `/report/*`, `/auth/*`) render without the sidebar.
- Wordmark: `/public/brand/forecast-wordmark.png` via `Wordmark`. Do not recreate in CSS.
- Mobile: 48px top bar + drawer. Content has `pt-12 md:pt-0`.

### Page header

```
h1.font-serif.text-release-title
border-b border-border pb-4
optional StatusPill top-right
breadcrumbs above, text-sm, ">" separators, links in accent-readable
```

### Section header

Use `SectionHeader`. h2 is sans `text-section`, optional caption is `text-sm text-muted`. Do not pair a serif title with a bracket tag.

### Cards / modules

```
rounded-instrument border border-border bg-surface
padding 16–20px (p-4 / p-5)
optional left 3px accent or semantic rule
optional motion-fade-up on first paint
```

Locked forecast is the exception: `bg-accent-tint` + 4px left accent bar (`w-1 bg-accent`).

### Status pill

`StatusPill` only. 10px medium, `rounded-full`, tone backgrounds from the semantic table. Do not invent new tones.

### Buttons

| Kind | Classes |
|------|---------|
| Primary (rare) | `bg-foreground text-canvas` |
| Secondary | `border border-border bg-surface text-secondary hover:text-foreground` |
| Destructive hover | secondary + `hover:border-semantic-negative/40 hover:text-semantic-negative` |
| Selected chip | `border-accent-border bg-accent-tint text-accent-readable` |
| Disabled | `opacity-50 cursor-not-allowed` (or `opacity-40` on solid primary) |

All clickable elements: `cursor-pointer`, `rounded-instrument`, visible focus (`focus:border-accent focus:ring-1 focus:ring-accent` on inputs). Min tap size 44px on mobile icon buttons.

### Inputs

`rounded-instrument border border-border bg-surface px-3 py-2 text-body-sm`. Focus as above. Errors: `text-caption text-semantic-negative` next to the field (`role="alert"`). Toggle groups use radio chips, not native selects, for closed enums (genre, editorial tier).

### Bracket tags

Use `.bracket-tag` / modifiers for axis labels, compact identity, and chart “today”. Not as a replacement for `SectionHeader` on working modules.

### Motion

Tokens in `:root`. Honor `prefers-reduced-motion` (durations already collapse to 0).

| Token | Duration | Easing | Use |
|-------|----------|--------|-----|
| count-up | 300ms | out-quart | Metric figures |
| enter | 250ms | out-quart | `motion-fade-up` |
| flag-in | 200ms | out-quart | Flag rows, 60ms stagger |
| flash | 400ms | out-quart | Recompute flash on cells |
| chart | 600ms | out-expo | Line draw |
| rule grow | 200ms | out-expo, 100ms delay | Left accent bar |

Do not add GSAP, scroll-jacking, or layout-shifting hovers. Scanline overlay (`.instrument-scanline`) is optional on dense interactive tables only.

### Icons

Inline 16×16 SVG, `strokeWidth="1.5"`, `currentColor`, `aria-hidden` when beside a label. Icon-only controls need an accessible name. One outline style. No emoji, no mixed icon packs, no raster UI icons (wordmark PNG is the exception).

---

## Style Guidelines

**Style:** Instrument / Swiss-minimal internal tool.

**Keywords:** Cool gray, chartreuse signal, serif titles, mono figures, dense, bordered, no shadow.

**Key effects:** 3px left rules, accent-tint selection, count-up on figures, 1px borders.

### Page pattern (default working view)

1. Breadcrumbs (detail pages)
2. Serif page header + status
3. Primary figure module
4. Conditional monitoring modules (omit when empty)
5. Reference modules last (playbook, algo bands)

---

## Anti-Patterns (Do NOT Use)

- Musical red / amber palettes, dark-first themes, glassmorphism, neon, gradients
- Drop shadows, large radius, colored card backgrounds except accent-tint / semantic-bg
- Lime (`#C8E600`) as text on white; white text on lime
- Emoji as icons; Lucide/Heroicons mixed into the 16px sidebar set
- Empty-state cards, skeleton theaters, “no data yet” hero modules
- Forecast math or Supabase calls inside presentational components
- New CSS variables that duplicate existing tokens
- `rounded-xl`, `shadow-md`, `bg-black`, `text-accent` for body copy
- Autoplaying motion; motion that ignores `prefers-reduced-motion`

---

## Pre-Delivery Checklist

- [ ] Tokens from this file / `globals.css` — no new hex in components (charts may read CSS variables)
- [ ] No shadows, no gradients, radius 4px (pills excepted)
- [ ] Accent-as-text uses `accent-readable`
- [ ] Empty modules omitted, not stubbed
- [ ] Figures: Plex Mono + `tabular-nums`
- [ ] Titles: Source Serif 4; sections: Plex Sans
- [ ] Focus rings visible; `cursor-pointer` on clickable elements
- [ ] `prefers-reduced-motion` still zeros durations
- [ ] 375 / 768 / 1024: no horizontal page scroll (grids may scroll internally)
- [ ] Contrast ≥ 4.5:1 for body text
