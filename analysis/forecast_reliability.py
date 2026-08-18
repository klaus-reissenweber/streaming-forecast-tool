#!/usr/bin/env python3
"""
Descriptive accuracy of locked week-1 stream forecasts.

ratio = actual_wk1_streams / locked_forecast_streams

Read-only. No fit, no schema or coefficient writes.

Run from repo root:
  retrain/.venv/bin/python analysis/forecast_reliability.py
"""

from __future__ import annotations

import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
RETRAIN_DIR = REPO_ROOT / "retrain"
sys.path.insert(0, str(RETRAIN_DIR))

from dataset import build_training_rows  # noqa: E402
from db import get_db_client  # noqa: E402
from fetch import fetch_closed_releases_with_daily_data  # noqa: E402

OUT_DIR = Path(__file__).resolve().parent
SLICES_CSV = OUT_DIR / "forecast-reliability-slices.csv"
RELEASES_CSV = OUT_DIR / "forecast-reliability-releases.csv"
SUMMARY_JSON = OUT_DIR / "forecast-reliability-summary.json"

BAND_TIGHT = (0.75, 1.25)
BAND_STREAM = (0.45, 1.05)
MIN_CHARACTERIZE = 6


def ml_band(ml: float) -> str:
    if ml < 100_000:
        return "<100k"
    if ml < 500_000:
        return "100k-500k"
    if ml < 2_000_000:
        return "500k-2M"
    return "2M+"


