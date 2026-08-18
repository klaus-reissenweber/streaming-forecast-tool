#!/usr/bin/env python3
"""
Descriptive cost-per-attributed-stream on usable Spotify campaigns.

cps = spend_usd / est_attributed_streams
Usable = ad_spotify_campaigns.usable_for_modeling.

Analysis only. No fit, no schema/coefficient writes.

Run from repo root:
  retrain/.venv/bin/python analysis/cps_usable_campaigns.py
"""

from __future__ import annotations

import csv
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
RETRAIN_DIR = REPO_ROOT / "retrain"
sys.path.insert(0, str(RETRAIN_DIR))

import config  # noqa: E402
from db import get_db_client  # noqa: E402

OUT = Path(__file__).resolve().parent
CAMPAIGNS_CSV = OUT / "cps-usable-campaigns.csv"
SLICES_CSV = OUT / "cps-usable-slices.csv"
SUMMARY_JSON = OUT / "cps-usable-summary.json"

MIN_DIRECTIONAL = 6
MIN_QUOTE = 10
MIN_QUOTE_ARTISTS = 3


def nfkd_alnum(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]", "", text.lower())


def release_key(track_name: str) -> str:
    text = unicodedata.normalize("NFKD", track_name or "")
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    return re.sub(r"\s+", " ", text)[:120]


def ml_band(ml: float) -> str:
    if ml < 100_000:
        return "<100k"
    if ml < 500_000:
        return "100k-500k"
    if ml < 2_000_000:
        return "500k-2M"
    return "2M+"


def tier_from_ml(ml: float) -> str:
    return config.artist_tier_from_monthly_listeners(ml)


