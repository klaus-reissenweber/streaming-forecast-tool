"""
Training dataset helpers for the retrain script.

Week-1 aggregation mirrors lib/compute-week1-actuals.ts exactly.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import config

DailyField = Literal["streams", "saves"]


@dataclass(frozen=True)
class DailyDataPoint:
    """Row shape from Supabase daily_data (matches lib/map-release-row.ts)."""

    id: str
    release_id: str
    day_number: int
    streams: int
    saves: int
    other_pct: float | None
    recorded_at: str


@dataclass(frozen=True)
class Week1Actuals:
    """Aggregated wk1 totals (matches lib/compute-week1-actuals.ts)."""

    streams: int | None
    saves: int | None
    days_with_streams: int
    days_with_saves: int
    is_complete: bool


@dataclass(frozen=True)
class ReleaseRecord:
    """Subset of releases columns used for training eligibility and features."""

    id: str
    track_name: str
    artist_name: str
    genre: str
    monthly_listeners: float
    is_feature: bool
    editorial_tier: int
    release_type: str
    spotify_format: str
    meta_spend_planned: float
    spotify_spend_planned: float
    status: str


@dataclass(frozen=True)
class TrainingRow:
    """One closed, retrain-eligible release with wk1 outcomes and model inputs."""

    release_id: str
    track_name: str
    artist_name: str
    genre: str
    monthly_listeners: float
    is_feature: bool
    editorial_tier: int
    release_type: str
    spotify_format: str
    spotify_spend_planned: float
    wk1_streams: int
    wk1_saves: int
    streams_by_day: dict[int, int]


def _streams_by_day_from_daily_data(
    daily_data: list[DailyDataPoint],
) -> dict[int, int]:
    streams_by_day: dict[int, int] = {}
    for row in daily_data:
        if row.day_number < 1 or row.day_number > config.STREAM_CURVE_DAY_END:
            continue
        if row.streams is not None and row.streams >= 0:
            streams_by_day[row.day_number] = row.streams
    return streams_by_day


def build_training_row(
    release: ReleaseRecord,
    daily_data: list[DailyDataPoint],
) -> TrainingRow | None:
    """Build a training row when release is retrain-eligible with positive wk1 streams."""
    if release.status != "closed":
        return None

    wk1 = compute_week1_actuals(daily_data)
    if not wk1.is_complete or wk1.streams is None or wk1.streams <= 0:
        return None

    wk1_saves = wk1.saves if wk1.saves is not None and wk1.saves > 0 else 0

    return TrainingRow(
        release_id=release.id,
        track_name=release.track_name,
        artist_name=release.artist_name,
        genre=release.genre,
        monthly_listeners=release.monthly_listeners,
        is_feature=release.is_feature,
        editorial_tier=release.editorial_tier,
        release_type=release.release_type,
        spotify_format=release.spotify_format,
        spotify_spend_planned=release.spotify_spend_planned,
        wk1_streams=wk1.streams,
        wk1_saves=wk1_saves,
        streams_by_day=_streams_by_day_from_daily_data(daily_data),
    )


def build_training_rows(
    releases: list[ReleaseRecord],
    daily_data_by_release_id: dict[str, list[DailyDataPoint]],
) -> list[TrainingRow]:
    rows: list[TrainingRow] = []
    for release in releases:
        daily_data = daily_data_by_release_id.get(release.id, [])
        row = build_training_row(release, daily_data)
        if row is not None:
            rows.append(row)
    return rows


def _sum_days(
    daily_data: list[DailyDataPoint],
    field: DailyField,
) -> tuple[int, int]:
    total = 0
    days_entered = 0

    for row in daily_data:
        if row.day_number < config.WK1_DAY_START or row.day_number > config.WK1_DAY_END:
            continue
        value = getattr(row, field)
        if value is not None and value >= 0:
            total += value
            days_entered += 1

    return total, days_entered


def compute_week1_actuals(daily_data: list[DailyDataPoint]) -> Week1Actuals:
    """
    Sum daily_data for days 1–7 (wk1 window).

    Contract: lib/compute-week1-actuals.ts — same null rules, same is_complete
    (seven stream days entered, not saves).
    """
    stream_total, days_with_streams = _sum_days(daily_data, "streams")
    save_total, days_with_saves = _sum_days(daily_data, "saves")

    return Week1Actuals(
        streams=stream_total if days_with_streams > 0 else None,
        saves=save_total if days_with_saves > 0 else None,
        days_with_streams=days_with_streams,
        days_with_saves=days_with_saves,
        is_complete=days_with_streams == 7,
    )


def is_retrain_eligible(
    release: ReleaseRecord,
    daily_data: list[DailyDataPoint],
) -> bool:
    """Closed release with complete D1–D7 stream entry (RETRAINING.md)."""
    if release.status != "closed":
        return False
    return compute_week1_actuals(daily_data).is_complete


def group_daily_data_by_release_id(
    rows: list[DailyDataPoint],
) -> dict[str, list[DailyDataPoint]]:
    grouped: dict[str, list[DailyDataPoint]] = {}
    for row in rows:
        grouped.setdefault(row.release_id, []).append(row)
    for days in grouped.values():
        days.sort(key=lambda r: r.day_number)
    return grouped


# Verified Elderbrook D1–D7 from lib/fixtures/elderbrook-monitoring.ts
ELDERBROOK_D1_D7: tuple[DailyDataPoint, ...] = (
    DailyDataPoint(
        id="fixture-d1",
        release_id=config.ELDERBROOK_RELEASE_ID,
        day_number=1,
        streams=28_221,
        saves=4_192,
        other_pct=None,
        recorded_at="2026-01-01T00:00:00.000Z",
    ),
    DailyDataPoint(
        id="fixture-d2",
        release_id=config.ELDERBROOK_RELEASE_ID,
        day_number=2,
        streams=129_399,
        saves=6_300,
        other_pct=None,
        recorded_at="2026-01-02T00:00:00.000Z",
    ),
    DailyDataPoint(
        id="fixture-d3",
        release_id=config.ELDERBROOK_RELEASE_ID,
        day_number=3,
        streams=61_439,
        saves=2_507,
        other_pct=None,
        recorded_at="2026-01-03T00:00:00.000Z",
    ),
    DailyDataPoint(
        id="fixture-d4",
        release_id=config.ELDERBROOK_RELEASE_ID,
        day_number=4,
        streams=40_339,
        saves=1_660,
        other_pct=None,
        recorded_at="2026-01-04T00:00:00.000Z",
    ),
    DailyDataPoint(
        id="fixture-d5",
        release_id=config.ELDERBROOK_RELEASE_ID,
        day_number=5,
        streams=61_571,
        saves=1_931,
        other_pct=None,
        recorded_at="2026-01-05T00:00:00.000Z",
    ),
    DailyDataPoint(
        id="fixture-d6",
        release_id=config.ELDERBROOK_RELEASE_ID,
        day_number=6,
        streams=67_520,
        saves=1_752,
        other_pct=None,
        recorded_at="2026-01-06T00:00:00.000Z",
    ),
    DailyDataPoint(
        id="fixture-d7",
        release_id=config.ELDERBROOK_RELEASE_ID,
        day_number=7,
        streams=64_359,
        saves=1_612,
        other_pct=None,
        recorded_at="2026-01-07T00:00:00.000Z",
    ),
)
