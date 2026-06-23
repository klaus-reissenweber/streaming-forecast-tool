# Streaming Forecast Platform — Build Scope

**Project:** Web-based forecasting and monitoring tool for music releases. Single-release focus, model retrains as new releases close.
**Owner:** Red Light Creative
**Build mode:** Claude Code
**Target:** Deployed at a public URL, source on GitHub, $0–20/mo infra cost

---

## What we're building

A web app that does three things in sequence for each music release:

1. **Forecasts** week-1 streams, saves, and channel-mix strategy from a small set of inputs (artist size, genre, feature status, expected editorial tier, planned ad spend).
2. **Monitors** the release daily by accepting actual stream/save/source-mix data and surfacing health flags + tactical responses.
3. **Learns** from each closed release by retraining the underlying regression coefficients and using them on the next release.

The current model is already fitted and characterized — coefficients, error bands, genre rates, and playbooks are all specified in this document. The build is taking the working prototype (see Claude artifact v3.2) and turning it into a persistent, deployable product.

## Scope — IN

- One active release at a time in the working view
- Pre-release forecast: streams + saves + paid social impressions/reach/clicks + channel mix recommendation
- Daily monitoring: enter actuals, see deviation flags + tactical responses
- Algorithmic positioning module (weak/typical/strong/elite save bands by tier)
- Persistent storage: releases and daily data points saved in DB
- Release archive (list of closed releases, browseable)
- Model retraining triggered when a release reaches 28 days
- Public deployment with simple URL
- Saves catalog data + current coefficients seeded on first run

## Scope — OUT (explicit, do not build)

- Multi-release simultaneous tracking (one active release, but archive of closed ones)
- User authentication, multi-user, or role-based permissions
- Client-facing vs marketer-facing split (one view; Red Light internal)
- Apify integration or any organic social prediction
- Spotify for Artists API integration (data entry is manual paste/typed)
- TikTok/Instagram performance modules
- Email notifications or scheduled reports
- Any feature that needs background workers or job schedulers
- Genres outside dubstep / house / jam-bass / downtempo / big-room

If something is desirable but not listed in IN, it's OUT for v1. Resist scope creep.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (React + TypeScript)** | One framework handles UI + routing + simple API routes. TypeScript catches data-model bugs early. |
| Database | **Supabase (Postgres)** | Free tier handles this scale. JS SDK means no separate backend server needed. Migrations are simple SQL. |
| Charts | **Chart.js or Recharts** | Mirror what the prototype uses. Pick one and stay consistent. |
| Styling | **Tailwind CSS** | Default for Next.js, fast to iterate. |
| Hosting | **Vercel** | Free, auto-deploys on Git push, perfect for Next.js. |
| Model training | **Python script run locally**, results pushed to Supabase | Avoid adding Python runtime to the production stack. The user runs `python retrain.py` after a release closes; script writes new coefficients to DB. |
| Source control | **GitHub** | User-owned repo, public or private. |

**Anti-patterns to avoid:**
- Do not add a separate Express/FastAPI backend. Supabase's JS SDK from the Next.js frontend is sufficient.
- Do not store model coefficients in code. They live in the DB so retraining updates them without redeploying.
- Do not use localStorage for release data. The DB is the source of truth.

## File structure

```
streaming-forecast/
├── README.md
├── SCOPE.md                    (this document)
├── seed/
│   ├── catalog.json            (35 historical tracks)
│   └── initial_coefficients.json
├── retrain/
│   ├── retrain.py              (local script to refit model)
│   └── requirements.txt
├── pages/
│   ├── index.tsx               (active release dashboard)
│   ├── new.tsx                 (create new release)
│   ├── release/[id].tsx        (single release view)
│   └── archive.tsx             (closed releases list)
├── components/
│   ├── ForecastCard.tsx
│   ├── DailyEntryGrid.tsx
│   ├── HealthBanner.tsx
│   ├── FlagsPanel.tsx
│   ├── StreamCurveChart.tsx
│   ├── AlgoPositioningModule.tsx
│   ├── GenrePlaybook.tsx
│   └── ChannelMixRecommendation.tsx
├── lib/
│   ├── supabase.ts             (DB client)
│   ├── forecast.ts             (all the math: streams, saves, ad lift)
│   ├── flags.ts                (deviation detection logic)
│   └── constants.ts            (curves, playbooks, bands)
└── styles/
    └── globals.css
```

## Data model

