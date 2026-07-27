"""Parity tests: Python dataset.py vs lib/compute-week1-actuals.ts."""

from __future__ import annotations

import json

import config
from dataset import (
    ELDERBROOK_D1_D7,
    DailyDataPoint,
    ReleaseRecord,
    build_training_row,
    compute_week1_actuals,
)


def test_elderbrook_week1_parity() -> None:
    """Golden fixture must match TypeScript computeWeek1Actuals output."""
    wk1 = compute_week1_actuals(list(ELDERBROOK_D1_D7))

    assert wk1.streams == config.ELDERBROOK_EXPECTED_WK1_STREAMS
    assert wk1.saves == config.ELDERBROOK_EXPECTED_WK1_SAVES
    assert wk1.days_with_streams == 7
    assert wk1.days_with_saves == 7
    assert wk1.is_complete is True


def test_build_training_row_allows_zero_wk1_when_complete() -> None:
    """Eligibility is completeness-only — no stream-volume floor."""
    release = ReleaseRecord(
        id="zero-wk1",
        track_name="Silent",
        artist_name="Test",
        genre="house",
        monthly_listeners=100_000,
        monthly_listeners_at_release=100_000,
        is_feature=False,
        editorial_tier=0,
        release_type="single",
        spotify_format="marquee",
        meta_spend_planned=0.0,
        spotify_spend_planned=0.0,
        locked_forecast_streams=50_000,
        status="closed",
        release_date="2026-06-01",
    )
    daily = [
        DailyDataPoint(
            id=f"d{day}",
            release_id=release.id,
            day_number=day,
            streams=0,
            saves=0,
            recorded_at="2026-06-01T00:00:00.000Z",
        )
        for day in range(1, 8)
    ]
    row = build_training_row(release, daily)
    assert row is not None
    assert row.wk1_streams == 0
    assert row.monthly_listeners == 100_000


def test_build_training_row_uses_ml_at_release_snapshot() -> None:
    release = ReleaseRecord(
        id="ml-snap",
        track_name="Snap",
        artist_name="Test",
        genre="house",
        monthly_listeners=9_999_999,  # live / drifted
        monthly_listeners_at_release=250_000,
        is_feature=False,
        editorial_tier=1,
        release_type="single",
        spotify_format="marquee",
        meta_spend_planned=0.0,
        spotify_spend_planned=0.0,
        locked_forecast_streams=50_000,
        status="closed",
        release_date="2026-06-01",
    )
    daily = list(ELDERBROOK_D1_D7)
    # rewrite release_id on points
    daily = [
        DailyDataPoint(
            id=p.id,
            release_id=release.id,
            day_number=p.day_number,
            streams=p.streams,
            saves=p.saves,
            recorded_at=p.recorded_at,
        )
        for p in ELDERBROOK_D1_D7
    ]
    row = build_training_row(release, daily)
    assert row is not None
    assert row.monthly_listeners == 250_000


def test_elderbrook_week1_parity_report(capsys) -> None:
    """Print parity summary for operator review (same pattern as validate-archive-elderbrook.ts)."""
    wk1 = compute_week1_actuals(list(ELDERBROOK_D1_D7))
    summary = {
        "fixture": "Elderbrook D1-D7",
        "release_id": config.ELDERBROOK_RELEASE_ID,
        "streams": wk1.streams,
        "expected_streams": config.ELDERBROOK_EXPECTED_WK1_STREAMS,
        "saves": wk1.saves,
        "expected_saves": config.ELDERBROOK_EXPECTED_WK1_SAVES,
        "days_with_streams": wk1.days_with_streams,
        "days_with_saves": wk1.days_with_saves,
        "is_complete": wk1.is_complete,
        "parity": (
            wk1.streams == config.ELDERBROOK_EXPECTED_WK1_STREAMS
            and wk1.saves == config.ELDERBROOK_EXPECTED_WK1_SAVES
        ),
    }
    print("=== compute_week1_actuals (Elderbrook D1-D7) ===")
    print(json.dumps(summary, indent=2))
    assert summary["parity"] is True
    print("PASS: Elderbrook parity")
