"""Weekday-aware stream curve fit: synthetic recovery + Thursday reconstitution."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pytest

import config
from dataset import (
    TrainingRow,
    editorial_day_number,
    iso_weekday_on_campaign_day,
    release_iso_weekday,
)
from fit import (
    compose_stream_curve_pct,
    derive_stream_curve,
)

# Known generative truth (Mon…Sun).
TRUE_DOW = [0.912, 0.971, 0.982, 1.099, 1.262, 0.983, 0.814]
TRUE_KERNEL = [21.33, 5.49]
# Smooth seasonless decay (28 days).
TRUE_TREND = [
    6.0,
    5.8,
    8.0,
    10.5,
    14.5,
    15.0,
    14.2,
    12.5,
    9.0,
    7.5,
    6.5,
    7.2,
    6.8,
    6.5,
    5.2,
    4.9,
    5.0,
    4.5,
    4.8,
    5.0,
    4.7,
    4.3,
    4.5,
    4.2,
    3.5,
    3.6,
    3.7,
    3.7,
]

# Mixed release weekdays (ISO Mon=1 … Sun=7).
RELEASE_ISOS = (1, 2, 3, 4, 5, 6, 7)


def _release_date_for_iso(iso_weekday: int, index: int) -> str:
    """Pick a calendar date with the given ISO weekday."""
    base = date(2026, 1, 5) + timedelta(days=index)  # Monday
    # ISO: Mon=1 …; Python weekday: Mon=0 …
    target_py = iso_weekday - 1
    delta = (target_py - base.weekday()) % 7
    return (base + timedelta(days=delta)).isoformat()


def _compose_raw_y(
    *,
    release_iso: int,
    editorial_offset: int,
    noise: float = 0.0,
    rng: np.random.Generator | None = None,
) -> dict[int, float]:
    y: dict[int, float] = {}
    for day in range(1, config.STREAM_CURVE_DAY_END + 1):
        iso = iso_weekday_on_campaign_day(release_iso, day)
        dow = TRUE_DOW[iso - 1]
        kernel_index = day - editorial_offset
        editorial = (
            TRUE_KERNEL[kernel_index]
            if 0 <= kernel_index < len(TRUE_KERNEL)
            else 0.0
        )
        value = TRUE_TREND[day - 1] * dow + editorial
        if rng is not None and noise > 0:
            value *= 1.0 + float(rng.normal(0, noise))
        y[day] = max(0.01, value)
    return y


def make_synthetic_weekday_rows(
    n_per_weekday: int = 8,
    *,
    seed: int = 11,
    noise: float = 0.01,
) -> list[TrainingRow]:
    rng = np.random.default_rng(seed)
    rows: list[TrainingRow] = []
    i = 0
    for release_iso in RELEASE_ISOS:
        for _ in range(n_per_weekday):
            release_date = _release_date_for_iso(release_iso, i)
            assert release_iso_weekday(release_date) == release_iso
            offset = editorial_day_number(release_date)
            y = _compose_raw_y(
                release_iso=release_iso,
                editorial_offset=offset,
                noise=noise,
                rng=rng,
            )
            wk1 = 100_000
            streams_by_day = {
                day: max(1, int(round(wk1 * pct / 100.0)))
                for day, pct in y.items()
            }
            # Renormalize stored streams so wk1_streams matches sum d1–d7.
            wk1_streams = sum(streams_by_day[d] for d in range(1, 8))
            rows.append(
                TrainingRow(
                    release_id=f"wd-{i:03d}",
                    track_name=f"Track {i}",
                    artist_name=f"Artist {i}",
                    genre="house",
                    monthly_listeners=500_000,
                    is_feature=False,
                    editorial_tier=2,
                    release_type="single",
                    spotify_format="marquee",
                    spotify_spend_planned=0.0,
                    locked_forecast_streams=wk1_streams,
                    wk1_streams=wk1_streams,
                    wk1_saves=5_000,
                    streams_by_day=streams_by_day,
                    release_date=release_date,
                )
            )
            i += 1
    return rows


def test_editorial_day_number_parity_with_ts_fixtures() -> None:
    assert editorial_day_number("2026-05-28") == 2  # Thu
    assert editorial_day_number("2026-05-27") == 3  # Wed
    assert editorial_day_number("2026-07-01") == 3  # Wed
    assert editorial_day_number("2026-05-29") == 1  # Fri


def test_synthetic_recovery_dow_kernel_trend() -> None:
    rows = make_synthetic_weekday_rows()
    fit = derive_stream_curve(rows)

    assert fit.sample_size == len(rows)
    assert len(fit.dow_multiplier) == 7
    assert len(fit.editorial_kernel) == config.EDITORIAL_KERNEL_K
    assert len(fit.trend_median) == 28

    for iso in range(7):
        assert fit.dow_multiplier[iso] == pytest.approx(TRUE_DOW[iso], abs=0.05)

    assert fit.dow_multiplier[4] == max(fit.dow_multiplier)  # Fri peak
    assert fit.dow_multiplier[6] == min(fit.dow_multiplier)  # Sun trough

    for k in range(config.EDITORIAL_KERNEL_K):
        assert fit.editorial_kernel[k] == pytest.approx(TRUE_KERNEL[k], abs=1.5)
    assert fit.editorial_kernel[0] > fit.editorial_kernel[1] >= 0

    # Trend shape recovered (ignore exact level on sparse early days).
    for day in range(8, 28):
        assert fit.trend_median[day] == pytest.approx(TRUE_TREND[day], abs=1.0)


def test_thursday_reconstitution() -> None:
    rows = make_synthetic_weekday_rows()
    fit = derive_stream_curve(rows)

    thu_rows = [
        row
        for row in rows
        if row.release_date is not None
        and release_iso_weekday(row.release_date) == config.THURSDAY_ISO_WEEKDAY
    ]
    assert len(thu_rows) >= 4

    raw_by_day: list[list[float]] = [[] for _ in range(28)]
    for row in thu_rows:
        for day in range(1, 29):
            streams = row.streams_by_day.get(day)
            if streams is None:
                continue
            raw_by_day[day - 1].append((streams / row.wk1_streams) * 100.0)

    raw_median = [
        float(np.median(samples)) if samples else 0.0 for samples in raw_by_day
    ]

    composed = compose_stream_curve_pct(
        fit.trend_median,
        fit.dow_multiplier,
        fit.editorial_kernel,
        release_iso=config.THURSDAY_ISO_WEEKDAY,
        editorial_offset=2,
    )

    for day in range(7):
        assert composed[day] == pytest.approx(raw_median[day], abs=1.0)

    # Legacy curve_* is the composed-Thursday view.
    for day in range(7):
        assert fit.median[day] == pytest.approx(composed[day], abs=0.15)

    assert abs(sum(composed[:7]) - 100.0) < 1e-6


def test_neighbor_interpolate_fills_editorial_gaps() -> None:
    from fit import _neighbor_interpolate

    values: list[float | None] = [1.0, None, None, 4.0]
    filled = _neighbor_interpolate(values)
    assert filled[0] == pytest.approx(1.0)
    assert filled[1] == pytest.approx(2.0)
    assert filled[2] == pytest.approx(3.0)
    assert filled[3] == pytest.approx(4.0)


def test_carry_forward_tail_fills_trailing_zeros() -> None:
    from fit import _carry_forward_tail, derive_stream_curve_trend

    filled = _carry_forward_tail([5.8, 5.4, float("nan"), float("nan")])
    assert filled == [5.8, 5.4, 5.4, 5.4]

    rows = make_synthetic_weekday_rows(n_per_weekday=3, noise=0.0)
    # Strip late days to simulate sparse catalog tail.
    sparse = []
    for row in rows:
        streams = {
            day: value
            for day, value in row.streams_by_day.items()
            if day <= 25
        }
        sparse.append(
            TrainingRow(
                release_id=row.release_id,
                track_name=row.track_name,
                artist_name=row.artist_name,
                genre=row.genre,
                monthly_listeners=row.monthly_listeners,
                is_feature=row.is_feature,
                editorial_tier=row.editorial_tier,
                release_type=row.release_type,
                spotify_format=row.spotify_format,
                spotify_spend_planned=row.spotify_spend_planned,
                locked_forecast_streams=row.locked_forecast_streams,
                wk1_streams=row.wk1_streams,
                wk1_saves=row.wk1_saves,
                streams_by_day=streams,
                release_date=row.release_date,
            )
        )
    from fit import derive_dow_multiplier, derive_editorial_kernel

    dow = derive_dow_multiplier(sparse)
    kernel = derive_editorial_kernel(sparse, dow)
    median, p25, p75 = derive_stream_curve_trend(sparse, dow, kernel)
    assert median[24] > 0
    assert median[25] == median[24]
    assert median[26] == median[24]
    assert median[27] == median[24]
    assert p25[27] == p25[24]
    assert p75[27] == p75[24]
