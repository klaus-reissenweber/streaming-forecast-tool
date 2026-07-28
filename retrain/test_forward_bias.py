"""Unit tests for forward_bias.compute_forward_bias."""

from __future__ import annotations

from dataset import TrainingRow
from fit import RegressionFit, ReleaseTypeMagnitudeFit
from forward_bias import (
    compute_forward_bias,
    predict_wk1_streams,
    scorer_from_fit,
    scorer_from_payload,
)


def _row(
    *,
    release_id: str,
    ml: float,
    wk1: int,
    locked: int,
    release_type: str = "single",
    closed_at: str,
) -> TrainingRow:
    return TrainingRow(
        release_id=release_id,
        track_name=release_id,
        artist_name="A",
        genre="house",
        monthly_listeners=ml,
        is_feature=False,
        editorial_tier=1,
        release_type=release_type,
        spotify_format="marquee",
        spotify_spend_planned=0,
        locked_forecast_streams=locked,
        wk1_streams=wk1,
        wk1_saves=1000,
        streams_by_day={d: max(1, wk1 // 7) for d in range(1, 8)},
        release_date="2026-01-01",
        created_at=closed_at,
        closed_at=closed_at,
    )


def _magnitude() -> ReleaseTypeMagnitudeFit:
    return ReleaseTypeMagnitudeFit(
        sample_size=3,
        multipliers={
            "single": 1.0,
            "lead_single": 1.0,
            "focus_track": 1.0,
            "album_track": 1.0,
            "alternate_version": 1.0,
        },
        raw_ratios={
            "single": 1.0,
            "lead_single": 1.0,
            "focus_track": 1.0,
            "album_track": 1.0,
            "alternate_version": 1.0,
        },
        counts={
            "single": 3,
            "lead_single": 0,
            "focus_track": 0,
            "album_track": 0,
            "alternate_version": 0,
        },
        shrinkage_k=5,
    )


def test_scorer_from_payload_reads_consolidated_shape() -> None:
    scorer = scorer_from_payload(
        {
            "streams_d0": {
                "intercept": 11.5,
                "log_ml": 0.1,
                "feat": 0.0,
                "ed_tier": 0.2,
                "rmse": 0.5,
                "r2": 0.6,
            },
            "release_type_magnitude_multipliers": {
                "single": 1.0,
                "focus_track": 1.06,
            },
        }
    )
    assert scorer.streams_d0.log_ml == 0.1
    assert scorer.magnitudes["focus_track"] == 1.06


def test_live_uses_scorer_not_locked_forecast() -> None:
    # Live scorer predicts ~100k; locked_forecast is deliberately wrong (110k/90k).
    # If live still read locked_forecast, median live bias would be +0.10.
    live_fit = RegressionFit(
        intercept=11.512925465,  # ~exp → 100_000
        log_ml=0.0,
        feat=0.0,
        ed_tier=0.0,
        rmse=0.1,
        r2=0.5,
        sample_size=3,
    )
    # New model over-predicts by ~10% via magnitude.
    new_fit = live_fit
    live_mag = _magnitude()
    new_mag = ReleaseTypeMagnitudeFit(
        sample_size=3,
        multipliers={
            "single": 1.10,
            "lead_single": 1.10,
            "focus_track": 1.10,
            "album_track": 1.10,
            "alternate_version": 1.10,
        },
        raw_ratios=live_mag.raw_ratios,
        counts=live_mag.counts,
        shrinkage_k=5,
    )
    rows = [
        _row(
            release_id="a",
            ml=500_000,
            wk1=100_000,
            locked=110_000,
            closed_at="2026-06-01T00:00:00Z",
        ),
        _row(
            release_id="b",
            ml=500_000,
            wk1=100_000,
            locked=110_000,
            closed_at="2026-06-02T00:00:00Z",
        ),
        _row(
            release_id="c",
            ml=500_000,
            wk1=100_000,
            locked=90_000,
            closed_at="2026-06-03T00:00:00Z",
        ),
    ]

    pred = predict_wk1_streams(rows[0], live_fit, live_mag.multipliers)
    assert abs(pred - 100_000) < 1.0

    bias = compute_forward_bias(
        rows,
        rows[:2],
        live=scorer_from_fit(live_fit, live_mag),
        new=scorer_from_fit(new_fit, new_mag),
    )
    # Live scored from consolidated scorer → ~0, NOT locked median +0.10
    assert bias["all"]["live"] is not None
    assert abs(bias["all"]["live"]) < 1e-3
    # New magnitude 1.10 → ~+10% median bias
    assert bias["all"]["new"] is not None
    assert abs(bias["all"]["new"] - 0.10) < 1e-3