### Table: `releases`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `track_name` | text | "Is It Over Now?" |
| `artist_name` | text | "Elderbrook" |
| `genre` | text | Enum: dubstep, house, jam/bass, downtempo, big-room |
| `monthly_listeners` | bigint | Numeric, no formatting |
| `is_feature` | boolean | Solo vs feature/collab |
| `editorial_tier` | int | 0–3 (None, Small, Medium, Large) |
| `release_date` | date | Thursday assumed |
| `meta_spend_planned` | numeric | USD, planned |
| `meta_objective` | text | traffic / awareness / reach |
| `spotify_spend_planned` | numeric | USD, planned |
| `locked_forecast_streams` | int | Computed at creation, stored |
| `locked_forecast_saves` | int | Computed at creation, stored |
| `model_version_used` | uuid | FK to model_coefficients used at lock time |
| `status` | text | active / closed |
| `created_at` | timestamptz | |
| `closed_at` | timestamptz | Set when day 28 data entered |

### Table: `daily_data`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `release_id` | uuid | FK to releases |
| `day_number` | int | 1–28 |
| `streams` | int | |
| `saves` | int | |
| `other_pct` | numeric | Source-of-streams "Other" percentage |
| `recorded_at` | timestamptz | |

Unique constraint on `(release_id, day_number)`.

### Table: `model_coefficients`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `model_type` | text | streams_d0…d7, saves, ad_rates, stream_curve, save_rate_bands, algo_bands |
| `coefficients_json` | jsonb | The fitted betas + RMSE (or reference payload for non-regression types) |
| `r_squared` | numeric | |
| `sample_size` | int | Number of releases trained on |
| `fitted_at` | timestamptz | |
| `is_active` | boolean | Only one active per model_type at a time |

The frontend always reads `WHERE is_active = true` for each model_type. Retraining inserts a new row, then flips the old one's flag.

All model parameters including ad_rates are stored as rows in the model_coefficients table, distinguished by model_type. The coefficients_json column contains the actual data.

## Core modules to build

These mirror what the Claude artifact v3.2 already does. Build them as React components, fed by the DB.

### 1. Release creation form (`/new`)
Inputs: track name, artist, genre (5-option toggle), monthly listeners (slider), feature/collab toggle, editorial tier (4-option toggle), release date, planned Meta spend, Meta objective, planned Spotify spend.

On submit: compute forecasts using current active coefficients, save to `releases`, redirect to `/release/[id]`.

### 2. Active release dashboard (`/` and `/release/[id]`)
Top section: locked forecast banner (streams + saves + implied save rate + locked date).
Middle: daily data entry grid (D1–D28, three rows: streams, saves, other %).
Below grid: health banner (on track / outperforming / lagging), four metric cards (projected wk1, save velocity, algo positioning, model confidence), flags panel.
Bottom: stream curve chart with actuals, algo positioning module, source-of-streams "Other" trend chart, genre playbook reference.

### 3. Daily entry grid
Editable cells. On change: persist to `daily_data` (upsert by release_id + day_number), trigger re-render of metrics + flags + charts.

### 4. Forecast math (`lib/forecast.ts`)
Pure functions, no DB access:
- `predictStreams(inputs, coefficients)` — pre-release or day-by-day refinement
- `predictSaves(inputs, coefficients)`
- `predictAdImpact(inputs)` — Spotify + Meta
- `predictPaidDelivery(spend, objective)` — impressions, reach, clicks
- `algoPositioningBand(saves, tier)` — weak/typical/strong/elite

### 5. Flags logic (`lib/flags.ts`)
Pure function `computeFlags(release, dailyData)` returns array of `{type, title, detail}` objects. Mirror the artifact's flag rules:
- D1 streams >5× expected partial-day → positive flag
- Save velocity below 80% of typical floor → warning flag
- Save velocity above P90 → positive flag
- "Other" share trending up >10pts → info flag (paid converting)
- "Other" share trending down >3pts when started >10 → warning (paid stalling)
- Day 1 only entered → info flag (D2 is critical)

### 6. Algorithmic positioning module
Four-band visualization (weak/typical/strong/elite) with current projection highlighted. Bands change with artist tier. Includes interpretive text per band.

### 7. Channel mix recommendation
Compares Spotify rate (tier-based) vs Meta rate (genre × objective) and recommends allocation split. Logic identical to v3.2.

### 8. Release archive (`/archive`)
List view of closed releases. Each row: track, artist, locked forecast vs actual, save rate vs band. Click to drill into historical view.

## Model constants and coefficients

These seed the DB on first run. Stored in `seed/initial_coefficients.json`.

### Streams forecast (day-by-day refinement)

Predicts log(week-1 streams) using progressively more data:

