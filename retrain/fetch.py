"""
Supabase reads for closed releases and daily_data (see RETRAINING.md).

Mirrors lib/load-closed-releases.ts — two batched queries, no writes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from supabase import Client

import config
from dataset import DailyDataPoint, ReleaseRecord, group_daily_data_by_release_id

RELEASES_TABLE = "releases"
DAILY_DATA_TABLE = "daily_data"

RELEASE_SELECT_COLUMNS = (
    "id, track_name, artist_name, genre, monthly_listeners, is_feature, "
    "editorial_tier, release_type, spotify_format, meta_spend_planned, "
    "spotify_spend_planned, status"
)

DAILY_DATA_SELECT_COLUMNS = (
    "id, release_id, day_number, streams, saves, other_pct, recorded_at"
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
        status=status,
    )


def _parse_daily_data_row(row: dict[str, Any]) -> DailyDataPoint:
    release_id = _parse_required_string(row.get("release_id"), "release_id")
    day_number = _parse_integer(row.get("day_number"), "day_number", minimum=1)
    if day_number > config.STREAM_CURVE_DAY_END:
        raise FetchError(
            f"daily_data.release_id={release_id}: day_number must be 1–"
            f"{config.STREAM_CURVE_DAY_END}, got {day_number}."
        )

    other_pct_raw = row.get("other_pct")
    other_pct: float | None
    if other_pct_raw is None:
        other_pct = None
    else:
        other_pct = _parse_number(other_pct_raw, "other_pct")

    return DailyDataPoint(
        id=_parse_required_string(row.get("id"), "id"),
        release_id=release_id,
        day_number=day_number,
        streams=_parse_integer(row.get("streams"), "streams", minimum=0),
        saves=_parse_integer(row.get("saves"), "saves", minimum=0),
        other_pct=other_pct,
        recorded_at=_parse_required_string(row.get("recorded_at"), "recorded_at"),
    )


def fetch_closed_releases(client: Client) -> list[ReleaseRecord]:
    response = (
        client.table(RELEASES_TABLE)
        .select(RELEASE_SELECT_COLUMNS)
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
