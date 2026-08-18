#!/usr/bin/env python3
"""
Offline analysis: week-1 streams fit under roster ML aggregation rules.

Read-only. Does not write model_coefficients, does not change retrain/fit.py
or retrain/fetch.py, does not promote.

Run from repo root:
  retrain/.venv/bin/python analysis/ml_roster_aggregation.py
"""

from __future__ import annotations

import csv
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
RETRAIN_DIR = REPO_ROOT / "retrain"
sys.path.insert(0, str(RETRAIN_DIR))

import config  # noqa: E402
from dataset import TrainingRow, build_training_rows  # noqa: E402
from db import get_db_client, load_active_consolidated_payload  # noqa: E402
from fetch import fetch_closed_releases_with_daily_data  # noqa: E402
from fit import (  # noqa: E402
    derive_release_type_magnitude_multipliers,
    fit_streams_d0,
    ols_for_regression_model,
)
from forward_bias import (  # noqa: E402
    compute_forward_bias,
    predict_wk1_streams,
    scorer_from_fit,
    scorer_from_payload,
)
from guardrails import (  # noqa: E402
    apply_outlier_exclusion,
    cooks_d_threshold,
    detect_cooks_outliers,
)

OUT_DIR = Path(__file__).resolve().parent
CSV_PATH = OUT_DIR / "ml-roster-aggregation.csv"
SUMMARY_PATH = OUT_DIR / "ml-roster-aggregation-summary.json"

# Secondary for E/F = sum of all non-primary roster MLs with known values.
# G = geometric mean of every roster artist with known ML (equal weight).
RULES = ("A", "B", "C", "D", "E", "F", "G")
RULE_LABELS = {
    "A": "primary only (baseline)",
    "B": "original only (else primary)",
    "C": "max across roster",
    "D": "sum across roster",
    "E": "primary + 0.25 × secondary",
    "F": "primary + 0.50 × secondary",
    "G": "log-mean across roster",
}


@dataclass(frozen=True)
class RosterArtist:
    artist_name: str
    monthly_listeners: float | None
    role: str
    position: int


def _finite_ml(value: float | None) -> float | None:
    if value is None:
        return None
    if not math.isfinite(value) or value < 1:
        return None
    return float(value)


def fetch_rosters(client, release_ids: list[str]) -> dict[str, list[RosterArtist]]:
    by_release: dict[str, list[RosterArtist]] = defaultdict(list)
    table = client.table("release_artists")
    for start in range(0, len(release_ids), 100):
        chunk = release_ids[start : start + 100]
        response = (
            table.select("release_id, artist_name, monthly_listeners, role, position")
            .in_("release_id", chunk)
            .order("position")
            .execute()
        )
        for row in response.data or []:
            release_id = str(row.get("release_id") or "")
            if not release_id:
                continue
            ml_raw = row.get("monthly_listeners")
            ml: float | None
            if ml_raw is None or ml_raw == "":
                ml = None
            else:
                ml = _finite_ml(float(ml_raw))
            by_release[release_id].append(
                RosterArtist(
                    artist_name=str(row.get("artist_name") or "").strip(),
                    monthly_listeners=ml,
                    role=str(row.get("role") or ""),
                    position=int(row.get("position") or 0),
                )
            )
    for artists in by_release.values():
        artists.sort(key=lambda a: a.position)
    return dict(by_release)


def primary_ml(artists: list[RosterArtist], frozen: float) -> float:
    for artist in artists:
        if artist.role == "primary":
            return artist.monthly_listeners if artist.monthly_listeners is not None else frozen
    return frozen


def known_mls(artists: list[RosterArtist], frozen: float) -> list[float]:
    values: list[float] = []
    saw_primary = False
    for artist in artists:
        if artist.role == "primary":
            saw_primary = True
            values.append(primary_ml([artist], frozen))
            continue
        if artist.monthly_listeners is not None:
            values.append(artist.monthly_listeners)
    if not values:
        values.append(frozen)
    elif not saw_primary:
        # Keep frozen primary in the pool if roster is missing a primary row.
        values.insert(0, frozen)
    return values


def secondary_sum(artists: list[RosterArtist]) -> float:
    """Sum of non-primary known MLs. 0 if none (E/F collapse to primary)."""
    total = 0.0
    for artist in artists:
        if artist.role == "primary":
            continue
        if artist.monthly_listeners is not None:
            total += artist.monthly_listeners
    return total


