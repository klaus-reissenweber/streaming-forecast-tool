"""Unit tests for streams_d1–d7 and derived band models in fit.py."""

from __future__ import annotations

import json

import numpy as np
import pytest

import config
from dataset import TrainingRow
from fit import (
    build_ad_rates,
    derive_algo_bands,
    derive_save_rate_bands,
    derive_stream_curve,
    fit_all_streams_models,
    fit_streams_refinement,
)

# Full 28-day curve from lib/constants.ts STREAM_CURVE_TEMPLATE.median.
SYNTHETIC_CURVE_MEDIAN = [
    0.5, 27.2, 16.0, 11.7, 13.6, 14.0, 14.4, 14.4, 12.5, 9.3, 7.4, 8.6, 10.3,
    9.5, 9.5, 9.8, 8.1, 6.4, 7.4, 7.3, 7.8, 7.7, 8.1, 7.4, 6.2, 6.6, 7.4, 7.6,
]

SYNTHETIC_REFINEMENT = {
    "log_d": 0.55,
    "log_ml": 0.20,
    "feat": 0.25,
    "ed_tier": 0.15,
}

SYNTHETIC_SAVE_RATE_BY_GENRE = {
    "dubstep": 20.0,
    "house": 12.0,
    "melodic-bass": 18.0,
    "downtempo": 14.0,
    "big-room": 8.0,
}

SYNTHETIC_TIER_SAVE_MULTIPLIER = {
    "developing": 1.0,
    "mid": 1.3,
    "established": 1.6,
}

SYNTHETIC_SPOTIFY_CPS = {
    ("single", "marquee", "developing"): 0.04,
    ("single", "marquee", "mid"): 0.22,
    ("single", "showcase", "established"): 0.20,
    ("ep", "marquee", "mid"): 0.11,
}

ACTIVE_META_AD_RATES = {
    "meta_rates_by_genre": {
        "dubstep": 0.24,
        "melodic-bass": 0.24,
        "house": 2.73,
        "big-room": 2.73,
        "downtempo": 14.69,
    },
    "meta_objective_multipliers": {
        "traffic": 1.0,
        "awareness": 21.4,
        "reach": 8.9,
    },
    "meta_delivery_per_objective": {
        "traffic": {"cpm": 3.83, "cpr": 6.91, "cpc": 0.1},
        "awareness": {"cpm": 4.3, "cpr": 6.58, "cpc": 2.14},
        "reach": {"cpm": 2.09, "cpr": 2.18, "cpc": 0.89},
    },
}


def _tier_monthly_listeners(tier: str, rng: np.random.Generator) -> float:
    if tier == "developing":
        return float(rng.uniform(80_000, 400_000))
    if tier == "mid":
        return float(rng.uniform(600_000, 1_500_000))
    return float(rng.uniform(2_500_000, 6_000_000))


def _streams_by_day_from_wk1(wk1_streams: int) -> dict[int, int]:
    streams_by_day: dict[int, int] = {}
    for day, pct in enumerate(SYNTHETIC_CURVE_MEDIAN, start=1):
        streams_by_day[day] = max(1, int(round(wk1_streams * pct / 100.0)))
    return streams_by_day


def make_derivation_training_rows(
    n: int = 80,
    seed: int = 7,
) -> list[TrainingRow]:
    rng = np.random.default_rng(seed)
    genres = list(config.GENRES)
    release_types = list(config.RELEASE_TYPES)
    formats = list(config.SPOTIFY_FORMATS)
    rows: list[TrainingRow] = []

    for i in range(n):
        tier = config.ARTIST_TIERS[i % len(config.ARTIST_TIERS)]
        genre = genres[i % len(genres)]
        monthly_listeners = _tier_monthly_listeners(tier, rng)
        is_feature = bool(rng.integers(0, 2))
        editorial_tier = int(rng.integers(0, 4))
        feat_val = 1.0 if is_feature else 0.0

        release_type = release_types[int(rng.integers(0, len(release_types)))]
        spotify_format = formats[int(rng.integers(0, len(formats)))]

        log_ml = np.log(monthly_listeners)
        log_streams = (
            5.0
            + 0.35 * log_ml
            + SYNTHETIC_REFINEMENT["feat"] * feat_val
            + SYNTHETIC_REFINEMENT["ed_tier"] * editorial_tier
            + rng.normal(0, 0.06)
        )
        wk1_streams = max(28, int(round(np.exp(log_streams))))
        streams_by_day = _streams_by_day_from_wk1(wk1_streams)

        tier_multiplier = SYNTHETIC_TIER_SAVE_MULTIPLIER[tier]
        genre_rate = SYNTHETIC_SAVE_RATE_BY_GENRE[genre]
        wk1_saves = max(
            1,
            int(round(wk1_streams * (genre_rate / 100.0) * tier_multiplier)),
        )

        cps_key = (release_type, spotify_format, tier)
        target_cps = SYNTHETIC_SPOTIFY_CPS.get(
            cps_key,
            0.15 if tier == "mid" else 0.05,
        )
        spotify_spend = target_cps * wk1_streams

        rows.append(
            TrainingRow(
                release_id=f"deriv-{i:03d}",
                track_name=f"Track {i}",
                artist_name=f"Artist {i}",
                genre=genre,
                monthly_listeners=monthly_listeners,
                is_feature=is_feature,
                editorial_tier=editorial_tier,
                release_type=release_type,
                spotify_format=spotify_format,
                spotify_spend_planned=float(spotify_spend),
                wk1_streams=wk1_streams,
                wk1_saves=wk1_saves,
                streams_by_day=streams_by_day,
            )
        )

    return rows


