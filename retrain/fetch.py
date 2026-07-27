"""
Supabase reads for closed releases and daily_data (see RETRAINING.md).

Mirrors lib/load-closed-releases.ts — two batched queries, no writes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from supabase import Client

import config
from dataset import (
    DailyDataPoint,
    ReleaseRecord,
    group_daily_data_by_release_id,
    parse_release_date,
)

RELEASES_TABLE = "releases"
DAILY_DATA_TABLE = "daily_data"

RELEASE_SELECT_COLUMNS_BASE = (
    "id, track_name, artist_name, genre, monthly_listeners, is_feature, "
    "editorial_tier, release_type, spotify_format, meta_spend_planned, "
    "spotify_spend_planned, locked_forecast_streams, status, release_date, "
    "created_at"
)
RELEASE_SELECT_COLUMNS = (
    "id, track_name, artist_name, genre, monthly_listeners, "
    "monthly_listeners_at_release, is_feature, editorial_tier, release_type, "
    "spotify_format, meta_spend_planned, spotify_spend_planned, "
    "locked_forecast_streams, status, release_date, created_at"
)

_HAS_ML_AT_RELEASE: bool | None = None


def _releases_have_ml_at_release(client: Client) -> bool:
    """Probe once — migration may not be applied yet on every environment."""
    global _HAS_ML_AT_RELEASE
    if _HAS_ML_AT_RELEASE is not None:
        return _HAS_ML_AT_RELEASE
    try:
        client.table(RELEASES_TABLE).select("monthly_listeners_at_release").limit(1).execute()
        _HAS_ML_AT_RELEASE = True
    except Exception:
        _HAS_ML_AT_RELEASE = False
    return _HAS_ML_AT_RELEASE

DAILY_DATA_SELECT_COLUMNS = (
    "id, release_id, day_number, streams, saves, recorded_at"
)


class FetchError(Exception):
    """Failed to load releases or daily_data from Supabase."""


@dataclass(frozen=True)
class ClosedReleasesBundle:
    releases: list[ReleaseRecord]
    daily_data_by_release_id: dict[str, list[DailyDataPoint]]


def _parse_required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise FetchError(f"{field} must be a non-empty string.")
    return value


def _parse_number(value: Any, field: str) -> float:
    if isinstance(value, bool):
        raise FetchError(f"{field} must be a number.")
    if isinstance(value, (int, float)):
        numeric = float(value)
    elif isinstance(value, str) and value.strip():
        try:
            numeric = float(value)
        except ValueError as error:
            raise FetchError(f"{field} must be a number.") from error
    else:
        raise FetchError(f"{field} must be a number.")
    if not numeric == numeric:  # NaN
        raise FetchError(f"{field} must be a finite number.")
    return numeric


def _parse_integer(value: Any, field: str, *, minimum: int | None = None) -> int:
    numeric = _parse_number(value, field)
    if not numeric.is_integer():
        raise FetchError(f"{field} must be a whole number.")
    integer = int(numeric)
    if minimum is not None and integer < minimum:
        raise FetchError(f"{field} must be at least {minimum}.")
    return integer


def _parse_release_row(row: dict[str, Any]) -> ReleaseRecord:
    release_id = _parse_required_string(row.get("id"), "id")
    genre = _parse_required_string(row.get("genre"), "genre")
    if genre not in config.GENRES:
        raise FetchError(f"releases.id={release_id}: unsupported genre '{genre}'.")

    status = _parse_required_string(row.get("status"), "status")
    if status != "closed":
        raise FetchError(f"releases.id={release_id}: expected status 'closed', got '{status}'.")

    release_type = _parse_required_string(row.get("release_type"), "release_type")
    if release_type not in config.RELEASE_TYPES:
        raise FetchError(
            f"releases.id={release_id}: unsupported release_type '{release_type}'."
        )

    spotify_format = _parse_required_string(row.get("spotify_format"), "spotify_format")
    if spotify_format not in config.SPOTIFY_FORMATS:
        raise FetchError(
            f"releases.id={release_id}: unsupported spotify_format '{spotify_format}'."
        )

    editorial_tier = _parse_integer(row.get("editorial_tier"), "editorial_tier", minimum=0)
    if editorial_tier not in (0, 1, 2, 3):
        raise FetchError(
            f"releases.id={release_id}: editorial_tier must be 0–3, got {editorial_tier}."
        )

    is_feature = row.get("is_feature")
    if not isinstance(is_feature, bool):
        raise FetchError(f"releases.id={release_id}: is_feature must be a boolean.")

    release_date_raw = row.get("release_date")
    release_date: str | None
    if release_date_raw is None or release_date_raw == "":
        release_date = None
    elif isinstance(release_date_raw, str):
        release_date = parse_release_date(release_date_raw)
    else:
        raise FetchError(
            f"releases.id={release_id}: release_date must be a string or null."
        )

    ml_at_release_raw = row.get("monthly_listeners_at_release")
    monthly_listeners_at_release: float | None
    if ml_at_release_raw is None or ml_at_release_raw == "":
        monthly_listeners_at_release = None
    else:
        monthly_listeners_at_release = _parse_number(
            ml_at_release_raw,
            "monthly_listeners_at_release",
        )

    created_at_raw = row.get("created_at")
    created_at: str | None
    if isinstance(created_at_raw, str) and created_at_raw.strip():
        created_at = created_at_raw.strip()
    else:
        created_at = None

    return ReleaseRecord(
        id=release_id,
        track_name=_parse_required_string(row.get("track_name"), "track_name"),
        artist_name=_parse_required_string(row.get("artist_name"), "artist_name"),
        genre=genre,
        monthly_listeners=_parse_number(row.get("monthly_listeners"), "monthly_listeners"),
        is_feature=is_feature,
        editorial_tier=editorial_tier,
        release_type=release_type,
        spotify_format=spotify_format,
        meta_spend_planned=_parse_number(row.get("meta_spend_planned"), "meta_spend_planned"),
        spotify_spend_planned=_parse_number(
            row.get("spotify_spend_planned"),
            "spotify_spend_planned",
        ),
        locked_forecast_streams=_parse_integer(
            row.get("locked_forecast_streams"),
            "locked_forecast_streams",
            minimum=1,
        ),
        status=status,
        release_date=release_date,
        monthly_listeners_at_release=monthly_listeners_at_release,
        created_at=created_at,
    )


def _parse_daily_data_row(row: dict[str, Any]) -> DailyDataPoint:
    release_id = _parse_required_string(row.get("release_id"), "release_id")
    day_number = _parse_integer(row.get("day_number"), "day_number", minimum=1)
    if day_number > config.STREAM_CURVE_DAY_END:
        raise FetchError(
            f"daily_data.release_id={release_id}: day_number must be 1–"
            f"{config.STREAM_CURVE_DAY_END}, got {day_number}."
        )

    return DailyDataPoint(
        id=_parse_required_string(row.get("id"), "id"),
        release_id=release_id,
        day_number=day_number,
        streams=_parse_integer(row.get("streams"), "streams", minimum=0),
        saves=_parse_integer(row.get("saves"), "saves", minimum=0),
        recorded_at=_parse_required_string(row.get("recorded_at"), "recorded_at"),
    )


def fetch_closed_releases(client: Client) -> list[ReleaseRecord]:
    select_columns = (
        RELEASE_SELECT_COLUMNS
        if _releases_have_ml_at_release(client)
        else RELEASE_SELECT_COLUMNS_BASE
    )
    response = (
        client.table(RELEASES_TABLE)
        .select(select_columns)
        .eq("status", "closed")
        .order("closed_at", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    if response.data is None:
        raise FetchError("releases query returned no data payload")

    releases: list[ReleaseRecord] = []
    for row in response.data:
        try:
            releases.append(_parse_release_row(row))
        except FetchError:
            raise
        except (TypeError, ValueError) as error:
            release_id = row.get("id", "<unknown>")
            raise FetchError(f"releases.id={release_id}: invalid row.") from error
    return releases


def fetch_daily_data_for_releases(
    client: Client,
    release_ids: list[str],
) -> list[DailyDataPoint]:
    if not release_ids:
        return []

    response = (
        client.table(DAILY_DATA_TABLE)
        .select(DAILY_DATA_SELECT_COLUMNS)
        .in_("release_id", release_ids)
        .order("day_number")
        .execute()
    )
    if response.data is None:
        raise FetchError("daily_data query returned no data payload")

    points: list[DailyDataPoint] = []
    for row in response.data:
        try:
            points.append(_parse_daily_data_row(row))
        except FetchError:
            raise
        except (TypeError, ValueError) as error:
            release_id = row.get("release_id", "<unknown>")
            raise FetchError(f"daily_data.release_id={release_id}: invalid row.") from error
    return points


def fetch_closed_releases_with_daily_data(client: Client) -> ClosedReleasesBundle:
    releases = fetch_closed_releases(client)
    if not releases:
        return ClosedReleasesBundle(releases=[], daily_data_by_release_id={})

    release_ids = [release.id for release in releases]
    daily_rows = fetch_daily_data_for_releases(client, release_ids)
    return ClosedReleasesBundle(
        releases=releases,
        daily_data_by_release_id=group_daily_data_by_release_id(daily_rows),
    )
