# Model Retraining: Operator Spec

**Project:** Streaming Forecast Platform — offline model refit  
**Owner:** Red Light Creative  
**Run mode:** Manual, local Python script (`retrain/retrain.py`)  
**Target audience:** Operator (Klaus) running retrains after meaningful batches of closed releases

This document is the canonical spec for step 8. The Python modules in `retrain/` implement against it. Runtime forecast math lives in `lib/forecast.ts`; band constants used by flags and monitoring live in `lib/constants.ts`.

---

## Overview

The retraining script pulls all **closed** releases and their **daily_data** from Supabase, rebuilds regression coefficients and derived bands from actual week-1 outcomes, runs guardrails against the currently active model, and — if everything passes — promotes a new model version in `model_coefficients` while syncing band values into `lib/constants.ts`.

The platform does **not** auto-retrain. The operator runs the script manually when there is a meaningful batch of new closed releases (typically 10+ since the last retrain; hard minimum is 40 eligible releases after outlier exclusion).

**Design principles:**

- Closed releases only (`status = 'closed'`).
- Never delete from `model_coefficients`; only insert new rows and flip `is_active` flags.
- Reject the **whole batch** if any guardrail fails — model components are interconnected.
- Meta cost-per-stream rates are **held fixed in v1** (no actual spend or attribution in the DB yet).
- Regression coefficients and Spotify CPS rates are DB-authoritative at runtime; band thresholds are duplicated in `lib/constants.ts` until a future refactor loads them from the DB.

---

## When to run

Run a retrain when **all** of the following are true:

1. **Enough new data.** The archive summary at `/archive` shows a meaningful increase in retrain-eligible releases since the last successful run. Rule of thumb: **10+ new** complete wk1 releases; hard floor is **40 eligible releases** after Cook's-distance outlier exclusion.
2. **Data quality verified.** Recently closed releases have complete D1–D7 stream entry and plausible saves. Fix bad rows in Supabase before retraining — the script does not correct data entry errors.
3. **Intentional timing.** In-flight active releases keep their locked forecast (`model_version_used` on the release row). Retraining only affects **new** release creation and live monitoring that reads the latest active coefficients.

Do **not** run if:

- Fewer than 40 closed releases have complete wk1 stream data (7 days entered).
- You are mid-correction on daily_data for recently closed releases.
- You only want to inspect fit quality — use `--dry-run` instead of skipping guardrails.

---

## Prerequisites

### Environment

Create `retrain/.env.local` (gitignored; never commit):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- **`NEXT_PUBLIC_SUPABASE_URL`** — same project URL as the Next.js app.
- **`SUPABASE_SERVICE_ROLE_KEY`** — service role key, used **only** by this script. Bypasses RLS for writes to `model_coefficients`. Not used by the deployed platform.

### Python setup