def _percentile_ordering(bands: dict[str, int]) -> bool:
    return bands["p25"] <= bands["p50"] <= bands["p75"] <= bands["p90"]


def test_streams_refinement_and_derivations_bounds() -> None:
    rows = make_derivation_training_rows()

    streams_models = fit_all_streams_models(rows)
    for day in range(1, config.WK1_DAY_END + 1):
        model = streams_models[f"streams_d{day}"]
        assert isinstance(model.refinement_day, int)
        assert model.log_d > 0, f"streams_d{day} log_d should be positive"
        assert model.r2 > 0.5
        assert model.sample_size == len(rows)

    algo = derive_algo_bands(rows)
    for tier in config.ARTIST_TIERS:
        assert _percentile_ordering(algo.bands[tier])

    save_rates = derive_save_rate_bands(rows)
    for genre in config.GENRES:
        assert save_rates.bands[genre]["lo"] < save_rates.bands[genre]["hi"]

    curve = derive_stream_curve(rows)
    assert len(curve.median) == 28
    assert curve.median[1] > curve.median[0]
    assert abs(curve.median[1] - SYNTHETIC_CURVE_MEDIAN[1]) < 2.0
    assert curve.p25[1] <= curve.median[1] <= curve.p75[1]

    ad_rates = build_ad_rates(rows, ACTIVE_META_AD_RATES)
    assert ad_rates.meta_rates_by_genre == ACTIVE_META_AD_RATES["meta_rates_by_genre"]
    single_marquee_mid = ad_rates.spotify_rates["single"]["marquee"]["mid"]
    assert single_marquee_mid is not None
    assert 0.15 < single_marquee_mid < 0.30


def test_streams_refinement_and_derivations_report(
    capsys: pytest.CaptureFixture[str],
) -> None:
    rows = make_derivation_training_rows()
    streams_d3 = fit_streams_refinement(rows, day=3)
    algo = derive_algo_bands(rows)
    save_rates = derive_save_rate_bands(rows)
    curve = derive_stream_curve(rows)
    ad_rates = build_ad_rates(rows, ACTIVE_META_AD_RATES)

    report = {
        "sample_size": len(rows),
        "streams_d3": {
            "coefficients": streams_d3.to_coefficients_json(),
            "bounds_check": {
                "log_d_positive": streams_d3.log_d > 0,
                "r2_high": streams_d3.r2 > 0.5,
            },
        },
        "algo_bands": {
            "developing": algo.bands["developing"],
            "mid": algo.bands["mid"],
            "established": algo.bands["established"],
            "bounds_check": {
                tier: _percentile_ordering(algo.bands[tier])
                for tier in config.ARTIST_TIERS
            },
            "tier_monotonic_p50": (
                algo.bands["developing"]["p50"]
                < algo.bands["mid"]["p50"]
                < algo.bands["established"]["p50"]
            ),
        },
        "save_rate_bands": {
            "dubstep": save_rates.bands["dubstep"],
            "house": save_rates.bands["house"],
            "bounds_check": {
                genre: save_rates.bands[genre]["lo"] < save_rates.bands[genre]["hi"]
                for genre in config.GENRES
            },
            "dubstep_above_house_lo": (
                save_rates.bands["dubstep"]["lo"]
                > save_rates.bands["house"]["lo"]
            ),
        },
        "stream_curve": {
            "day1_median": curve.median[0],
            "day2_median": curve.median[1],
            "day28_median": curve.median[27],
            "bounds_check": {
                "day2_peak_above_day1": curve.median[1] > curve.median[0],
                "percentile_order_day2": curve.p25[1] <= curve.median[1] <= curve.p75[1],
                "day2_near_template": abs(curve.median[1] - SYNTHETIC_CURVE_MEDIAN[1]) < 2.0,
            },
            "expected_template_day2": SYNTHETIC_CURVE_MEDIAN[1],
        },
        "ad_rates": {
            "spotify_single_marquee_mid": ad_rates.spotify_rates["single"]["marquee"]["mid"],
            "spotify_single_marquee_developing": ad_rates.spotify_rates["single"]["marquee"]["developing"],
            "meta_unchanged": (
                ad_rates.meta_rates_by_genre
                == ACTIVE_META_AD_RATES["meta_rates_by_genre"]
            ),
            "bounds_check": {
                "spotify_cps_mid_positive": (
                    ad_rates.spotify_rates["single"]["marquee"]["mid"] is not None
                    and ad_rates.spotify_rates["single"]["marquee"]["mid"] > 0
                ),
                "spotify_cps_near_target_mid": (
                    ad_rates.spotify_rates["single"]["marquee"]["mid"] is not None
                    and 0.15
                    < ad_rates.spotify_rates["single"]["marquee"]["mid"]
                    < 0.30
                ),
            },
        },
        "all_bounds_pass": True,
    }

    print("=== streams_d1-d7 + band derivations (synthetic n=80) ===")
    print(json.dumps(report, indent=2))
    assert report["streams_d3"]["bounds_check"]["log_d_positive"]
    assert report["algo_bands"]["bounds_check"]["developing"]
    assert report["algo_bands"]["tier_monotonic_p50"]
    assert report["save_rate_bands"]["bounds_check"]["house"]
    assert report["stream_curve"]["bounds_check"]["day2_peak_above_day1"]
    assert report["stream_curve"]["bounds_check"]["day2_near_template"]
    assert report["ad_rates"]["meta_unchanged"]
    print("PASS: refinement + derivation bounds")