```json
{
  "streams_d0": {"intercept": 5.4943, "log_ml": 0.4279, "feat": 0.6184, "ed_tier": 0.341, "rmse": 0.5066, "r2": 0.73},
  "streams_d1": {"intercept": 6.5889, "log_d1": 0.2431, "log_ml": 0.2422, "feat": 0.5054, "ed_tier": 0.3021, "rmse": 0.4658, "r2": 0.77},
  "streams_d2": {"intercept": 3.7329, "log_d2": 0.5721, "log_ml": 0.1447, "feat": 0.2102, "ed_tier": 0.1494, "rmse": 0.3312, "r2": 0.88},
  "streams_d3": {"intercept": 3.2202, "log_d3": 0.7414, "log_ml": 0.0779, "feat": 0.1568, "ed_tier": 0.0924, "rmse": 0.2795, "r2": 0.92},
  "streams_d4": {"intercept": 2.9198, "log_d4": 0.6764, "log_ml": 0.1509, "feat": 0.2898, "ed_tier": 0.1406, "rmse": 0.2021, "r2": 0.96},
  "streams_d5": {"intercept": 2.1991, "log_d5": 0.8087, "log_ml": 0.1197, "feat": 0.2694, "ed_tier": 0.0087, "rmse": 0.1627, "r2": 0.97},
  "streams_d6": {"intercept": 1.9087, "log_d6": 0.9065, "log_ml": 0.0734, "feat": 0.0281, "ed_tier": -0.0296, "rmse": 0.2416, "r2": 0.94},
  "streams_d7": {"intercept": 2.0962, "log_d7": 0.8559, "log_ml": 0.0868, "feat": 0.1305, "ed_tier": 0.0308, "rmse": 0.2309, "r2": 0.94}
}
```

Formula at day N (N=0 means pre-release): `streams_wk1 = exp(intercept + log(d_N)*log_dN + log(ML)*log_ml + feat*feat_coef + ed_tier*ed_coef)`.

### Saves forecast (genre-aware)

```json
{
  "saves": {
    "intercept": 3.5277,
    "log_ml": 0.3508,
    "feat": 0.1254,
    "ed_tier": 0.5908,
    "rmse": 0.7379,
    "r2": 0.68,
    "genre_offset": {
      "house": 0,
      "dubstep": 1.0885,
      "jam/bass": 0.5846,
      "downtempo": 0.1662,
      "big-room": -0.7494
    }
  }
}
```

### 28-day stream curve template (% of week-1 by day)

```json
{
  "curve_median": [0.5,27.2,16.0,11.7,13.6,14.0,14.4,14.4,12.5,9.3,7.4,8.6,10.3,9.5,9.5,9.8,8.1,6.4,7.4,7.3,7.8,7.7,8.1,7.4,6.2,6.6,7.4,7.6],
  "curve_p25":    [0.2,23.3,14.9,10.8,12.3,12.2,12.4,12.9,10.9,7.8,6.1,6.3,6.9,6.9,7.0,8.2,6.1,5.0,5.6,6.0,6.5,6.4,6.5,5.2,4.0,4.2,4.8,4.8],
  "curve_p75":    [0.7,31.7,18.2,13.5,15.5,15.4,17.1,16.3,14.5,12.3,9.8,10.6,11.7,10.7,10.7,13.1,10.2,8.2,9.5,10.1,10.6,10.2,12.5,10.2,7.4,8.8,9.3,9.7]
}
```

### Ad cost-per-stream rates

```json
{
  "spotify_rates_by_tier": {
    "developing": 0.04,
    "mid": 0.22,
    "established": 0.20
  },
  "meta_rates_by_genre": {
    "dubstep": 0.24,
    "jam/bass": 0.24,
    "house": 2.73,
    "big-room": 2.73,
    "downtempo": 14.69
  },
  "meta_objective_multipliers": {
    "traffic": 1.0,
    "awareness": 21.4,
    "reach": 8.9
  },
  "meta_delivery_per_objective": {
    "traffic":   {"cpm": 3.83, "cpr": 6.91, "cpc": 0.10},
    "awareness": {"cpm": 4.30, "cpr": 6.58, "cpc": 2.14},
    "reach":     {"cpm": 2.09, "cpr": 2.18, "cpc": 0.89}
  }
}
```

Tier definition: `ml < 500K = developing`, `500K ≤ ml < 2M = mid`, `ml ≥ 2M = established`.

### Save rate bands by genre (health benchmarks)

```json
{
  "save_bands": {
    "dubstep":   {"lo": 17, "hi": 22},
    "jam/bass":  {"lo": 13, "hi": 23},
    "house":     {"lo": 9,  "hi": 16},
    "big-room":  {"lo": 5,  "hi": 10},
    "downtempo": {"lo": 10, "hi": 16}
  }
}
```

