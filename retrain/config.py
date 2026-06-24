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
SUPABASE_SERVICE_ROLE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY"


def get_supabase_url() -> str:
    url = os.getenv(SUPABASE_URL_ENV)
    if not url:
        raise RuntimeError(
            f"Missing {SUPABASE_URL_ENV}. Set it in {ENV_LOCAL_PATH}."
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

RELEASE_TYPES: tuple[str, ...] = ("single", "ep", "album")
SPOTIFY_FORMATS: tuple[str, ...] = ("marquee", "showcase")
META_OBJECTIVES: tuple[str, ...] = ("traffic", "awareness", "reach")

# --- Model types written to model_coefficients ---

STREAM_MODEL_TYPES: tuple[str, ...] = tuple(
    f"streams_d{n}" for n in range(8)
)

REGRESSION_MODEL_TYPES: tuple[str, ...] = STREAM_MODEL_TYPES + ("saves",)

DERIVED_MODEL_TYPES: tuple[str, ...] = (
    "algo_bands",
    "save_rate_bands",
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

# --- Wk1 window (must match lib/compute-week1-actuals.ts) ---

WK1_DAY_START = 1
WK1_DAY_END = 7
STREAM_CURVE_DAY_END = 28

# --- Golden fixture: Elderbrook (lib/fixtures/elderbrook-monitoring.ts) ---

ELDERBROOK_RELEASE_ID = "ae749c93-fa94-4bb5-b6d9-1845e961b8cd"
ELDERBROOK_EXPECTED_WK1_STREAMS = 452_848
ELDERBROOK_EXPECTED_WK1_SAVES = 19_954

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
    "STREAM_CURVE_TEMPLATE": (
        "// RETRAIN:STREAM_CURVE_TEMPLATE:START",
        "// RETRAIN:STREAM_CURVE_TEMPLATE:END",
    ),
}


@dataclass(frozen=True)
class RetrainFlags:
    dry_run: bool = False
    force: bool = False
    skip_constants_sync: bool = False
