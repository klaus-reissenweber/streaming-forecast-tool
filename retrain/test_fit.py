"""Unit tests for fit.py (streams_d0 + saves slice)."""

from __future__ import annotations

import json

import numpy as np
import pytest

import config
from dataset import TrainingRow
from fit import fit_streams_d0, fit_streams_d0_and_saves, fit_saves

# Known-positive relationships baked into synthetic data generation.
SYNTHETIC_TRUE = {
    "streams_d0": {"log_ml": 0.45, "feat": 0.50, "ed_tier": 0.35},
    "saves": {"log_ml": 0.35, "feat": 0.15, "ed_tier": 0.40},
}

SYNTHETIC_GENRE_OFFSETS = {
    "house": 0.0,
    "dubstep": 0.50,
    "melodic-bass": 0.30,
    "downtempo": 0.10,
    "big-room": -0.20,
}

# First 7 days of lib/constants.ts STREAM_CURVE_TEMPLATE.median (for daily split).
WK1_CURVE_PCTS = [0.5, 27.2, 16.0, 11.7, 13.6, 14.0, 14.4]


def _split_wk1_streams(wk1_streams: int) -> dict[int, int]:
    weights = np.array(WK1_CURVE_PCTS, dtype=float)
    weights = weights / weights.sum()
    raw = np.floor(np.array(weights) * wk1_streams).astype(int)
    remainder = wk1_streams - int(raw.sum())
    for index in range(abs(remainder)):
        raw[index % 7] += 1 if remainder > 0 else -1
    return {day + 1: int(raw[day]) for day in range(7)}


def make_synthetic_training_rows(
    n: int = 40,
    seed: int = 42,
) -> list[TrainingRow]:
    rng = np.random.default_rng(seed)
    genres = list(config.GENRES)
    release_types = list(config.RELEASE_TYPES)
    formats = list(config.SPOTIFY_FORMATS)
    rows: list[TrainingRow] = []

    for i in range(n):
        monthly_listeners = float(rng.uniform(50_000, 5_000_000))
        is_feature = bool(rng.integers(0, 2))
        editorial_tier = int(rng.integers(0, 4))
        genre = genres[i % len(genres)]
        feat_val = 1.0 if is_feature else 0.0
        log_ml = np.log(monthly_listeners)

        log_streams = (
            5.0
            + SYNTHETIC_TRUE["streams_d0"]["log_ml"] * log_ml
            + SYNTHETIC_TRUE["streams_d0"]["feat"] * feat_val
            + SYNTHETIC_TRUE["streams_d0"]["ed_tier"] * editorial_tier
            + rng.normal(0, 0.08)
        )
        wk1_streams = max(7, int(round(np.exp(log_streams))))
        streams_by_day = _split_wk1_streams(wk1_streams)

        log_saves = (
            3.0
            + SYNTHETIC_TRUE["saves"]["log_ml"] * log_ml
            + SYNTHETIC_TRUE["saves"]["feat"] * feat_val
            + SYNTHETIC_TRUE["saves"]["ed_tier"] * editorial_tier
            + SYNTHETIC_GENRE_OFFSETS[genre]
            + rng.normal(0, 0.08)
        )
        wk1_saves = max(1, int(round(np.exp(log_saves))))

        rows.append(
            TrainingRow(
                release_id=f"synthetic-{i:03d}",
                track_name=f"Track {i}",
                artist_name=f"Artist {i}",
                genre=genre,
                monthly_listeners=monthly_listeners,
                is_feature=is_feature,
                editorial_tier=editorial_tier,
                release_type=release_types[i % len(release_types)],
                spotify_format=formats[i % len(formats)],
                spotify_spend_planned=0.0,
                wk1_streams=wk1_streams,
                wk1_saves=wk1_saves,
                streams_by_day=streams_by_day,
            )
        )

    return rows


def test_synthetic_streams_d0_and_saves_bounds() -> None:
    rows = make_synthetic_training_rows()
    streams, saves = fit_streams_d0_and_saves(rows)

    assert streams.log_ml > 0, "log_ml should increase wk1 streams forecast"
    assert streams.ed_tier > 0, "ed_tier should increase wk1 streams forecast"
    assert saves.log_ml > 0, "log_ml should increase wk1 saves forecast"
    assert saves.ed_tier > 0, "ed_tier should increase wk1 saves forecast"
    assert saves.genre_offset[config.SAVES_REFERENCE_GENRE] == 0.0
    assert streams.sample_size == len(rows)
    assert saves.sample_size == len(rows)
    assert streams.r2 > 0.5
    assert saves.r2 > 0.5


def test_synthetic_fit_report(capsys: pytest.CaptureFixture[str]) -> None:
    rows = make_synthetic_training_rows()
    streams, saves = fit_streams_d0_and_saves(rows)

    report = {
        "sample_size": len(rows),
        "streams_d0": {
            "coefficients": streams.to_coefficients_json(),
            "bounds_check": {
                "log_ml_positive": streams.log_ml > 0,
                "ed_tier_positive": streams.ed_tier > 0,
            },
            "true_generating": SYNTHETIC_TRUE["streams_d0"],
        },
        "saves": {
            "coefficients": saves.to_coefficients_json(),
            "bounds_check": {
                "log_ml_positive": saves.log_ml > 0,
                "ed_tier_positive": saves.ed_tier > 0,
                "house_reference_zero": (
                    saves.genre_offset[config.SAVES_REFERENCE_GENRE] == 0.0
                ),
            },
            "true_generating": {
                **SYNTHETIC_TRUE["saves"],
                "genre_offsets": SYNTHETIC_GENRE_OFFSETS,
            },
        },
        "all_bounds_pass": (
            streams.log_ml > 0
            and streams.ed_tier > 0
            and saves.log_ml > 0
            and saves.ed_tier > 0
        ),
    }

    print("=== fit_streams_d0_and_saves (synthetic n=40) ===")
    print(json.dumps(report, indent=2))
    assert report["all_bounds_pass"] is True
    print("PASS: synthetic fit bounds")


def test_fit_streams_d0_requires_minimum_rows() -> None:
    rows = make_synthetic_training_rows(n=1)
    with pytest.raises(ValueError, match="at least 2"):
        fit_streams_d0(rows)


def test_fit_saves_requires_minimum_rows() -> None:
    row = make_synthetic_training_rows(n=1)[0]
    with pytest.raises(ValueError, match="at least 2"):
        fit_saves([row])
