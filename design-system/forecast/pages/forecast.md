# Forecast Cockpit Page Overrides

> **PROJECT:** Forecast (Red Light Creative)
> **Route:** `/release/[id]`
> **Page Type:** Dashboard / Data View — single-release working cockpit
> **Implemented by:** `app/release/[id]/page.tsx` + `components/release/*`
>
> Rules here **override** `design-system/forecast/MASTER.md`.
> Visual specimen: `design-system/forecast/reference-cockpit.jsx`.

---

## Page-Specific Rules

### Layout Overrides

- **Max width:** `max-w-6xl` (72rem), `px-5 py-8`. Same chrome as Active releases; do not go full-bleed.
- **Stack:** single column, `flex flex-col gap-6` (24px). No 12-column bento, no competing side rails inside the main column (sidebar is app chrome).
- **Section order (fixed):**
  1. Breadcrumbs (`Releases > {track}`)
  2. `ReleasePageHeader` — serif title `Track · Artist`, meta line, roster, status pill, close + report actions
  3. `LockedForecastBanner` — always; this is the hero
  4. `HealthBanner` — always (awaiting / on-track / outperforming / lagging)
  5. `MetricCards` — **only** when save velocity or live algo band exists
  6. `AdResultsStatus` — campaign ingest summary
  7. `ChannelMixForecast` — **only** when planned spend > 0; reuse `AdSpendLiveForecast`, no extra recommendation UI
  8. `FlagsPanel` — **omit** pre-release and when the flag list is empty
  9. `DailyEntrySection` — **only** after at least one day is entered
  10. `StreamCurveChart` — **only** when at least one actual stream exists
  11. `AlgoPositioningModule` — always (locked forecast bands)
  12. `GenrePlaybook` — always, last
- **Do not** add a page-level serif “Forecast” heading above the track title. The track is the page identity.

### Spacing Overrides

- **Density:** High. Header `pb-4`; module stack `gap-6`; inner module padding `p-4` / `p-5`; flag/health rows `py-2`–`py-2.5`.
- **Locked banner:** tighter than other cards (`px-4 py-3.5 md:px-5`) because figures are oversized.
- **Do not** insert marketing whitespace (48–96px) between modules.

### Typography Overrides

- **h1:** `font-serif text-release-title`. Artist sits in the same line at `font-normal text-secondary` after ` · `.
- **Hero figures:** Plex Mono `2.5rem` / 600 / `tabular-nums` / tracking `-0.02em`. Labels are `text-label uppercase text-muted`.
- **Variance / band copy:** same figure size; color from semantic tone, not accent lime.
- **Section titles stay sans.** Do not switch locked-banner or chart headers to serif.

### Color Overrides

- **Hero surface:** `bg-accent-tint` + `w-1` left bar `bg-accent`. No other module uses the tinted hero treatment.
- **Health left rule:** 3px, tone-mapped (`semantic-positive` / `warning` / `negative` / `muted`). Title text matches the rule.
- **Actuals row:** `bg-surface/50` on the comparison grid — not a second accent fill.
- **Algo active band:** `bg-accent-tint` + `border-l-[3px] border-l-accent`. Inactive bands `bg-canvas`.
- **Chart:** locked olive, actual near-black, projected info-blue, platform greens/blue per Master. Default-off series: marquee, showcase, meta, projected.

### Component Overrides

- Hide, don’t stub: metrics, flags, daily grid, stream chart, channel mix.
- Health is a **compact one-line banner**, not a four-tile KPI row.
- Flags are a **single bordered list** with 3px left rules and `StatusPill` + title + detail. 60ms stagger.
- Daily grid is a **spreadsheet**: 28 day columns, mono `text-xs` cells, width `w-14`, internal horizontal scroll. Save-state borders: warning pending, positive saved, negative error.
- Stream chart lives in a surface card with `ChartSeriesCards` as the legend/toggle — not a floating tooltip-only legend.
- Channel mix on this page is **readout only** (same cards as `/new`). Allocation advice belongs in data, not a second UI.

---

## Page-Specific Components

Compose these; do not inline their markup in `page.tsx`:

| Component | Role |
|-----------|------|
| `ReleasePageHeader` | Identity, status, close, report |
| `LockedForecastBanner` | Week-1 streams / saves / save rate ± actuals |
| `HealthBanner` | Monitoring verdict |
| `MetricCards` | Save velocity + live algo band |
| `AdResultsStatus` | Campaign ingest |
| `ChannelMixForecast` | Ad-model attributed metrics |
| `FlagsPanel` | Deviation flags |
| `DailyEntrySection` | Grid + CSV import |
| `StreamCurveChart` | 28-day locked / ads / projected / actual |
| `AlgoPositioningModule` | Weak–elite save bands |
| `GenrePlaybook` | Genre tactics |

New cockpit UI belongs in `components/release/`, not in `app/release/[id]/page.tsx`.

---

## Recommendations

- Pre-release: header + locked banner + health (awaiting) + algo + playbook. That is a complete page.
- After D1: health, flags, metrics, and the daily grid appear. The curve appears once actual streams exist.
- After week-1 completes: locked banner grows a Forecast / Actual / Difference grid. Keep the same hero; do not add a second scoreboard.
- Mobile: locked banner stacks metric blocks; comparison becomes a 3-column mini-grid per metric. Sidebar becomes the top drawer.
- Count-up stagger 50ms on hero figures; respect reduced motion via existing CSS tokens.
- Do not add a dark cockpit variant, a marketing hero, or a “product demo” video pattern on this route.