### Algorithmic positioning bands (save count percentiles by tier)

```json
{
  "save_count_bands": {
    "developing":  {"p25": 3018,  "p50": 5341,  "p75": 9101,  "p90": 13116},
    "mid":         {"p25": 7545,  "p50": 12284, "p75": 22628, "p90": 42747},
    "established": {"p25": 19038, "p50": 32482, "p75": 53399, "p90": 71510}
  }
}
```

### Genre playbooks

Five genre playbook objects, each with `engine` description, `do` list (4 items), `avoid` list (2 items). Pull verbatim from the artifact v3.2 — see `components/GenrePlaybook.tsx` reference in the prototype.

## Retraining logic (`retrain/retrain.py`)

Runs locally when a release closes. Script flow:

1. Connect to Supabase.
2. Pull all `releases` where `status = 'closed'`, joined with their `daily_data`.
3. Compute week-1 totals (sum days 1–7), save counts, etc., per release.
4. Refit the regressions:
   - `log(wk1_streams) ~ log(ML) + feat + ed_tier` (pre-release model)
   - For each day N from 1 to 7: `log(wk1_streams) ~ log(d_N) + log(ML) + feat + ed_tier`
   - `log(wk1_saves) ~ log(ML) + feat + ed_tier + genre_dummies`
5. Compute new RMSE and R² for each model.
6. Insert new rows into `model_coefficients` with `is_active = true`; flip old rows to `is_active = false`.
7. Log a summary: which models updated, R² before/after, sample size before/after.

**Guardrails (important):**
- If new R² for a model is worse than current by more than 0.05, do not flip is_active — log a warning and keep old model. Manual override required.
- Minimum sample size to retrain: 40 releases. Below that, log "insufficient data, retain current model."
- Always keep history. Never DELETE from `model_coefficients`; only flip flags.

## Deployment

1. User creates GitHub repo, pushes Next.js skeleton.
2. Connect repo to Vercel.
3. Create Supabase project, run schema migration.
4. Add Supabase URL + anon key as Vercel environment variables.
5. Push to main → Vercel deploys.
6. URL works at `streaming-forecast.vercel.app` (or custom domain later).

Total setup time: 30–60 minutes once code is ready.

## Build sequence

Build in this order. Don't skip ahead. Each step should be working before moving to the next.

1. **Schema + seed.** Create Supabase project, write migration for the three tables, seed `model_coefficients` and any reference data. Verify by querying via Supabase dashboard.
2. **Forecast math library.** Pure TypeScript module with no UI. Write `lib/forecast.ts` and `lib/constants.ts`. Add a quick test page that calls the functions with known inputs and verifies outputs match the prototype.
3. **Release creation form.** Build `/new` with all inputs. On submit, compute forecast, write to DB, redirect.
4. **Active release view (pre-release state).** Pull release from DB by ID, render forecast + playbook + channel mix recommendation. No daily entry yet.
5. **Daily entry grid + persistence.** Add the 3×28 entry grid, persist on edit. No flags or live monitoring yet.
6. **Live monitoring features.** Health banner, metric cards, flags panel, stream curve chart with actuals, source-of-streams chart, algo positioning module. All driven from daily data.
7. **Archive view.** List closed releases.
8. **Retrain script.** Local Python script, manual run.
9. **Deploy.** Push to GitHub, connect Vercel, ship.

## Open questions

Things to decide during the build, not now:

- **Release status transition.** Does "closed" happen automatically when day 28 is entered, or is it a manual button? Recommend: automatic, but with a 7-day grace period before retraining can use it (in case data needs correction).
- **What happens to in-flight releases when model retrains?** Recommend: the model version used for a release's locked forecast is stored on the release row. Live monitoring uses the latest active model. Forecasts don't retroactively change.
- **How are releases archived from the active view?** Recommend: there's always exactly one "active" release shown on `/`. Others are in `/archive`. The active one is the most recently created non-closed release.
- **Multiple users editing the same release.** Out of scope for v1, but the DB design supports it cleanly if added later.
- **Mobile layout.** The prototype was desktop-focused. Decide during the UI build whether mobile is a requirement.

## Reference

The working prototype lives in the Claude conversation that produced this document. Every module described here exists in v3.2 of the artifact and can be referenced for exact UI behavior, color choices, copy, and edge-case handling. When in doubt, mirror the prototype.

The catalog of 35 historical tracks (used for seeding "comparable releases" in the prototype) should be exported from the same conversation as a JSON file and dropped into `seed/catalog.json`. Schema per track: `{title, artist, genre, week1_streams, monthly_listeners, is_feature, editorial_tier}`.