def ml_for_rule(
    rule: str,
    artists: list[RosterArtist],
    frozen: float,
) -> float:
    p = primary_ml(artists, frozen)
    if rule == "A":
        return frozen
    if rule == "B":
        originals = [a for a in artists if a.role == "original"]
        if originals and originals[0].monthly_listeners is not None:
            return originals[0].monthly_listeners
        return p
    if rule == "C":
        return max(known_mls(artists, frozen))
    if rule == "D":
        return sum(known_mls(artists, frozen))
    if rule == "E":
        return p + 0.25 * secondary_sum(artists)
    if rule == "F":
        return p + 0.50 * secondary_sum(artists)
    if rule == "G":
        values = known_mls(artists, frozen)
        return float(math.exp(sum(math.log(v) for v in values) / len(values)))
    raise ValueError(f"unknown rule {rule}")


def streams_d0_cooks(rows: list[TrainingRow]) -> dict[str, float]:
    sample, result = ols_for_regression_model("streams_d0", rows)
    threshold = cooks_d_threshold(len(sample))
    cooks_raw = result.get_influence().cooks_distance
    if isinstance(cooks_raw, tuple):
        distances = np.asarray(cooks_raw[0]).ravel()
    else:
        distances = np.ravel(cooks_raw)
    out: dict[str, float] = {}
    for index, row in enumerate(sample):
        out[row.release_id] = float(distances[index])
    out["_threshold"] = float(threshold)
    return out


def iqr(values: list[float]) -> float:
    arr = np.asarray(values, dtype=float)
    return float(np.percentile(arr, 75) - np.percentile(arr, 25))


def median(values: list[float]) -> float:
    return float(np.median(np.asarray(values, dtype=float)))