```bash
cd retrain
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Golden fixture (parity check)

Before trusting production output, `dataset.py` must reproduce TypeScript aggregation for the Elderbrook fixture:

| Metric | Expected |
|---|---|
| Wk1 streams (sum D1–D7) | **452,848** |
| Wk1 saves (sum D1–D7) | **19,954** |

Source: `lib/fixtures/elderbrook-monitoring.ts`, validated by `scripts/validate-archive-elderbrook.ts`.

---

## What gets refit

### Regression models (always)

Eight stream refinement models plus one saves model. Shapes must match `lib/forecast.ts` (`RegressionModel`, `SavesModel`).

| `model_type` | Formula (OLS on log targets) | Sample |
|---|---|---|
| `streams_d0` | `log(wk1_streams) ~ log(ML) + feat + ed_tier` | All eligible releases |
| `streams_d1` … `streams_d7` | `log(wk1_streams) ~ log(d_N) + log(ML) + feat + ed_tier` | Eligible releases where day N `streams > 0` |
| `saves` | `log(wk1_saves) ~ log(ML) + feat + ed_tier + genre_dummies` | All eligible releases with wk1 saves > 0 |

Where:

- `wk1_streams` = sum of `daily_data.streams` for days 1–7
- `wk1_saves` = sum of `daily_data.saves` for days 1–7
- `log(ML)` = `log(monthly_listeners)`
- `feat` = `1` if `is_feature`, else `0`
- `ed_tier` = `editorial_tier` (0–3)
- `log(d_N)` = `log(streams on day N)` when day N stream > 0
- Genre dummies: **`house` is the reference category** (`genre_offset.house = 0`); other genres store offset coefficients

Each regression row stores in `coefficients_json`:

```json
{
  "intercept": 5.4943,
  "log_ml": 0.4279,
  "feat": 0.6184,
  "ed_tier": 0.341,
  "rmse": 0.5066,
  "r2": 0.73
}
```

Day-N models add `"log_dN": <coefficient>`. The saves model adds `"genre_offset": { "house": 0, "dubstep": 1.0885, ... }`.

### Derived bands (always)

Computed from the **same filtered training set** used for regressions (post–Cook's-D exclusion).

| `model_type` | Derivation | Synced to `lib/constants.ts` |
|---|---|---|
| `algo_bands` | Wk1 save count percentiles (p25, p50, p75, p90) **by artist tier** | `SAVE_COUNT_BANDS` |
| `save_rate_bands` | Save rate `(saves/streams)*100` lo/hi per genre (implementation: p10/p90 or documented percentiles) | `SAVE_RATE_BANDS` |
| `stream_curve` | Daily stream % of wk1 total: median, p25, p75 across releases (days 1–28 where data exists) | `STREAM_CURVE_TEMPLATE` |

Artist tier thresholds (must match `lib/constants.ts`):

- `developing`: monthly listeners < 500,000
- `mid`: 500,000 ≤ ML < 2,000,000
- `established`: ML ≥ 2,000,000

### Ad rates (partial — v1)

| Field | v1 behavior |
|---|---|
| **Spotify CPS matrix** | Recomputed from releases where `spotify_spend_planned > 0`: CPS = spend / wk1_streams, aggregated by `(release_type, spotify_format, tier)`. Null cells retain fallback logic at runtime (`lib/forecast.ts`). Written to `ad_rates` row. |
| **Meta rates by genre** | **Held fixed.** Copied from current active `ad_rates` row unchanged. |
| **Meta objective multipliers** | Held fixed (copied from active row). |
| **Meta delivery per objective** | Held fixed (copied from active row). |

`META_RATES_BY_GENRE` in `lib/constants.ts` is **not** updated in v1. Runtime reads Meta rates from the DB `ad_rates` row; constants are fallback only.

When daily_data or a future `campaign_data` table captures Meta actuals and attribution, Meta rate retraining can be added as a v2 spec change.

---

## Data eligibility

A release enters the training pool when:

1. `releases.status = 'closed'`
2. All seven stream days (D1–D7) have non-null, non-negative values — matches `computeWeek1Actuals().isComplete` in `lib/compute-week1-actuals.ts` and the archive's **retrain-eligible** count.

Releases missing partial wk1 data are excluded and logged. The script does not impute missing days.

After the initial pool is built, **Cook's distance outlier exclusion** runs (see Guardrails). The post-exclusion count must be ≥ 40 or the retrain is rejected.

---

## Guardrails

All guardrails must pass for promotion. Failure rejects the **entire batch** — no partial updates.

### 1. Minimum sample size

- **Threshold:** `n ≥ 40` eligible releases after Cook's-D exclusion.
- **On failure:** Exit with reason `insufficient_sample`. Keep all active coefficients unchanged. Do not insert promoted rows.

### 2. Cook's distance (outlier exclusion)

Standard regression diagnostics:

1. Fit each regression model on the full eligible pool.
2. Compute Cook's distance per release (per model).
3. Flag releases where Cook's D exceeds threshold (default: `4/n`; configurable in `config.py`).
4. **Log each outlier:** `release_id`, track name, artist name, model, Cook's D value.
5. **Exclude** flagged releases from the training set and **refit** all models on the remaining data.
6. If post-exclusion `n < 40`, reject the retrain.

Outlier exclusion is per-model during detection, but the final training set is the intersection: a release excluded by any model's outlier pass is removed from all fits (ensures consistent sample across the batch).

### 3. R² degradation check

For each regression model (`streams_d0`…`streams_d7`, `saves`):

- Load R² from the currently active row in `model_coefficients`.
- Compare to newly fitted R².
- **Reject if** new R² is more than **0.05 below** the active value for **any** model.

On failure: insert new rows with `is_active = false` (audit trail), log per-model before/after R², keep active model unchanged. Manual investigation required; use `--force` only with explicit operator intent.

Non-regression types (`algo_bands`, `save_rate_bands`, `stream_curve`, Spotify portion of `ad_rates`) do not have R² guardrails — they are descriptive statistics of the training set.

### 4. Reproducibility validation

Before any DB write:

1. Run the full fit pipeline twice on identical filtered data with fixed random seed (OLS is deterministic; this catches floating-point or ordering bugs).
2. Coefficients, RMSE, R², and derived bands must match within tolerance (`1e-10` relative or absolute per `config.py`).
3. On mismatch: abort with `reproducibility_failed`. Do not write to DB.

---

## Database write and promotion

### Tables

**`model_coefficients`**

| Column | Usage |
|---|---|
| `model_type` | `streams_d0`…`streams_d7`, `saves`, `ad_rates`, `stream_curve`, `save_rate_bands`, `algo_bands` |
| `coefficients_json` | Fitted payload (see shapes in `lib/forecast.ts` and `lib/load-forecast-data.ts`) |
| `r_squared` | Set for regression models; `null` for band/rate reference types |
| `sample_size` | Count of releases in final training set |
| `fitted_at` | Timestamp of this run |
| `is_active` | Only one active row per `model_type` |

### Promotion sequence

1. **Fit + guardrails** on local data (no writes during `--dry-run`).
2. **Insert** all new rows with `is_active = false`.
3. **Re-validate** guardrails against inserted payloads (optional sanity check).
4. If all pass: **promote** in one logical operation:
   - Set `is_active = false` on all previously active rows for affected `model_type`s.
   - Set `is_active = true` on the newly inserted rows.
5. If any guardrail fails after insert: leave new rows inactive; active model unchanged.

**Never DELETE** from `model_coefficients`.

### In-flight releases

- Locked forecasts on existing releases use `releases.model_version_used` — they do not retroactively change.
- New releases created after promotion use the new active `streams_d0` id as `model_version_used`.
- Live monitoring reads the latest active coefficients via `loadForecastData()`.

---

## `lib/constants.ts` sync

Band and stream-curve values are **hardcoded at runtime** for flags, monitoring, and archive pills (`SAVE_COUNT_BANDS`, `SAVE_RATE_BANDS`, `STREAM_CURVE_TEMPLATE`). After a successful DB promotion, `constants_sync.py` patches these blocks in `lib/constants.ts` using **marker comments** (deterministic, not regex over arbitrary file content).

Marker format (to be added by `constants_sync.py` on first run):

```typescript
// RETRAIN:SAVE_COUNT_BANDS:START
export const SAVE_COUNT_BANDS = { ... } as const;
// RETRAIN:SAVE_COUNT_BANDS:END
```

The operator reviews the git diff on `lib/constants.ts` and commits it alongside noting the new model version. **`META_RATES_BY_GENRE` is not patched in v1.**

---

## Operator workflow

```bash
# 1. Check archive
#    Open /archive → note "retrain-eligible" count (complete wk1 data)