def fetch_roster_counts(client, release_ids: list[str]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    table = client.table("release_artists")
    for start in range(0, len(release_ids), 100):
        chunk = release_ids[start : start + 100]
        response = (
            table.select("release_id")
            .in_("release_id", chunk)
            .execute()
        )
        for row in response.data or []:
            rid = str(row.get("release_id") or "")
            if rid:
                counts[rid] += 1
    return dict(counts)


def stats(ratios: list[float]) -> dict:
    arr = np.asarray(ratios, dtype=float)
    n = int(len(arr))
    if n == 0:
        return {
            "n": 0,
            "median": None,
            "iqr": None,
            "mad": None,
            "p25": None,
            "p75": None,
            "share_0.75_1.25": None,
            "share_0.45_1.05": None,
        }
    p25 = float(np.percentile(arr, 25))
    p75 = float(np.percentile(arr, 75))
    med = float(np.median(arr))
    mad = float(np.median(np.abs(arr - med)))
    return {
        "n": n,
        "median": med,
        "iqr": p75 - p25,
        "mad": mad,
        "p25": p25,
        "p75": p75,
        "share_0.75_1.25": float(np.mean((arr >= BAND_TIGHT[0]) & (arr <= BAND_TIGHT[1]))),
        "share_0.45_1.05": float(np.mean((arr >= BAND_STREAM[0]) & (arr <= BAND_STREAM[1]))),
    }


def main() -> int:
    client = get_db_client()
    bundle = fetch_closed_releases_with_daily_data(client)
    rows = build_training_rows(bundle.releases, bundle.daily_data_by_release_id)
    roster_n = fetch_roster_counts(client, [row.release_id for row in rows])

    records: list[dict] = []
    for row in rows:
        if row.locked_forecast_streams <= 0 or row.wk1_streams < 0:
            continue
        ratio = float(row.wk1_streams) / float(row.locked_forecast_streams)
        artist = (row.artist_name or "").strip() or "(unknown)"
        records.append(
            {
                "release_id": row.release_id,
                "track_name": row.track_name,
                "artist": artist,
                "artist_key": artist.casefold(),
                "genre": row.genre,
                "release_type": row.release_type,
                "editorial_tier": int(row.editorial_tier),
                "is_feature": bool(row.is_feature),
                "monthly_listeners": float(row.monthly_listeners),
                "ml_band": ml_band(row.monthly_listeners),
                "roster_n": int(roster_n.get(row.release_id, 1)),
                "multi_artist": int(roster_n.get(row.release_id, 1)) > 1,
                "wk1_streams": int(row.wk1_streams),
                "locked_forecast_streams": int(row.locked_forecast_streams),
                "ratio": ratio,
            }
        )

    # Slice defs: (dimension, value, records)
    slices: list[tuple[str, str, list[dict]]] = []
    slices.append(("all", "all", records))

    for key, label in (
        ("release_type", "release_type"),
        ("editorial_tier", "editorial_tier"),
        ("genre", "genre"),
        ("ml_band", "ml_band"),
        ("is_feature", "is_feature"),
        ("multi_artist", "multi_artist"),
        ("artist", "artist"),
    ):
        grouped: dict[str, list[dict]] = defaultdict(list)
        for rec in records:
            grouped[str(rec[key])].append(rec)
        if key == "artist":
            by_key: dict[str, list[dict]] = defaultdict(list)
            for rec in records:
                by_key[rec["artist_key"]].append(rec)
            grouped = {}
            for recs in by_key.values():
                if len(recs) < 3:
                    continue
                # Prefer the most common original casing as the label.
                names = [r["artist"] for r in recs]
                label_name = max(set(names), key=names.count)
                grouped[label_name] = recs
        order = sorted(grouped.items(), key=lambda kv: (-len(kv[1]), kv[0]))
        for value, group in order:
            slices.append((label, value, group))

    # Genre × artist counts for collinearity notes
    genre_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    artist_names: dict[str, list[str]] = defaultdict(list)
    for rec in records:
        genre_counts[rec["genre"]][rec["artist_key"]] += 1
        artist_names[rec["artist_key"]].append(rec["artist"])

    def display_name(artist_key: str) -> str:
        names = artist_names[artist_key]
        return max(set(names), key=lambda n: (sum(ch.isupper() for ch in n), names.count(n)))

    genre_artists = {
        genre: {display_name(key): count for key, count in artists.items()}
        for genre, artists in genre_counts.items()
    }

    slice_rows: list[dict] = []
    for dimension, value, group in slices:
        s = stats([r["ratio"] for r in group])
        characterize = s["n"] >= MIN_CHARACTERIZE
        slice_rows.append(
            {
                "dimension": dimension,
                "value": value,
                "n": s["n"],
                "median_ratio": s["median"],
                "iqr": s["iqr"],
                "mad": s["mad"],
                "p25": s["p25"],
                "p75": s["p75"],
                "share_within_0.75_1.25": s["share_0.75_1.25"],
                "share_within_0.45_1.05": s["share_0.45_1.05"],
                "characterize": characterize,
            }
        )

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with SLICES_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "dimension",
                "value",
                "n",
                "median_ratio",
                "iqr",
                "mad",
                "p25",
                "p75",
                "share_within_0.75_1.25",
                "share_within_0.45_1.05",
                "characterize",
            ],
        )
        writer.writeheader()
        writer.writerows(slice_rows)

    with RELEASES_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "release_id",
                "track_name",
                "artist",
                "genre",
                "release_type",
                "editorial_tier",
                "is_feature",
                "monthly_listeners",
                "ml_band",
                "roster_n",
                "multi_artist",
                "wk1_streams",
                "locked_forecast_streams",
                "ratio",
            ],
        )
        writer.writeheader()
        ordered = sorted(records, key=lambda r: r["ratio"])
        writer.writerows({k: rec[k] for k in writer.fieldnames} for rec in ordered)

    summary = {
        "n": len(records),
        "band_tight": BAND_TIGHT,
        "band_stream": BAND_STREAM,
        "min_characterize": MIN_CHARACTERIZE,
        "genre_artists": {
            genre: dict(sorted(artists.items(), key=lambda kv: -kv[1]))
            for genre, artists in sorted(genre_artists.items())
        },
        "slices": slice_rows,
    }
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2, default=str) + "\n")

    def fmt_pct(x: float | None) -> str:
        if x is None:
            return "—"
        return f"{100 * x:5.1f}%"

    def fmt_num(x: float | None) -> str:
        if x is None:
            return "—"
        return f"{x:6.3f}"

    print(f"n={len(records)} wrote {SLICES_CSV.name} {RELEASES_CSV.name}")
    print()
    print(
        f"{'dimension':<16} {'value':<22} {'n':>3} {'median':>7} {'IQR':>6} "
        f"{'MAD':>6} {'±25%':>7} {'band':>7} {'ok':>3}"
    )
    current_dim = None
    for row in slice_rows:
        if row["dimension"] != current_dim:
            current_dim = row["dimension"]
            print()
        flag = "yes" if row["characterize"] else "no"
        print(
            f"{row['dimension']:<16} {str(row['value']):<22} {row['n']:>3} "
            f"{fmt_num(row['median_ratio'])} {fmt_num(row['iqr'])} {fmt_num(row['mad'])} "
            f"{fmt_pct(row['share_within_0.75_1.25'])} "
            f"{fmt_pct(row['share_within_0.45_1.05'])} {flag:>3}"
        )

    print()
    print("Genre × artist:")
    for genre, artists in sorted(genre_artists.items()):
        parts = [f"{name} {count}" for name, count in sorted(artists.items(), key=lambda kv: -kv[1])]
        print(f"  {genre} (n={sum(artists.values())}): " + ", ".join(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