def main() -> int:
    client = get_db_client()
    bundle = fetch_closed_releases_with_daily_data(client)
    rows = build_training_rows(bundle.releases, bundle.daily_data_by_release_id)
    if not rows:
        raise SystemExit("no eligible training rows")

    live_payload = load_active_consolidated_payload(client)
    live_scorer = scorer_from_payload(live_payload)

    release_by_id = {r.id: r for r in bundle.releases}
    rosters = fetch_rosters(client, [row.release_id for row in rows])

    frozen_by_id = {row.release_id: float(row.monthly_listeners) for row in rows}

    multi_ids: list[str] = []
    roster_notes: list[dict] = []
    frozen_vs_primary_mismatches: list[dict] = []

    for row in rows:
        artists = rosters.get(row.release_id, [])
        frozen = frozen_by_id[row.release_id]
        p = primary_ml(artists, frozen)
        secondary_rows = [a for a in artists if a.role != "primary"]
        if len(artists) > 1 or secondary_rows:
            multi_ids.append(row.release_id)
        if abs(p - frozen) > 0.5:
            frozen_vs_primary_mismatches.append(
                {
                    "release_id": row.release_id,
                    "track_name": row.track_name,
                    "frozen_ml": frozen,
                    "roster_primary_ml": p,
                }
            )
        roster_notes.append(
            {
                "release_id": row.release_id,
                "track_name": row.track_name,
                "artist_name": row.artist_name,
                "genre": row.genre,
                "release_type": row.release_type,
                "is_feature": row.is_feature,
                "editorial_tier": row.editorial_tier,
                "wk1_streams": row.wk1_streams,
                "frozen_ml": frozen,
                "roster": [
                    {
                        "name": a.artist_name,
                        "role": a.role,
                        "position": a.position,
                        "ml": a.monthly_listeners,
                    }
                    for a in artists
                ],
                "secondary_count": len(secondary_rows),
                "secondary_sum": secondary_sum(artists),
            }
        )

    multi_ids = sorted(set(multi_ids))
    multi_set = set(multi_ids)

    rule_summaries: dict[str, dict] = {}
    per_release: dict[str, dict] = {}
    for row in rows:
        per_release[row.release_id] = {
            "release_id": row.release_id,
            "track_name": row.track_name,
            "artist_name": row.artist_name,
            "genre": row.genre,
            "release_type": row.release_type,
            "is_feature": row.is_feature,
            "editorial_tier": row.editorial_tier,
            "wk1_streams": row.wk1_streams,
            "frozen_ml": frozen_by_id[row.release_id],
            "is_multi_artist": row.release_id in multi_set,
            "roster_n": len(rosters.get(row.release_id, [])),
            "roster_roles": "|".join(
                f"{a.role}:{a.artist_name}" for a in rosters.get(row.release_id, [])
            ),
        }

    for rule in RULES:
        remapped: list[TrainingRow] = []
        ml_by_id: dict[str, float] = {}
        differ_count = 0
        for row in rows:
            artists = rosters.get(row.release_id, [])
            frozen = frozen_by_id[row.release_id]
            ml = ml_for_rule(rule, artists, frozen)
            if ml < 1:
                raise SystemExit(f"{rule}: ML < 1 for {row.release_id}")
            ml_by_id[row.release_id] = ml
            if abs(ml - frozen) > 0.5:
                differ_count += 1
            remapped.append(replace(row, monthly_listeners=ml))

        flags, excluded = detect_cooks_outliers(remapped)
        clean = apply_outlier_exclusion(remapped, excluded)
        d0_cooks = streams_d0_cooks(remapped)
        d0_threshold = d0_cooks.pop("_threshold")
        d0_drops = {
            rid
            for rid, d in d0_cooks.items()
            if d > d0_threshold
        }

        fit = fit_streams_d0(clean)
        magnitude = derive_release_type_magnitude_multipliers(clean)
        new_scorer = scorer_from_fit(fit, magnitude)
        bias = compute_forward_bias(
            remapped,
            clean,
            live=live_scorer,
            new=new_scorer,
        )

        ratios_all: list[float] = []
        for row in remapped:
            pred = predict_wk1_streams(row, fit, magnitude.multipliers)
            if row.wk1_streams > 0 and math.isfinite(pred) and pred > 0:
                ratios_all.append(float(row.wk1_streams) / pred)

            log_resid = math.log(row.wk1_streams) - (
                fit.intercept
                + fit.log_ml * math.log(row.monthly_listeners)
                + fit.feat * (1.0 if row.is_feature else 0.0)
                + fit.ed_tier * float(row.editorial_tier)
            )
            rec = per_release[row.release_id]
            rec[f"{rule}_ml"] = row.monthly_listeners
            rec[f"{rule}_pred"] = pred
            rec[f"{rule}_ratio"] = (
                float(row.wk1_streams) / pred
                if row.wk1_streams > 0 and math.isfinite(pred) and pred > 0
                else None
            )
            rec[f"{rule}_log_resid"] = log_resid
            rec[f"{rule}_cooks_dropped"] = row.release_id in excluded
            rec[f"{rule}_cooks_d0"] = d0_cooks.get(row.release_id)
            rec[f"{rule}_cooks_d0_dropped"] = row.release_id in d0_drops

        drop_flags_by_id: dict[str, list[str]] = defaultdict(list)
        for flag in flags:
            drop_flags_by_id[flag.release_id].append(flag.model_type)

        multi_in_drops = [
            {
                "release_id": rid,
                "track_name": per_release[rid]["track_name"],
                "artist_name": per_release[rid]["artist_name"],
                "models": sorted(set(drop_flags_by_id[rid])),
                "cooks_d0": d0_cooks.get(rid),
            }
            for rid in sorted(multi_set & set(excluded))
        ]
        multi_in_d0_drops = [
            per_release[rid]["track_name"]
            for rid in sorted(multi_set & d0_drops)
        ]

        rule_summaries[rule] = {
            "label": RULE_LABELS[rule],
            "n_differ_from_frozen": differ_count,
            "cooks_d_drops": len(excluded),
            "cooks_d_dropped_ids": sorted(excluded),
            "cooks_d_dropped_names": [
                f"{per_release[rid]['track_name']} ({per_release[rid]['artist_name']})"
                for rid in sorted(excluded)
            ],
            "cooks_d_models_by_id": {
                rid: sorted(set(models)) for rid, models in drop_flags_by_id.items()
            },
            "clean_set_size": len(clean),
            "r2_clean": fit.r2,
            "rmse_clean": fit.rmse,
            "intercept": fit.intercept,
            "log_ml": fit.log_ml,
            "feat": fit.feat,
            "ed_tier": fit.ed_tier,
            "forward_bias_all_new": bias["all"]["new"],
            "forward_bias_clean_new": bias["clean"]["new"],
            "forward_bias_all_live": bias["all"]["live"],
            "forward_bias_clean_live": bias["clean"]["live"],
            "ratio_median_all": median(ratios_all) if ratios_all else None,
            "ratio_iqr_all": iqr(ratios_all) if ratios_all else None,
            "ratio_p25_all": float(np.percentile(ratios_all, 25)) if ratios_all else None,
            "ratio_p75_all": float(np.percentile(ratios_all, 75)) if ratios_all else None,
            "n_ratios": len(ratios_all),
            "streams_d0_only_drops": len(d0_drops),
            "streams_d0_threshold": d0_threshold,
            "multi_artist_in_cooks_drops": multi_in_drops,
            "multi_artist_in_d0_drops": multi_in_d0_drops,
            "magnitude_multipliers": dict(magnitude.multipliers),
        }

    summary = {
        "eligible_n": len(rows),
        "closed_n": len(bundle.releases),
        "multi_artist_n": len(multi_ids),
        "multi_artist_ids": multi_ids,
        "frozen_vs_roster_primary_mismatches": frozen_vs_primary_mismatches,
        "secondary_definition": (
            "E/F secondary = sum of monthly_listeners on all non-primary roster "
            "rows with known ML. Null secondary ML is skipped (not treated as 0). "
            "If no secondary has ML, secondary=0 and E/F collapse to primary. "
            "G = exp(mean(log(ml))) over every roster artist with known ML, "
            "equal weight, including primary; 3+ artists are all included."
        ),
        "cooks_procedure": (
            "Live retrain: union of Cook's D > 4/n across streams_d0–d7 + saves "
            "on the eligible pool; streams_d0 is then refit on the complement. "
            "streams_d0-only drop count is also reported as a diagnostic."
        ),
        "multi_artist_rosters": [
            note for note in roster_notes if note["release_id"] in multi_set
        ],
        "rules": rule_summaries,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2, default=str) + "\n")

    fieldnames = [
        "release_id",
        "track_name",
        "artist_name",
        "genre",
        "release_type",
        "is_feature",
        "editorial_tier",
        "wk1_streams",
        "frozen_ml",
        "is_multi_artist",
        "roster_n",
        "roster_roles",
    ]
    for rule in RULES:
        fieldnames.extend(
            [
                f"{rule}_ml",
                f"{rule}_pred",
                f"{rule}_ratio",
                f"{rule}_log_resid",
                f"{rule}_cooks_dropped",
                f"{rule}_cooks_d0",
                f"{rule}_cooks_d0_dropped",
            ]
        )

    with CSV_PATH.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            rec = per_release[row.release_id]
            writer.writerow({key: rec.get(key) for key in fieldnames})

    print(f"eligible={len(rows)} multi_artist={len(multi_ids)}")
    print(f"wrote {CSV_PATH}")
    print(f"wrote {SUMMARY_PATH}")
    print()
    header = (
        f"{'rule':<4} {'drops':>5} {'d0':>4} {'clean':>5} {'R2':>7} "
        f"{'bias_all':>9} {'bias_cln':>9} {'med_ratio':>9} {'iqr':>7} "
        f"{'multi_in_drops'}"
    )
    print(header)
    for rule in RULES:
        s = rule_summaries[rule]
        names = ", ".join(
            m["track_name"] for m in s["multi_artist_in_cooks_drops"]
        ) or "—"
        print(
            f"{rule:<4} {s['cooks_d_drops']:>5} {s['streams_d0_only_drops']:>4} "
            f"{s['clean_set_size']:>5} {s['r2_clean']:>7.4f} "
            f"{s['forward_bias_all_new']:>9.4f} {s['forward_bias_clean_new']:>9.4f} "
            f"{s['ratio_median_all']:>9.4f} {s['ratio_iqr_all']:>7.4f} "
            f"{names}"
        )
    print()
    print("Multi-artist rosters:")
    for note in summary["multi_artist_rosters"]:
        bits = ", ".join(
            f"{a['role']} {a['name']} ml={a['ml']}" for a in note["roster"]
        )
        print(f"  {note['track_name']} [{note['artist_name']}] {bits}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