# 2. Dry run
cd retrain
source .venv/bin/activate
python retrain.py --dry-run

# 3. Review stdout summary:
#    - sample size before/after outlier exclusion
#    - outliers logged (track, artist, id)
#    - R² before/after per model
#    - band deltas (high level)

# 4. Live run
python retrain.py

# 5. Review git diff
git diff lib/constants.ts

# 6. Validate output shapes (after validate-retrain-output.ts exists)
npx tsx scripts/validate-retrain-output.ts

# 7. Commit constants + document run in changelog
git add lib/constants.ts
git commit -m "Retrain model YYYY-MM-DD: n=XX, streams_d0 R² 0.XX→0.XX"
```

### CLI flags (v1)

| Flag | Effect |
|---|---|
| `--dry-run` | Full fit + guardrails + report; no DB writes, no constants patch |
| `--force` | Skip R² degradation guardrail (logged loudly; manual override only) |
| `--skip-constants-sync` | Promote DB rows only; do not patch `lib/constants.ts` |

---

## File structure

```
retrain/
├── RETRAINING.md          ← this spec
├── requirements.txt
├── config.py              ← thresholds, env, genre/tier constants
├── retrain.py             ← CLI entrypoint
├── fetch.py               ← Supabase read: closed releases + daily_data
├── dataset.py             ← training matrices; Elderbrook parity test
├── fit.py                 ← OLS regressions + band derivations
├── guardrails.py          ← sample size, Cook's D, R², reproducibility
├── db.py                  ← read active coeffs; insert + promote
├── constants_sync.py      ← patch lib/constants.ts via markers
└── report.py              ← human-readable stdout summary
```

Shared TypeScript contract (not imported by Python):

- `lib/forecast.ts` — coefficient shapes
- `lib/compute-week1-actuals.ts` — wk1 aggregation reference
- `scripts/validate-retrain-output.ts` — JSON shape checker for script output

---

## Troubleshooting

### `insufficient_sample` (n < 40)

Not enough closed releases with complete D1–D7 streams after outlier exclusion. Wait for more releases to close, or verify daily_data completeness in Supabase. Check `/archive` retrain-eligible count.

### `r2_degradation` (one or more models worse by > 0.05)

New fit is materially worse than the active model. Do not promote. Investigate:

- Recent outliers or atypical releases (genre mix shift, editorial tier changes)
- Data entry errors in recently closed releases
- Whether the catalog grew in a way that breaks old model assumptions

Use `--dry-run` to inspect per-model R² deltas. Only use `--force` if you have a documented reason to accept degradation.

### `reproducibility_failed`

Bug in the fit pipeline (non-deterministic ordering, parallel race, etc.). Do not promote. File a bug; do not retry with `--force`.

### Cook's D excludes many releases

Review logged outliers. If legitimate hits (viral anomalies, data errors), fix data and re-run. If the threshold is too aggressive for catalog size, adjust `COOKS_D_THRESHOLD` in `config.py` only after documenting the change in this file.

### DB promotion succeeded but flags/archive look wrong

Bands may be stale in `lib/constants.ts`. Verify `constants_sync.py` ran and commit the diff. Flags read `SAVE_COUNT_BANDS` and `SAVE_RATE_BANDS` from constants, not the DB.

### `SUPABASE_SERVICE_ROLE_KEY` errors

Confirm key is in `retrain/.env.local`, not the project root `.env.local` only. Service role is required for `model_coefficients` writes.

### Elderbrook parity test fails

Python `dataset.py` aggregation diverges from `lib/compute-week1-actuals.ts`. Fix before any production retrain — the script must sum days 1–7 identically (452,848 streams / 19,954 saves on the fixture).

---

## Reference

| Resource | Purpose |
|---|---|
| `SCOPE.md` § Retraining logic | Original build scope and seed coefficient examples |
| `lib/forecast.ts` | Runtime formulas and TypeScript types for all payloads |
| `lib/constants.ts` | Band constants patched after each successful retrain |
| `lib/load-forecast-data.ts` | How the app reads active `model_coefficients` |
| `lib/compute-week1-actuals.ts` | Wk1 aggregation contract |
| `lib/fixtures/elderbrook-monitoring.ts` | Golden D1–D7 fixture |
| `scripts/validate-archive-elderbrook.ts` | TypeScript validation of wk1 totals |

---

## v1 decisions log

| Question | Decision |
|---|---|
| Meta rates | Hold fixed; do not update `META_RATES_BY_GENRE` |
| Cook's D | Exclude outliers, refit; reject if n < 40 post-exclusion |
| R² guardrail | Reject whole batch if any regression model degrades > 0.05 |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` in `retrain/.env.local` only |
| Automation | Manual run only; no CI or scheduled retrain in v1 |