def finite(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(n):
        return None
    return n


def stats(values: list[float]) -> dict:
    if not values:
        return {
            "n": 0,
            "median": None,
            "mean": None,
            "iqr": None,
            "p25": None,
            "p75": None,
            "min": None,
            "max": None,
            "spend_weighted": None,
        }
    arr = np.asarray(values, dtype=float)
    return {
        "n": int(len(arr)),
        "median": float(np.median(arr)),
        "mean": float(np.mean(arr)),
        "iqr": float(np.percentile(arr, 75) - np.percentile(arr, 25)),
        "p25": float(np.percentile(arr, 25)),
        "p75": float(np.percentile(arr, 75)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
    }


def quote_label(n: int, n_artists: int, iqr: float | None, median: float | None) -> str:
    if n < MIN_DIRECTIONAL:
        return "too_thin"
    if n < MIN_QUOTE or n_artists < MIN_QUOTE_ARTISTS:
        return "directional"
    if median is not None and iqr is not None and median > 0 and iqr > 2 * median:
        return "directional_wide"
    return "quote"


def paginate(client, table: str, columns: str) -> list[dict]:
    rows: list[dict] = []
    start = 0
    page = 1000
    while True:
        resp = (
            client.table(table)
            .select(columns)
            .range(start, start + page - 1)
            .execute()
        )
        chunk = resp.data or []
        rows.extend(chunk)
        if len(chunk) < page:
            break
        start += page
    return rows


def main() -> int:
    client = get_db_client()
    campaigns = paginate(
        client,
        "ad_spotify_campaigns",
        "id, artist, release_key, campaign_uid, format, spend_usd, "
        "converted_listeners, est_attributed_streams, usable_for_modeling, "
        "exclusion_reason, country, release_type, derived_fields",
    )
    releases = paginate(
        client,
        "releases",
        "id, track_name, genre, monthly_listeners, monthly_listeners_at_release, status",
    )
    roster = paginate(
        client,
        "release_artists",
        "release_id, artist_name, monthly_listeners, role",
    )

    release_by_id = {str(r["id"]): r for r in releases}
    genre_by_key: dict[str, Counter] = defaultdict(Counter)
    ml_by_key: dict[str, list[float]] = defaultdict(list)
    genre_by_release_key: dict[str, str] = {}
    ml_by_release_key: dict[str, float] = {}

    for rel in releases:
        key = release_key(str(rel.get("track_name") or ""))
        genre = str(rel.get("genre") or "")
        ml = finite(rel.get("monthly_listeners_at_release")) or finite(
            rel.get("monthly_listeners")
        )
        if key and genre:
            genre_by_release_key[key] = genre
        if key and ml is not None:
            ml_by_release_key[key] = ml

    for row in roster:
        rel = release_by_id.get(str(row.get("release_id") or ""))
        if not rel:
            continue
        akey = nfkd_alnum(str(row.get("artist_name") or ""))
        if not akey:
            continue
        genre = str(rel.get("genre") or "")
        if genre:
            genre_by_key[akey][genre] += 1
        ml = finite(row.get("monthly_listeners"))
        if ml is None:
            ml = finite(rel.get("monthly_listeners_at_release")) or finite(
                rel.get("monthly_listeners")
            )
        if ml is not None:
            ml_by_key[akey].append(ml)

    usable_all = [c for c in campaigns if bool(c.get("usable_for_modeling"))]
    records = []
    skipped_no_cps = 0
    for c in usable_all:
        spend = finite(c.get("spend_usd"))
        streams = finite(c.get("est_attributed_streams"))
        if spend is None or spend <= 0 or streams is None or streams <= 0:
            skipped_no_cps += 1
            continue
        artist = str(c.get("artist") or "").strip()
        akey = nfkd_alnum(artist)
        rkey = str(c.get("release_key") or "").strip()
        genre = genre_by_release_key.get(rkey)
        if not genre and akey in genre_by_key:
            genre = genre_by_key[akey].most_common(1)[0][0]
        ml = ml_by_release_key.get(rkey)
        if ml is None and akey in ml_by_key:
            ml = float(np.median(ml_by_key[akey]))
        fmt = str(c.get("format") or "")
        records.append(
            {
                "id": str(c.get("id")),
                "artist": artist,
                "artist_key": akey,
                "release_key": rkey,
                "format": fmt,
                "country": c.get("country"),
                "spend": spend,
                "streams": streams,
                "cps": spend / streams,
                "listeners": finite(c.get("converted_listeners")),
                "genre": genre or "unmatched",
                "ml": ml,
                "tier": tier_from_ml(ml) if ml is not None else "unmatched",
                "ml_band": ml_band(ml) if ml is not None else "unmatched",
                "genre_source": (
                    "release_key"
                    if rkey in genre_by_release_key
                    else ("artist" if genre else "none")
                ),
            }
        )

    slices: list[dict] = []

    def add_slice(dimension: str, value: str, rows: list[dict]) -> None:
        cps_vals = [r["cps"] for r in rows]
        spends = [r["spend"] for r in rows]
        streams = [r["streams"] for r in rows]
        s = stats(cps_vals)
        n_artists = len({r["artist_key"] for r in rows if r["artist_key"]})
        top_artist = Counter(r["artist"] for r in rows).most_common(1)
        top_name, top_n = top_artist[0] if top_artist else ("", 0)
        spend_w = (
            float(sum(spends) / sum(streams)) if sum(streams) > 0 else None
        )
        label = quote_label(s["n"], n_artists, s["iqr"], s["median"])
        slices.append(
            {
                "dimension": dimension,
                "value": value,
                "n": s["n"],
                "n_artists": n_artists,
                "top_artist": top_name,
                "top_artist_share": (top_n / s["n"]) if s["n"] else None,
                "median_cps": s["median"],
                "mean_cps": s["mean"],
                "iqr": s["iqr"],
                "p25": s["p25"],
                "p75": s["p75"],
                "min": s["min"],
                "max": s["max"],
                "spend_weighted_cps": spend_w,
                "total_spend": float(sum(spends)),
                "total_streams": float(sum(streams)),
                "quote": label,
            }
        )

    add_slice("all", "usable_with_cps", records)
    for fmt in ("marquee", "showcase"):
        add_slice("format", fmt, [r for r in records if r["format"] == fmt])
    for genre in list(config.GENRES) + ["unmatched"]:
        group = [r for r in records if r["genre"] == genre]
        if group:
            add_slice("genre", genre, group)
    for tier in list(config.ARTIST_TIERS) + ["unmatched"]:
        group = [r for r in records if r["tier"] == tier]
        if group:
            add_slice("tier", tier, group)
    for fmt in ("marquee", "showcase"):
        for genre in list(config.GENRES) + ["unmatched"]:
            group = [
                r
                for r in records
                if r["format"] == fmt and r["genre"] == genre
            ]
            if group:
                add_slice("format×genre", f"{fmt} | {genre}", group)
        for tier in list(config.ARTIST_TIERS) + ["unmatched"]:
            group = [
                r for r in records if r["format"] == fmt and r["tier"] == tier
            ]
            if group:
                add_slice("format×tier", f"{fmt} | {tier}", group)

    OUT.mkdir(parents=True, exist_ok=True)
    with CAMPAIGNS_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id",
                "artist",
                "release_key",
                "format",
                "genre",
                "tier",
                "ml_band",
                "ml",
                "spend",
                "streams",
                "cps",
                "listeners",
                "genre_source",
                "country",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(sorted(records, key=lambda r: r["cps"]))

    with SLICES_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(slices[0].keys()))
        writer.writeheader()
        writer.writerows(slices)

    summary = {
        "n_spotify_rows": len(campaigns),
        "n_usable": len(usable_all),
        "n_usable_with_cps": len(records),
        "skipped_no_cps": skipped_no_cps,
        "n_unmatched_genre": sum(1 for r in records if r["genre"] == "unmatched"),
        "n_unmatched_tier": sum(1 for r in records if r["tier"] == "unmatched"),
        "quote_rule": (
            f"quote if n≥{MIN_QUOTE} and ≥{MIN_QUOTE_ARTISTS} artists "
            f"and IQR≤2×median; directional if n≥{MIN_DIRECTIONAL}; else too_thin"
        ),
        "slices": slices,
    }
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2, default=str) + "\n")

    print(
        f"spotify={len(campaigns)} usable={len(usable_all)} "
        f"with_cps={len(records)} skipped={skipped_no_cps} "
        f"genre_unmatched={summary['n_unmatched_genre']} "
        f"tier_unmatched={summary['n_unmatched_tier']}"
    )
    print(
        f"{'dimension':<14} {'value':<28} {'n':>4} {'art':>3} "
        f"{'median':>7} {'IQR':>7} {'p25':>6} {'p75':>6} {'wtd':>7} quote"
    )
    for row in slices:
        med = row["median_cps"]
        print(
            f"{row['dimension']:<14} {str(row['value']):<28} {row['n']:>4} "
            f"{row['n_artists']:>3} "
            f"{(f'{med:7.3f}' if med is not None else '      —')} "
            f"{(f'{row['iqr']:7.3f}' if row['iqr'] is not None else '      —')} "
            f"{(f'{row['p25']:6.3f}' if row['p25'] is not None else '     —')} "
            f"{(f'{row['p75']:6.3f}' if row['p75'] is not None else '     —')} "
            f"{(f'{row['spend_weighted_cps']:7.3f}' if row['spend_weighted_cps'] is not None else '      —')} "
            f"{row['quote']}"
        )
    print(f"wrote {CAMPAIGNS_CSV.name} {SLICES_CSV.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
