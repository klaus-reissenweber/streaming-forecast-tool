#!/usr/bin/env python3
"""
Genre shape comparison on the 58 retrain-eligible closed releases.

  d1_share     = day-1 streams / wk1 streams
  decay        = wk3 streams (D15–D21) / wk1 streams
  save_rate    = (wk1 saves / wk1 streams) * 100

Analysis only. No fit, no schema/coefficient writes.

Run from repo root:
  retrain/.venv/bin/python analysis/genre_curve_shape.py
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
RETRAIN_DIR = REPO_ROOT / "retrain"
sys.path.insert(0, str(RETRAIN_DIR))

import config  # noqa: E402
from dataset import (  # noqa: E402
    build_training_rows,
    editorial_day_number,
    release_iso_weekday,
)
from db import get_db_client  # noqa: E402
from fetch import fetch_closed_releases_with_daily_data  # noqa: E402

OUT = Path(__file__).resolve().parent
RELEASES_CSV = OUT / "genre-curve-shape-releases.csv"
SLICES_CSV = OUT / "genre-curve-shape-slices.csv"
SUMMARY_JSON = OUT / "genre-curve-shape-summary.json"

MIN_CHAR = 6
WK2_START, WK2_END = 8, 14
WK3_START, WK3_END = 15, 21
DOW_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def stats(values: list[float]) -> dict:
    if not values:
        return {
            "n": 0,
            "median": None,
            "mean": None,
            "iqr": None,
            "p25": None,
            "p75": None,
        }
    arr = np.asarray(values, dtype=float)
    return {
        "n": int(len(arr)),
        "median": float(np.median(arr)),
        "mean": float(np.mean(arr)),
        "iqr": float(np.percentile(arr, 75) - np.percentile(arr, 25)),
        "p25": float(np.percentile(arr, 25)),
        "p75": float(np.percentile(arr, 75)),
    }


def week_sum(streams_by_day: dict[int, int], start: int, end: int) -> tuple[int, int]:
    total = 0
    days = 0
    for day in range(start, end + 1):
        if day in streams_by_day and streams_by_day[day] is not None:
            total += int(streams_by_day[day])
            days += 1
    return total, days


def main() -> int:
    client = get_db_client()
    bundle = fetch_closed_releases_with_daily_data(client)
    rows = build_training_rows(bundle.releases, bundle.daily_data_by_release_id)

    records: list[dict] = []
    for row in rows:
        wk1 = int(row.wk1_streams)
        d1 = row.streams_by_day.get(1)
        wk2, wk2_days = week_sum(row.streams_by_day, WK2_START, WK2_END)
        wk3, wk3_days = week_sum(row.streams_by_day, WK3_START, WK3_END)
        iso = release_iso_weekday(row.release_date) if row.release_date else None
        artist = (row.artist_name or "").strip()
        rec = {
            "release_id": row.release_id,
            "track_name": row.track_name,
            "artist": artist,
            "artist_key": artist.casefold(),
            "genre": row.genre,
            "release_type": row.release_type,
            "is_feature": row.is_feature,
            "editorial_tier": row.editorial_tier,
            "release_date": row.release_date,
            "release_dow": DOW_NAMES[iso - 1] if iso else None,
            "editorial_day": editorial_day_number(row.release_date)
            if row.release_date
            else None,
            "wk1_streams": wk1,
            "wk1_saves": int(row.wk1_saves),
            "d1_streams": d1,
            "d1_share": (float(d1) / wk1) if d1 is not None and wk1 > 0 else None,
            "wk2_streams": wk2 if wk2_days > 0 else None,
            "wk2_days": wk2_days,
            "wk2_complete": wk2_days == 7,
            "decay_wk2": (float(wk2) / wk1) if wk2_days == 7 and wk1 > 0 else None,
            "wk3_streams": wk3 if wk3_days > 0 else None,
            "wk3_days": wk3_days,
            "wk3_complete": wk3_days == 7,
            "decay_wk3": (float(wk3) / wk1) if wk3_days == 7 and wk1 > 0 else None,
            "save_rate": (
                (float(row.wk1_saves) / wk1) * 100
                if wk1 > 0 and row.wk1_saves > 0
                else None
            ),
        }
        records.append(rec)

    slices: list[dict] = []

    def add_slice(dimension: str, value: str, group: list[dict]) -> None:
        artists = Counter(r["artist_key"] for r in group)
        top_key, top_n = artists.most_common(1)[0] if artists else ("", 0)
        top_name = next(
            (r["artist"] for r in group if r["artist_key"] == top_key), ""
        )
        display = max(
            (r["artist"] for r in group if r["artist_key"] == top_key),
            key=lambda n: sum(ch.isupper() for ch in n),
            default=top_name,
        )
        d1 = stats([r["d1_share"] for r in group if r["d1_share"] is not None])
        decay = stats([r["decay_wk2"] for r in group if r["decay_wk2"] is not None])
        decay3 = stats([r["decay_wk3"] for r in group if r["decay_wk3"] is not None])
        save = stats([r["save_rate"] for r in group if r["save_rate"] is not None])
        slices.append(
            {
                "dimension": dimension,
                "value": value,
                "n": len(group),
                "n_artists": len(artists),
                "top_artist": display,
                "top_artist_n": top_n,
                "top_artist_share": (top_n / len(group)) if group else None,
                "n_d1": d1["n"],
                "d1_median": d1["median"],
                "d1_mean": d1["mean"],
                "d1_iqr": d1["iqr"],
                "d1_p25": d1["p25"],
                "d1_p75": d1["p75"],
                "n_decay_wk2": decay["n"],
                "decay_wk2_median": decay["median"],
                "decay_wk2_mean": decay["mean"],
                "decay_wk2_iqr": decay["iqr"],
                "decay_wk2_p25": decay["p25"],
                "decay_wk2_p75": decay["p75"],
                "n_decay_wk3": decay3["n"],
                "decay_wk3_median": decay3["median"],
                "n_save": save["n"],
                "save_median": save["median"],
                "save_mean": save["mean"],
                "save_iqr": save["iqr"],
                "save_p25": save["p25"],
                "save_p75": save["p75"],
                "characterize_d1": d1["n"] >= MIN_CHAR,
                "characterize_decay": decay["n"] >= MIN_CHAR,
                "characterize_save": save["n"] >= MIN_CHAR,
            }
        )

    add_slice("all", "all", records)
    for genre in config.GENRES:
        add_slice("genre", genre, [r for r in records if r["genre"] == genre])

    # Artists with 3+ in a genre (collinearity)
    genre_artists: dict[str, dict[str, list[dict]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for rec in records:
        genre_artists[rec["genre"]][rec["artist_key"]].append(rec)
    for genre, by_artist in genre_artists.items():
        for akey, group in by_artist.items():
            if len(group) < 3:
                continue
            name = max(
                (r["artist"] for r in group),
                key=lambda n: (sum(ch.isupper() for ch in n), n),
            )
            add_slice("genre×artist", f"{genre} | {name}", group)

    # Release weekday as a D1 confound
    for dow in DOW_NAMES:
        group = [r for r in records if r["release_dow"] == dow]
        if group:
            add_slice("release_dow", dow, group)

    for genre in config.GENRES:
        fri = [
            r
            for r in records
            if r["genre"] == genre and r["release_dow"] == "Fri"
        ]
        if fri:
            add_slice("genre | Friday", genre, fri)

    OUT.mkdir(parents=True, exist_ok=True)
    with RELEASES_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "release_id",
                "track_name",
                "artist",
                "genre",
                "release_type",
                "is_feature",
                "editorial_tier",
                "release_dow",
                "editorial_day",
                "wk1_streams",
                "wk1_saves",
                "d1_streams",
                "d1_share",
                "wk2_streams",
                "wk2_complete",
                "decay_wk2",
                "wk3_streams",
                "wk3_days",
                "wk3_complete",
                "decay_wk3",
                "save_rate",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(sorted(records, key=lambda r: (r["genre"], r["track_name"])))

    with SLICES_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(slices[0].keys()))
        writer.writeheader()
        writer.writerows(slices)

    SUMMARY_JSON.write_text(
        json.dumps(
            {
                "n": len(records),
                "n_d1": sum(1 for r in records if r["d1_share"] is not None),
                "n_decay_wk2": sum(1 for r in records if r["decay_wk2"] is not None),
                "n_decay_wk3": sum(1 for r in records if r["decay_wk3"] is not None),
                "n_save": sum(1 for r in records if r["save_rate"] is not None),
                "min_characterize": MIN_CHAR,
                "wk2_window": [WK2_START, WK2_END],
                "wk3_window": [WK3_START, WK3_END],
                "slices": slices,
            },
            indent=2,
            default=str,
        )
        + "\n"
    )

    def pct(x: float | None, digits=1) -> str:
        if x is None:
            return "    —"
        return f"{100 * x:5.{digits}f}%" if x <= 1.5 else f"{x:6.1f}"

    def ratio(x: float | None) -> str:
        if x is None:
            return "    —"
        return f"{x:5.2f}"

    print(
        f"n={len(records)} d1={sum(1 for r in records if r['d1_share'] is not None)} "
        f"wk2={sum(1 for r in records if r['decay_wk2'] is not None)} "
        f"wk3={sum(1 for r in records if r['decay_wk3'] is not None)} "
        f"save={sum(1 for r in records if r['save_rate'] is not None)}"
    )
    print(
        f"{'slice':<32} {'n':>3} {'art':>3} {'d1 med':>7} "
        f"{'wk2/wk1':>7} {'save%':>6} ok"
    )
    for s in slices:
        if s["dimension"] == "release_dow":
            continue
        ok = (
            "yes"
            if s["characterize_d1"] and s["characterize_decay"] and s["characterize_save"]
            else "partial"
            if s["n"] >= MIN_CHAR
            else "no"
        )
        d1 = s["d1_median"]
        print(
            f"{s['dimension']+' '+s['value']:<32} {s['n']:>3} {s['n_artists']:>3} "
            f"{pct(d1) if d1 is not None and d1<=1 else ratio(d1):>7} "
            f"{ratio(s['decay_wk2_median']):>7} "
            f"{(f'{s['save_median']:6.1f}' if s['save_median'] is not None else '    —'):>6} "
            f"{ok}"
        )
    print("\nD1 by release weekday:")
    for s in slices:
        if s["dimension"] != "release_dow":
            continue
        print(
            f"  {s['value']:<4} n={s['n']:>2} d1_med={pct(s['d1_median'])} "
            f"wk2/wk1={ratio(s['decay_wk2_median'])}"
        )
    print(f"wrote {RELEASES_CSV.name} {SLICES_CSV.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
