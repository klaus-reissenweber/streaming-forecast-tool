#!/usr/bin/env python3
"""
Artist-level structure in week-1 forecast error.

Re-scores all closed complete releases with the CURRENT active streams_d0
model (read-only), then:

  1. ICC by artist on fresh log(actual / predicted) vs frozen locked forecasts
  2. Leave-one-out artist offsets (raw + k=5 shrink toward 0)
  3. Correlation of artist offsets with monthly_listeners

Read-only. No fit, no schema or coefficient writes, no promote.

Run from repo root:
  retrain/.venv/bin/python analysis/artist_offset.py
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
from db import get_db_client, load_active_consolidated_payload  # noqa: E402
from fetch import fetch_closed_releases_with_daily_data  # noqa: E402
from forward_bias import predict_wk1_streams, scorer_from_payload  # noqa: E402

OUT = Path(__file__).resolve().parent
RELEASES_CSV = OUT / "artist-offset-releases.csv"
ARTISTS_CSV = OUT / "artist-offset-artists.csv"
SUMMARY_JSON = OUT / "artist-offset-summary.json"

SHRINKAGE_K = 5
N_BOOT = 5000
BOOT_SEED = 21
WRONG_ML_SUBSTRINGS = (
    "light down",
    "its called freefall",
    "bass cannon",
)


def is_wrong_ml_remix(track_name: str) -> bool:
    key = track_name.casefold()
    return any(s in key for s in WRONG_ML_SUBSTRINGS)


def artist_key(name: str) -> str:
    return (name or "").strip().casefold() or "(unknown)"


def display_name(names: list[str]) -> str:
    if not names:
        return "(unknown)"
    return max(set(names), key=lambda n: (sum(ch.isupper() for ch in n), names.count(n)))


def percentile_ci(samples: list[float], lo: float = 2.5, hi: float = 97.5) -> tuple[float, float] | None:
    arr = np.asarray([s for s in samples if s is not None and math.isfinite(s)], dtype=float)
    if len(arr) < 50:
        return None
    return float(np.percentile(arr, lo)), float(np.percentile(arr, hi))


def median_iqr(values: list[float]) -> dict:
    arr = np.asarray(values, dtype=float)
    if len(arr) == 0:
        return {"n": 0, "median": None, "p25": None, "p75": None, "iqr": None, "mean": None}
    p25 = float(np.percentile(arr, 25))
    p75 = float(np.percentile(arr, 75))
    return {
        "n": int(len(arr)),
        "median": float(np.median(arr)),
        "p25": p25,
        "p75": p75,
        "iqr": p75 - p25,
        "mean": float(np.mean(arr)),
    }


def anova_icc(groups: list[list[float]]) -> dict:
    """
    Unbalanced one-way random-effects ICC(1).

    n0 = (N - Σ n_i² / N) / (k - 1)
    σ²_w = MSW
    σ²_b = (MSB - MSW) / n0
    ICC = σ²_b / (σ²_b + σ²_w)
    deff = 1 + (N/k - 1) * ICC   (mean cluster size, matching the ~37 n_eff note)
    """
    nonempty = [g for g in groups if g]
    k = len(nonempty)
    ns = [len(g) for g in nonempty]
    n = int(sum(ns))
    if k < 2 or n <= k:
        return {
            "n": n,
            "k": k,
            "icc": None,
            "sigma_b": None,
            "sigma_w": None,
            "n0": None,
            "deff": None,
            "n_eff": None,
            "msb": None,
            "msw": None,
        }

    grand = float(np.mean([x for g in nonempty for x in g]))
    ssb = 0.0
    ssw = 0.0
    for g in nonempty:
        mean_i = float(np.mean(g))
        ssb += len(g) * (mean_i - grand) ** 2
        ssw += float(np.sum((np.asarray(g, dtype=float) - mean_i) ** 2))

    dfb = k - 1
    dfw = n - k
    msb = ssb / dfb
    msw = ssw / dfw if dfw > 0 else 0.0
    sum_n2 = float(sum(ni * ni for ni in ns))
    n0 = (n - sum_n2 / n) / dfb
    if n0 <= 0:
        sigma_w = math.sqrt(msw) if msw > 0 else 0.0
        return {
            "n": n,
            "k": k,
            "icc": None,
            "sigma_b": None,
            "sigma_w": sigma_w,
            "n0": n0,
            "deff": None,
            "n_eff": None,
            "msb": msb,
            "msw": msw,
        }

    sigma2_w = msw
    sigma2_b = (msb - msw) / n0
    denom = sigma2_b + sigma2_w
    icc = sigma2_b / denom if denom != 0 else None
    mean_size = n / k
    deff = (1.0 + (mean_size - 1.0) * icc) if icc is not None else None
    n_eff = (n / deff) if deff and deff > 0 else None
    return {
        "n": n,
        "k": k,
        "icc": icc,
        "sigma_b": math.sqrt(max(sigma2_b, 0.0)),
        "sigma_w": math.sqrt(max(sigma2_w, 0.0)),
        "sigma2_b_raw": sigma2_b,
        "sigma2_w": sigma2_w,
        "n0": n0,
        "mean_cluster_size": mean_size,
        "deff": deff,
        "n_eff": n_eff,
        "msb": msb,
        "msw": msw,
    }


def group_by_artist(records: list[dict], field: str) -> list[list[float]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for rec in records:
        buckets[rec["artist_key"]].append(float(rec[field]))
    return list(buckets.values())


def bootstrap_icc(records: list[dict], field: str, rng: np.random.Generator) -> list[float]:
    by_artist: dict[str, list[float]] = defaultdict(list)
    for rec in records:
        by_artist[rec["artist_key"]].append(float(rec[field]))
    keys = list(by_artist.keys())
    k = len(keys)
    out: list[float] = []
    for _ in range(N_BOOT):
        draw = rng.choice(keys, size=k, replace=True)
        groups = [by_artist[key] for key in draw]
        icc = anova_icc(groups)["icc"]
        if icc is not None and math.isfinite(icc):
            out.append(float(icc))
    return out


def bootstrap_spearman(
    xs: list[float],
    ys: list[float],
    rng: np.random.Generator,
) -> list[float]:
    n = len(xs)
    x = np.asarray(xs, dtype=float)
    y = np.asarray(ys, dtype=float)
    out: list[float] = []
    for _ in range(N_BOOT):
        idx = rng.integers(0, n, size=n)
        rho = spearman(x[idx], y[idx])
        if rho is not None:
            out.append(rho)
    return out


def spearman(x: np.ndarray, y: np.ndarray) -> float | None:
    if len(x) < 3:
        return None
    rx = rankdata(x)
    ry = rankdata(y)
    if float(np.std(rx)) == 0.0 or float(np.std(ry)) == 0.0:
        return None
    return float(np.corrcoef(rx, ry)[0, 1])


def pearson(x: np.ndarray, y: np.ndarray) -> float | None:
    if len(x) < 3:
        return None
    if float(np.std(x)) == 0.0 or float(np.std(y)) == 0.0:
        return None
    return float(np.corrcoef(x, y)[0, 1])


def rankdata(a: np.ndarray) -> np.ndarray:
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(len(a), dtype=float)
    i = 0
    while i < len(a):
        j = i
        while j + 1 < len(a) and a[order[j + 1]] == a[order[i]]:
            j += 1
        avg = 0.5 * (i + j) + 1.0
        ranks[order[i : j + 1]] = avg
        i = j + 1
    return ranks


def attach_offsets(records: list[dict], error_field: str = "fresh_log_error") -> None:
    by_artist: dict[str, list[int]] = defaultdict(list)
    for i, rec in enumerate(records):
        by_artist[rec["artist_key"]].append(i)

    artist_n = {key: len(idxs) for key, idxs in by_artist.items()}
    artist_mean: dict[str, float] = {}
    artist_shrunk: dict[str, float] = {}
    for key, idxs in by_artist.items():
        errs = [records[i][error_field] for i in idxs]
        mean_err = float(np.mean(errs))
        n = len(idxs)
        artist_mean[key] = mean_err
        artist_shrunk[key] = (n * mean_err) / (n + SHRINKAGE_K)

    for rec in records:
        key = rec["artist_key"]
        rec["artist_n"] = artist_n[key]
        rec["artist_offset"] = artist_mean[key]
        rec["artist_offset_shrunk"] = artist_shrunk[key]
        rec["n_other"] = artist_n[key] - 1

    for key, idxs in by_artist.items():
        n = len(idxs)
        errs = [records[i][error_field] for i in idxs]
        for pos, i in enumerate(idxs):
            if n < 2:
                records[i]["loo_offset"] = 0.0
                records[i]["loo_offset_shrunk"] = 0.0
                continue
            others = [e for j, e in enumerate(errs) if j != pos]
            raw = float(np.mean(others))
            n_other = n - 1
            records[i]["loo_offset"] = raw
            records[i]["loo_offset_shrunk"] = (n_other * raw) / (n_other + SHRINKAGE_K)

    for rec in records:
        rec["abs_fresh"] = abs(rec[error_field])
        rec["err_loo"] = rec[error_field] - rec["loo_offset"]
        rec["err_shrunk"] = rec[error_field] - rec["loo_offset_shrunk"]
        rec["abs_loo"] = abs(rec["err_loo"])
        rec["abs_shrunk"] = abs(rec["err_shrunk"])
        rec["artist_bucket"] = (
            "n=1"
            if rec["artist_n"] == 1
            else "n=2"
            if rec["artist_n"] == 2
            else "n=3+"
        )


def loo_report(records: list[dict]) -> dict:
    def slice_stats(subset: list[dict], extra_abs: dict[str, list[float]] | None = None) -> dict:
        out = {
            "n": len(subset),
            "no_offset": median_iqr([r["abs_fresh"] for r in subset]),
            "loo_raw": median_iqr([r["abs_loo"] for r in subset]),
            "loo_shrunk": median_iqr([r["abs_shrunk"] for r in subset]),
        }
        if extra_abs:
            for name, vals in extra_abs.items():
                out[name] = median_iqr(vals)
        return out

    n2 = [r for r in records if r["artist_n"] == 2]
    n3 = [r for r in records if r["artist_n"] >= 3]
    n1 = [r for r in records if r["artist_n"] == 1]

    # Counterfactuals: apply LOO only to one bucket; leave the rest unadjusted.
    only_n2 = [r["abs_loo"] if r["artist_n"] == 2 else r["abs_fresh"] for r in records]
    only_n3 = [r["abs_loo"] if r["artist_n"] >= 3 else r["abs_fresh"] for r in records]
    only_n2_shrunk = [
        r["abs_shrunk"] if r["artist_n"] == 2 else r["abs_fresh"] for r in records
    ]
    only_n3_shrunk = [
        r["abs_shrunk"] if r["artist_n"] >= 3 else r["abs_fresh"] for r in records
    ]

    mean_no = float(np.mean([r["abs_fresh"] for r in records]))
    mean_loo = float(np.mean([r["abs_loo"] for r in records]))
    mean_shrunk = float(np.mean([r["abs_shrunk"] for r in records]))
    total_gain_loo = mean_no - mean_loo
    total_gain_shrunk = mean_no - mean_shrunk

    def bucket_gain(subset: list[dict], field: str) -> dict:
        if not subset:
            return {"n": 0, "mean_reduction": None, "share_of_total": None}
        red = float(np.mean([r["abs_fresh"] - r[field] for r in subset]))
        # Weighted contribution to the overall mean reduction.
        contrib = (len(subset) / len(records)) * red
        total = total_gain_loo if field == "abs_loo" else total_gain_shrunk
        share = contrib / total if total != 0 else None
        return {
            "n": len(subset),
            "mean_reduction": red,
            "contribution_to_overall_mean": contrib,
            "share_of_total": share,
        }

    return {
        "overall": slice_stats(
            records,
            {
                "loo_only_n2": only_n2,
                "loo_only_n3plus": only_n3,
                "shrunk_only_n2": only_n2_shrunk,
                "shrunk_only_n3plus": only_n3_shrunk,
            },
        ),
        "n1": slice_stats(n1),
        "n2": slice_stats(n2),
        "n3plus": slice_stats(n3),
        "mean_abs": {
            "no_offset": mean_no,
            "loo_raw": mean_loo,
            "loo_shrunk": mean_shrunk,
            "gain_loo": total_gain_loo,
            "gain_shrunk": total_gain_shrunk,
        },
        "gain_attribution_loo": {
            "n1": bucket_gain(n1, "abs_loo"),
            "n2": bucket_gain(n2, "abs_loo"),
            "n3plus": bucket_gain(n3, "abs_loo"),
        },
        "gain_attribution_shrunk": {
            "n1": bucket_gain(n1, "abs_shrunk"),
            "n2": bucket_gain(n2, "abs_shrunk"),
            "n3plus": bucket_gain(n3, "abs_shrunk"),
        },
        "artist_counts": {
            "n1_artists": len({r["artist_key"] for r in n1}),
            "n2_artists": len({r["artist_key"] for r in n2}),
            "n3plus_artists": len({r["artist_key"] for r in n3}),
            "n2_releases": len(n2),
            "n3plus_releases": len(n3),
        },
    }


def icc_block(records: list[dict], field: str, rng: np.random.Generator) -> dict:
    all_groups = group_by_artist(records, field)
    ge2 = [g for g in all_groups if len(g) >= 2]
    point = anova_icc(all_groups)
    point_ge2 = anova_icc(ge2)
    boots = bootstrap_icc(records, field, rng)
    ci = percentile_ci(boots)
    return {
        "all_artists": point,
        "n_ge2_artists_only": point_ge2,
        "icc_ci95": {"lo": ci[0], "hi": ci[1]} if ci else None,
        "bootstrap_median": float(np.median(boots)) if boots else None,
    }


def artist_table(records: list[dict]) -> list[dict]:
    by_key: dict[str, list[dict]] = defaultdict(list)
    for rec in records:
        by_key[rec["artist_key"]].append(rec)
    rows: list[dict] = []
    for key, recs in by_key.items():
        n = len(recs)
        mls = [r["monthly_listeners"] for r in recs]
        errs = [r["fresh_log_error"] for r in recs]
        locked = [r["locked_log_error"] for r in recs]
        row = {
            "artist": display_name([r["artist"] for r in recs]),
            "artist_key": key,
            "n": n,
            "mean_ml": float(np.mean(mls)),
            "log_mean_ml": math.log(float(np.mean(mls))),
            "mean_fresh_log_error": float(np.mean(errs)),
            "sd_fresh_log_error": float(np.std(errs, ddof=1)) if n >= 2 else None,
            "mean_locked_log_error": float(np.mean(locked)),
            "offset": float(np.mean(errs)),
            "offset_shrunk": (n * float(np.mean(errs))) / (n + SHRINKAGE_K),
            "median_fresh_ratio": float(np.median([r["fresh_ratio"] for r in recs])),
            "median_locked_ratio": float(np.median([r["locked_ratio"] for r in recs])),
            "genres": ",".join(sorted({r["genre"] for r in recs})),
            "characterize": n >= 2,
        }
        rows.append(row)
    rows.sort(key=lambda r: (-r["n"], r["artist"].casefold()))
    return rows


def ml_correlation(artist_rows: list[dict], rng: np.random.Generator) -> dict:
    usable = [r for r in artist_rows if r["n"] >= 2]
    x_log = np.array([r["log_mean_ml"] for r in usable], dtype=float)
    x_ml = np.array([r["mean_ml"] for r in usable], dtype=float)
    y = np.array([r["offset"] for r in usable], dtype=float)
    rho_log = spearman(x_log, y)
    rho_ml = spearman(x_ml, y)
    r_log = pearson(x_log, y)
    boots = bootstrap_spearman(list(x_log), list(y), rng)
    ci = percentile_ci(boots)
    return {
        "n_artists": len(usable),
        "spearman_offset_vs_log_ml": rho_log,
        "spearman_offset_vs_ml": rho_ml,
        "pearson_offset_vs_log_ml": r_log,
        "spearman_log_ml_ci95": {"lo": ci[0], "hi": ci[1]} if ci else None,
    }


def fmt(x: float | None, digits: int = 3) -> str:
    if x is None or not math.isfinite(x):
        return "—"
    return f"{x:.{digits}f}"


def analyze(records: list[dict], rng: np.random.Generator, label: str) -> dict:
    attach_offsets(records)
    artists = artist_table(records)
    return {
        "label": label,
        "n_releases": len(records),
        "n_artists": len({r["artist_key"] for r in records}),
        "n_artists_ge2": len({r["artist_key"] for r in records if r["artist_n"] >= 2}),
        "icc_fresh_log": icc_block(records, "fresh_log_error", rng),
        "icc_locked_log": icc_block(records, "locked_log_error", rng),
        "icc_locked_ratio": icc_block(records, "locked_ratio", rng),
        "loo": loo_report(records),
        "ml_correlation": ml_correlation(artists, rng),
        "artists": artists,
        "bob_moses": next((a for a in artists if a["artist_key"] == "bob moses"), None),
        "rhye": next((a for a in artists if a["artist_key"] == "rhye"), None),
    }


def score_rows(training_rows, scorer) -> list[dict]:
    records: list[dict] = []
    for row in training_rows:
        if row.wk1_streams <= 0 or row.locked_forecast_streams <= 0:
            continue
        if row.monthly_listeners <= 0:
            continue
        fresh = predict_wk1_streams(row, scorer.streams_d0, scorer.magnitudes)
        if not math.isfinite(fresh) or fresh <= 0:
            continue
        artist = (row.artist_name or "").strip() or "(unknown)"
        locked = float(row.locked_forecast_streams)
        actual = float(row.wk1_streams)
        records.append(
            {
                "release_id": row.release_id,
                "track_name": row.track_name,
                "artist": artist,
                "artist_key": artist_key(artist),
                "genre": row.genre,
                "release_type": row.release_type,
                "editorial_tier": int(row.editorial_tier),
                "is_feature": bool(row.is_feature),
                "monthly_listeners": float(row.monthly_listeners),
                "wk1_streams": int(row.wk1_streams),
                "locked_forecast_streams": int(row.locked_forecast_streams),
                "fresh_predicted_wk1": fresh,
                "fresh_predicted_wk1_rounded": int(round(fresh)),
                "locked_ratio": actual / locked,
                "fresh_ratio": actual / fresh,
                "locked_log_error": math.log(actual / locked),
                "fresh_log_error": math.log(actual / fresh),
                "is_wrong_ml_remix": is_wrong_ml_remix(row.track_name),
            }
        )
    return records


def write_outputs(
    scored: list[dict],
    with_remix: dict,
    without_remix: dict,
    model_meta: dict,
) -> None:
    # Re-attach offsets on the full scored set for the CSV (includes remixes).
    attach_offsets(scored)

    fieldnames = [
        "release_id",
        "track_name",
        "artist",
        "artist_n",
        "genre",
        "release_type",
        "editorial_tier",
        "is_feature",
        "monthly_listeners",
        "wk1_streams",
        "locked_forecast_streams",
        "fresh_predicted_wk1",
        "fresh_predicted_wk1_rounded",
        "locked_ratio",
        "fresh_ratio",
        "locked_log_error",
        "fresh_log_error",
        "artist_offset",
        "artist_offset_shrunk",
        "loo_offset",
        "loo_offset_shrunk",
        "n_other",
        "log_error_loo",
        "log_error_shrunk",
        "abs_log_error",
        "abs_log_error_loo",
        "abs_log_error_shrunk",
        "is_wrong_ml_remix",
    ]
    csv_rows = []
    for rec in sorted(scored, key=lambda r: (r["artist"].casefold(), r["track_name"])):
        csv_rows.append(
            {
                "release_id": rec["release_id"],
                "track_name": rec["track_name"],
                "artist": rec["artist"],
                "artist_n": rec["artist_n"],
                "genre": rec["genre"],
                "release_type": rec["release_type"],
                "editorial_tier": rec["editorial_tier"],
                "is_feature": rec["is_feature"],
                "monthly_listeners": rec["monthly_listeners"],
                "wk1_streams": rec["wk1_streams"],
                "locked_forecast_streams": rec["locked_forecast_streams"],
                "fresh_predicted_wk1": rec["fresh_predicted_wk1"],
                "fresh_predicted_wk1_rounded": rec["fresh_predicted_wk1_rounded"],
                "locked_ratio": rec["locked_ratio"],
                "fresh_ratio": rec["fresh_ratio"],
                "locked_log_error": rec["locked_log_error"],
                "fresh_log_error": rec["fresh_log_error"],
                "artist_offset": rec["artist_offset"],
                "artist_offset_shrunk": rec["artist_offset_shrunk"],
                "loo_offset": rec["loo_offset"],
                "loo_offset_shrunk": rec["loo_offset_shrunk"],
                "n_other": rec["n_other"],
                "log_error_loo": rec["err_loo"],
                "log_error_shrunk": rec["err_shrunk"],
                "abs_log_error": rec["abs_fresh"],
                "abs_log_error_loo": rec["abs_loo"],
                "abs_log_error_shrunk": rec["abs_shrunk"],
                "is_wrong_ml_remix": rec["is_wrong_ml_remix"],
            }
        )

    with RELEASES_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(csv_rows)

    artist_fields = [
        "artist",
        "n",
        "mean_ml",
        "offset",
        "offset_shrunk",
        "sd_fresh_log_error",
        "median_fresh_ratio",
        "median_locked_ratio",
        "genres",
        "characterize",
    ]
    with ARTISTS_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=artist_fields)
        writer.writeheader()
        for row in with_remix["artists"]:
            writer.writerow({k: row[k] for k in artist_fields})

    payload = {
        "model": model_meta,
        "shrinkage_k": SHRINKAGE_K,
        "n_bootstrap": N_BOOT,
        "wrong_ml_remixes": [
            {
                "track_name": r["track_name"],
                "artist": r["artist"],
                "monthly_listeners": r["monthly_listeners"],
                "wk1_streams": r["wk1_streams"],
                "fresh_predicted_wk1": r["fresh_predicted_wk1"],
                "fresh_log_error": r["fresh_log_error"],
                "locked_log_error": r["locked_log_error"],
            }
            for r in scored
            if r["is_wrong_ml_remix"]
        ],
        "with_remixes": _strip_for_json(with_remix),
        "without_remixes": _strip_for_json(without_remix),
    }
    SUMMARY_JSON.write_text(json.dumps(payload, indent=2, default=_json_default) + "\n")


def _json_default(obj):
    if isinstance(obj, (np.floating, np.integer)):
        return obj.item()
    raise TypeError(type(obj))


def _strip_for_json(block: dict) -> dict:
    out = dict(block)
    # Keep artist rows; they are the per-artist figures.
    return out


def print_report(with_remix: dict, without_remix: dict, model_meta: dict) -> None:
    def icc_line(block: dict, key: str) -> str:
        icc = block[key]["all_artists"]
        ci = block[key]["icc_ci95"]
        ci_s = f" [{fmt(ci['lo'])}, {fmt(ci['hi'])}]" if ci else ""
        return (
            f"ICC={fmt(icc['icc'])}{ci_s}  "
            f"σ_b={fmt(icc['sigma_b'])}  σ_w={fmt(icc['sigma_w'])}  "
            f"n_eff={fmt(icc['n_eff'], 1)}  deff={fmt(icc['deff'])}  "
            f"(n={icc['n']}, k={icc['k']})"
        )

    def med_line(stats: dict) -> str:
        return (
            f"n={stats['n']}  median={fmt(stats['median'])}  "
            f"IQR={fmt(stats['iqr'])} [{fmt(stats['p25'])}, {fmt(stats['p75'])}]"
        )

    print("=" * 72)
    print("Artist offset analysis (read-only)")
    print(
        f"active model id={model_meta.get('id')} fitted_at={model_meta.get('fitted_at')}"
    )
    print(
        f"streams_d0 intercept={model_meta['streams_d0']['intercept']:.4f} "
        f"log_ml={model_meta['streams_d0']['log_ml']:.4f} "
        f"feat={model_meta['streams_d0']['feat']:.4f} "
        f"ed_tier={model_meta['streams_d0']['ed_tier']:.4f}"
    )
    print("=" * 72)

    for title, block in (("WITH 3 wrong-ML remixes (n=58)", with_remix),
                         ("WITHOUT 3 wrong-ML remixes", without_remix)):
        print()
        print(f"--- {title} ---")
        print(f"releases={block['n_releases']}  artists={block['n_artists']}  "
              f"artists with 2+={block['n_artists_ge2']}")
        print("frozen log-error  ", icc_line(block, "icc_locked_log"))
        print("frozen ratio      ", icc_line(block, "icc_locked_ratio"))
        print("fresh  log-error  ", icc_line(block, "icc_fresh_log"))
        ge2 = block["icc_fresh_log"]["n_ge2_artists_only"]
        print(
            f"  (n≥2 artists only) ICC={fmt(ge2['icc'])}  "
            f"σ_b={fmt(ge2['sigma_b'])}  σ_w={fmt(ge2['sigma_w'])}  "
            f"k={ge2['k']}"
        )

        loo = block["loo"]
        print()
        print("Leave-one-out |log error|")
        for name, key in (("overall", "overall"), ("n=2", "n2"), ("n=3+", "n3plus")):
            sl = loo[key]
            print(f"  {name:<8} no offset   {med_line(sl['no_offset'])}")
            print(f"  {name:<8} LOO raw     {med_line(sl['loo_raw'])}")
            print(f"  {name:<8} LOO k=5     {med_line(sl['loo_shrunk'])}")
        print(
            "  overall  LOO only on n=2   "
            + med_line(loo["overall"]["loo_only_n2"])
        )
        print(
            "  overall  LOO only on n=3+  "
            + med_line(loo["overall"]["loo_only_n3plus"])
        )
        attr = loo["gain_attribution_loo"]
        print(
            f"  mean |err| gain attribution (LOO raw): "
            f"n=2 share={fmt(attr['n2']['share_of_total'])} "
            f"n=3+ share={fmt(attr['n3plus']['share_of_total'])}"
        )
        attr_s = loo["gain_attribution_shrunk"]
        print(
            f"  mean |err| gain attribution (k=5):     "
            f"n=2 share={fmt(attr_s['n2']['share_of_total'])} "
            f"n=3+ share={fmt(attr_s['n3plus']['share_of_total'])}"
        )

        corr = block["ml_correlation"]
        ci = corr["spearman_log_ml_ci95"]
        ci_s = f" [{fmt(ci['lo'])}, {fmt(ci['hi'])}]" if ci else ""
        print()
        print(
            f"Artist offset vs log(ML)  n_artists={corr['n_artists']}  "
            f"Spearman={fmt(corr['spearman_offset_vs_log_ml'])}{ci_s}  "
            f"Pearson={fmt(corr['pearson_offset_vs_log_ml'])}"
        )
        for flag in (block.get("bob_moses"), block.get("rhye")):
            if flag:
                print(
                    f"  {flag['artist']} n={flag['n']}  ML={flag['mean_ml']:,.0f}  "
                    f"offset={fmt(flag['offset'])}  "
                    f"median fresh ratio={fmt(flag['median_fresh_ratio'])}  "
                    f"median locked ratio={fmt(flag['median_locked_ratio'])}"
                )

        print()
        print(f"{'artist':<18} {'n':>2} {'ML':>10} {'offset':>8} {'shrunk':>8} {'sd':>7} {'fresh r':>8}")
        for a in block["artists"]:
            if a["n"] < 2:
                continue
            print(
                f"{a['artist']:<18} {a['n']:>2} {a['mean_ml']:>10,.0f} "
                f"{fmt(a['offset']):>8} {fmt(a['offset_shrunk']):>8} "
                f"{fmt(a['sd_fresh_log_error']):>7} {fmt(a['median_fresh_ratio']):>8}"
            )


def main() -> int:
    client = get_db_client()
    bundle = fetch_closed_releases_with_daily_data(client)
    rows = build_training_rows(bundle.releases, bundle.daily_data_by_release_id)
    payload = load_active_consolidated_payload(client)
    scorer = scorer_from_payload(payload)

    active_row = (
        client.table("model_coefficients")
        .select("id, fitted_at, activated_at, status")
        .eq("status", "active")
        .not_.is_("payload", "null")
        .limit(1)
        .maybe_single()
        .execute()
    )
    meta = (active_row.data or {}) if active_row else {}
    model_meta = {
        "id": meta.get("id"),
        "fitted_at": meta.get("fitted_at"),
        "activated_at": meta.get("activated_at"),
        "streams_d0": {
            "intercept": scorer.streams_d0.intercept,
            "log_ml": scorer.streams_d0.log_ml,
            "feat": scorer.streams_d0.feat,
            "ed_tier": scorer.streams_d0.ed_tier,
            "rmse": scorer.streams_d0.rmse,
            "r2": scorer.streams_d0.r2,
        },
        "magnitudes": dict(scorer.magnitudes),
    }

    scored = score_rows(rows, scorer)
    if len(scored) != 58:
        print(f"WARNING: scored {len(scored)} releases, expected 58")

    remixes = [r for r in scored if r["is_wrong_ml_remix"]]
    if len(remixes) != 3:
        print("WARNING: expected 3 wrong-ML remixes, found:")
        for r in remixes:
            print(f"  {r['track_name']} ({r['artist']})")

    rng_a = np.random.default_rng(BOOT_SEED)
    rng_b = np.random.default_rng(BOOT_SEED + 1)
    with_remix = analyze(scored, rng_a, "with_remixes")
    without = analyze(
        [dict(r) for r in scored if not r["is_wrong_ml_remix"]],
        rng_b,
        "without_remixes",
    )

    write_outputs(scored, with_remix, without, model_meta)
    print_report(with_remix, without, model_meta)
    print()
    print(f"wrote {RELEASES_CSV.name} {ARTISTS_CSV.name} {SUMMARY_JSON.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
