"""
Retrain script configuration.

Loads environment from retrain/.env.local (see RETRAINING.md).
All thresholds and domain constants mirror lib/constants.ts and lib/forecast.ts.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# --- Paths ---

RETRAIN_DIR = Path(__file__).resolve().parent
REPO_ROOT = RETRAIN_DIR.parent
CONSTANTS_TS_PATH = REPO_ROOT / "lib" / "constants.ts"
ENV_LOCAL_PATH = RETRAIN_DIR / ".env.local"

load_dotenv(ENV_LOCAL_PATH)

# --- Supabase ---

SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL"
# GitHub Actions secrets use SUPABASE_URL (alias).
SUPABASE_URL_ALIAS_ENV = "SUPABASE_URL"
SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY"

# Archive soft threshold (mirrors lib/constants.ts RETRAIN_THRESHOLD).
RETRAIN_THRESHOLD = 10


def get_supabase_url() -> str:
    url = os.getenv(SUPABASE_URL_ENV) or os.getenv(SUPABASE_URL_ALIAS_ENV)
    if not url:
        raise RuntimeError(
            f"Missing {SUPABASE_URL_ENV} (or {SUPABASE_URL_ALIAS_ENV}). "
            f"Set it in {ENV_LOCAL_PATH} or the process environment."
        )
    return url


def get_supabase_service_role_key() -> str:
    key = os.getenv(SUPABASE_SERVICE_ROLE_KEY_ENV)
    if not key:
        raise RuntimeError(
            f"Missing {SUPABASE_SERVICE_ROLE_KEY_ENV}. "
            f"Set it in {ENV_LOCAL_PATH} (service role, not anon key)."
        )
    return key


# --- Genres (must match lib/constants.ts GENRES and releases_genre_check) ---

GENRES: tuple[str, ...] = (
    "dubstep",
    "house",
    "melodic-bass",
    "downtempo",
    "big-room",
)

SAVES_REFERENCE_GENRE = "house"

# --- Artist tier (must match lib/constants.ts TIER_ML_THRESHOLDS) ---

TIER_ML_MID = 500_000
TIER_ML_ESTABLISHED = 2_000_000

ARTIST_TIERS: tuple[str, ...] = ("developing", "mid", "established")


def artist_tier_from_monthly_listeners(monthly_listeners: float) -> str:
    if monthly_listeners >= TIER_ML_ESTABLISHED:
        return "established"
    if monthly_listeners >= TIER_ML_MID:
        return "mid"
    return "developing"


# --- Release / ad dimensions (must match lib/constants.ts) ---

RELEASE_TYPES: tuple[str, ...] = (
    "single",
    "lead_single",
    "focus_track",
    "album_track",
    "alternate_version",
)
# Reference pool for RELEASE_TYPE_MAGNITUDE_MULTIPLIER ratios.
RELEASE_TYPE_MAGNITUDE_REFERENCE_TYPES: tuple[str, ...] = ("single", "lead_single")
# Empirical Bayes shrinkage toward 1.0: (n * raw + k * 1) / (n + k).
RELEASE_TYPE_MAGNITUDE_SHRINKAGE_K = 5
# Legacy keys in ad_rates.spotify_rates until CPS is recalibrated on catalog roles.
SPOTIFY_CPS_RELEASE_TYPES: tuple[str, ...] = ("single", "ep", "album")
SPOTIFY_FORMATS: tuple[str, ...] = ("marquee", "showcase")
META_OBJECTIVES: tuple[str, ...] = ("awareness", "traffic", "streaming")

# --- Model types written to model_coefficients ---

STREAM_MODEL_TYPES: tuple[str, ...] = tuple(
    f"streams_d{n}" for n in range(8)
)

REGRESSION_MODEL_TYPES: tuple[str, ...] = STREAM_MODEL_TYPES + ("saves",)

DERIVED_MODEL_TYPES: tuple[str, ...] = (
    "algo_bands",
    "save_rate_bands",
    "stream_bands",
    "stream_curve",
    "ad_rates",
)

ALL_MODEL_TYPES: tuple[str, ...] = REGRESSION_MODEL_TYPES + DERIVED_MODEL_TYPES

# --- Guardrails (see RETRAINING.md) ---

MIN_SAMPLE_SIZE = 40
R2_DEGRADATION_MAX = 0.05
COOKS_D_THRESHOLD_FACTOR = 4.0  # flag when D > COOKS_D_THRESHOLD_FACTOR / n
REPRODUCIBILITY_ATOL = 1e-10
REPRODUCIBILITY_RTOL = 1e-10

# Seed fallback for archive retrain-progress cutoff (mirrors lib/constants.ts
# RETRAIN_LAST_AT). Live cutoff = max(this, max active model_coefficients.fitted_at).
# After the baseline stamp / any promote, prefer DB fitted_at; do not bump this
# for future retrains — promote stamps fitted_at instead.
RETRAIN_LAST_AT = "2026-07-27T05:20:00.000Z"

# SAVE_RATE_BANDS: Empirical Bayes toward catalog-wide p10/p90.
# Genres with n < MIN shrink fully toward the prior; all genres get k-shrinkage.
SAVE_RATE_BANDS_MIN_SAMPLE = 5
SAVE_RATE_BANDS_SHRINKAGE_K = 5
# Seed prior used only when the catalog has zero save-rate rows (cold start).
SAVE_RATE_BANDS_SEED_PRIOR: dict[str, dict[str, float]] = {
    "dubstep": {"lo": 17.0, "hi": 22.0},
    "melodic-bass": {"lo": 13.0, "hi": 23.0},
    "house": {"lo": 9.0, "hi": 16.0},
    "big-room": {"lo": 5.0, "hi": 10.0},
    "downtempo": {"lo": 10.0, "hi": 16.0},
}

# STREAM_BANDS: global p25/p75 of (actual_wk1 / locked_forecast_streams).
# Same eligible set as save_rate_bands. Soft guardrail requires n ≥ this.
STREAM_BANDS_MIN_SAMPLE = 20
STREAM_BANDS_PERCENTILE_LO = 25.0
STREAM_BANDS_PERCENTILE_HI = 75.0
# Seed used only when the catalog has zero eligible ratios (cold start).
STREAM_BANDS_SEED_PRIOR: dict[str, float] = {"lo": 0.45, "hi": 1.05}

# --- Wk1 window (must match lib/compute-week1-actuals.ts) ---

WK1_DAY_START = 1
WK1_DAY_END = 7
STREAM_CURVE_DAY_END = 28
# Editorial kernel length (New Music Friday bump + short tail).
EDITORIAL_KERNEL_K = 2
# Steady-state days for DOW fit (after wk1 editorial window).
DOW_STEADY_STATE_DAY_START = 8
# ISO weekday for composed-Thursday legacy curve_* / STREAM_CURVE_BASELINE view.
THURSDAY_ISO_WEEKDAY = 4
DOW_WEEKDAY_NAMES: tuple[str, ...] = (
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
)

# --- Golden fixture: Elderbrook (lib/fixtures/elderbrook-monitoring.ts) ---

ELDERBROOK_RELEASE_ID = "00000000-0000-4000-8000-00000000e1de"
ELDERBROOK_EXPECTED_WK1_STREAMS = 453_483
ELDERBROOK_EXPECTED_WK1_SAVES = 20_138

# --- constants.ts marker blocks (constants_sync.py) ---

CONSTANTS_MARKERS: dict[str, tuple[str, str]] = {
    "SAVE_COUNT_BANDS": (
        "// RETRAIN:SAVE_COUNT_BANDS:START",
        "// RETRAIN:SAVE_COUNT_BANDS:END",
    ),
    "SAVE_RATE_BANDS": (
        "// RETRAIN:SAVE_RATE_BANDS:START",
        "// RETRAIN:SAVE_RATE_BANDS:END",
    ),
    "STREAM_BANDS": (
        "// RETRAIN:STREAM_BANDS:START",
        "// RETRAIN:STREAM_BANDS:END",
    ),
    "STREAM_DOW_MULTIPLIER": (
        "// RETRAIN:STREAM_DOW_MULTIPLIER:START",
        "// RETRAIN:STREAM_DOW_MULTIPLIER:END",
    ),
    "STREAM_EDITORIAL_KERNEL": (
        "// RETRAIN:STREAM_EDITORIAL_KERNEL:START",
        "// RETRAIN:STREAM_EDITORIAL_KERNEL:END",
    ),
    "STREAM_CURVE_TREND": (
        "// RETRAIN:STREAM_CURVE_TREND:START",
        "// RETRAIN:STREAM_CURVE_TREND:END",
    ),
    "RELEASE_TYPE_MAGNITUDE_MULTIPLIER": (
        "// RETRAIN:RELEASE_TYPE_MAGNITUDE_MULTIPLIER:START",
        "// RETRAIN:RELEASE_TYPE_MAGNITUDE_MULTIPLIER:END",
    ),
}


@dataclass(frozen=True)
class RetrainFlags:
    dry_run: bool = False
    force: bool = False
    skip_constants_sync: bool = False
    # Fit + write constants.ts; skip DB promote (operator reviews diff before commit).
    hold_the_commit: bool = False
    # Fit + write one consolidated draft model_coefficients row (no promote, no constants).
    write_draft: bool = False
    # Optional retrain_jobs.id stamped into draft metadata / job completion.
    job_id: str | None = None
    # Non-empty: promote past insufficient_sample (n < MIN_SAMPLE_SIZE). Logged loudly.
    override_insufficient_sample: str | None = None
    # One-shot: stamp active model_coefficients.fitted_at = RETRAIN_LAST_AT, then exit.
    stamp_last_retrain: bool = False
