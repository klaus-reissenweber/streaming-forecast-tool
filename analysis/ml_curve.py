#!/usr/bin/env python3
"""
Is log(ML) elasticity constant? Analysis only.

TEST 1: residuals of the live streams_d0 vs ML bins.
TEST 2: refit week-1 spec A–E; Cook's D via live union with spec-specific d0.

Does not write model_coefficients or change retrain/fit.py / fetch.py.

Run from repo root:
  retrain/.venv/bin/python analysis/ml_curve.py
"""

from __future__ import annotations

import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import statsmodels.api as sm

REPO_ROOT = Path(__file__).resolve().parent.parent
RETRAIN_DIR = REPO_ROOT / "retrain"
sys.path.insert(0, str(RETRAIN_DIR))

import config  # noqa: E402
from dataset import TrainingRow, build_training_rows  # noqa: E402
from db import get_db_client, load_active_consolidated_payload  # noqa: E402
from fetch import fetch_closed_releases_with_daily_data  # noqa: E402
from fit import (  # noqa: E402
    derive_release_type_magnitude_multipliers,
    ols_for_regression_model,
)
from forward_bias import predict_wk1_streams, scorer_from_payload  # noqa: E402
from guardrails import OutlierFlag, cooks_d_threshold  # noqa: E402

OUT = Path(__file__).resolve().parent
RELEASES_CSV = OUT / "ml-curve-releases.csv"
BINS_CSV = OUT / "ml-curve-bins.csv"
SPECS_CSV = OUT / "ml-curve-specs.csv"
SVG_PATH = OUT / "ml-curve-scatter.svg"
SUMMARY_JSON = OUT / "ml-curve-summary.json"

MIN_CHAR = 6
K_MID = math.log(config.TIER_ML_MID)
K_EST = math.log(config.TIER_ML_ESTABLISHED)

BIN_ORDER = ("<100k", "100k-500k", "500k-2M", "2M-5M", "5M+")


def ml_bin(ml: float) -> str:
    if ml < 100_000:
        return "<100k"
    if ml < 500_000:
        return "100k-500k"
    if ml < 2_000_000:
        return "500k-2M"
    if ml < 5_000_000:
        return "2M-5M"
    return "5M+"


def log_ml(row: TrainingRow) -> float:
    return math.log(row.monthly_listeners)


def feat(row: TrainingRow) -> float:
    return 1.0 if row.is_feature else 0.0


def ed_tier(row: TrainingRow) -> float:
    return float(row.editorial_tier)


def design(spec: str, rows: list[TrainingRow]) -> tuple[np.ndarray, list[str]]:
    n = len(rows)
    ones = np.ones(n)
    x = np.array([log_ml(r) for r in rows], dtype=float)
    f = np.array([feat(r) for r in rows], dtype=float)
    e = np.array([ed_tier(r) for r in rows], dtype=float)
    tiers = [config.artist_tier_from_monthly_listeners(r.monthly_listeners) for r in rows]
    i_dev = np.array([1.0 if t == "developing" else 0.0 for t in tiers])
    i_mid = np.array([1.0 if t == "mid" else 0.0 for t in tiers])
    i_est = np.array([1.0 if t == "established" else 0.0 for t in tiers])

    if spec == "A":
        cols = ["intercept", "log_ml", "feat", "ed_tier"]
        mat = np.column_stack([ones, x, f, e])
    elif spec == "B":
        cols = ["intercept", "log_ml", "log_ml_sq", "feat", "ed_tier"]
        mat = np.column_stack([ones, x, x * x, f, e])
    elif spec == "C":
        cols = ["intercept", "log_ml", "hinge_500k", "hinge_2M", "feat", "ed_tier"]
        mat = np.column_stack(
            [ones, x, np.maximum(x - K_MID, 0.0), np.maximum(x - K_EST, 0.0), f, e]
        )
    elif spec == "D":
        cols = ["intercept", "log_ml", "feat", "ed_tier", "i_mid", "i_est"]
        mat = np.column_stack([ones, x, f, e, i_mid, i_est])
    elif spec == "E":
        cols = ["intercept", "feat", "ed_tier", "log_ml_dev", "log_ml_mid", "log_ml_est"]
        mat = np.column_stack([ones, f, e, x * i_dev, x * i_mid, x * i_est])
    else:
        raise ValueError(spec)
    return mat, cols


def fit_ols(spec: str, rows: list[TrainingRow]):
    sample = [r for r in rows if r.wk1_streams > 0]
    if len(sample) < 2:
        raise ValueError(f"{spec}: need ≥2 rows")
    y = np.log(np.array([r.wk1_streams for r in sample], dtype=float))
    x, cols = design(spec, sample)
    result = sm.OLS(y, x).fit()
    return sample, result, cols


def cooks_union(spec: str, rows: list[TrainingRow]) -> tuple[tuple[OutlierFlag, ...], frozenset[str]]:
    flags: list[OutlierFlag] = []
    excluded: set[str] = set()
    for model_type in config.REGRESSION_MODEL_TYPES:
        try:
            if model_type == "streams_d0":
                sample, result, _cols = fit_ols(spec, rows)
            else:
                sample, result = ols_for_regression_model(model_type, rows)
        except ValueError:
            continue
        threshold = cooks_d_threshold(len(sample))
        cooks_raw = result.get_influence().cooks_distance
        distances = (
            np.asarray(cooks_raw[0]).ravel()
            if isinstance(cooks_raw, tuple)
            else np.ravel(cooks_raw)
        )
        for index, row in enumerate(sample):
            value = float(distances[index])
            if not np.isfinite(value) or value <= threshold:
                continue
            flags.append(
                OutlierFlag(
                    release_id=row.release_id,
                    track_name=row.track_name,
                    artist_name=row.artist_name,
                    model_type=model_type,
                    cooks_d=value,
                    threshold=float(threshold),
                )
            )
            excluded.add(row.release_id)
    return tuple(flags), frozenset(excluded)


def predict_ols(spec: str, row: TrainingRow, params: np.ndarray) -> float:
    x, _cols = design(spec, [row])
    return float(math.exp(x[0] @ params))


def bin_stats(rows: list[dict], key: str) -> dict:
    arr = np.array([r[key] for r in rows], dtype=float)
    n = len(arr)
    if n == 0:
        return {"n": 0}
    return {
        "n": n,
        "median": float(np.median(arr)),
        "mean": float(np.mean(arr)),
        "iqr": float(np.percentile(arr, 75) - np.percentile(arr, 25)),
        "p25": float(np.percentile(arr, 25)),
        "p75": float(np.percentile(arr, 75)),
    }


def write_svg(records: list[dict], live) -> None:
    width, height = 860, 560
    pad_l, pad_r, pad_t, pad_b = 72, 24, 36, 56
    xs = [math.log(r["ml"]) for r in records]
    ys = [math.log(r["wk1"]) for r in records]
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = min(ys), max(ys)
    dx, dy = xmax - xmin or 1, ymax - ymin or 1
    xmin -= 0.08 * dx
    xmax += 0.08 * dx
    ymin -= 0.08 * dy
    ymax += 0.08 * dy

    def sx(x: float) -> float:
        return pad_l + (x - xmin) / (xmax - xmin) * (width - pad_l - pad_r)

    def sy(y: float) -> float:
        return pad_t + (1 - (y - ymin) / (ymax - ymin)) * (height - pad_t - pad_b)

    colors = {
        "<100k": "#9a6d00",
        "100k-500k": "#1f6f4a",
        "500k-2M": "#2155a3",
        "2M-5M": "#8a2c8a",
        "5M+": "#b42318",
    }

    # Live model lines at feat=0/1, ed_tier=1.
    grid = np.linspace(xmin, xmax, 80)
    lines = []
    for feat_val, dash in ((0.0, "0"), (1.0, "6 4")):
        pts = []
        for xv in grid:
            yhat = (
                live.intercept
                + live.log_ml * xv
                + live.feat * feat_val
                + live.ed_tier * 1.0
            )
            pts.append(f"{sx(xv):.1f},{sy(yhat):.1f}")
        lines.append((dash, feat_val, " ".join(pts)))

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" font-family="system-ui, sans-serif">',
        '<rect width="100%" height="100%" fill="#fafafa"/>',
        '<text x="430" y="24" text-anchor="middle" font-size="15" font-weight="600">'
        "log(wk1 streams) vs log(ML) — 58 closed releases</text>",
        f'<text x="{width/2}" y="{height-12}" text-anchor="middle" font-size="12">'
        "log(monthly_listeners_at_release)</text>",
        f'<text x="18" y="{height/2}" text-anchor="middle" font-size="12" '
        f'transform="rotate(-90 18 {height/2})">log(actual wk1 streams)</text>',
    ]
    # axes
    parts.append(
        f'<line x1="{pad_l}" y1="{sy(ymin)}" x2="{pad_l}" y2="{sy(ymax)}" '
        'stroke="#222" stroke-width="1"/>'
    )
    parts.append(
        f'<line x1="{sx(xmin)}" y1="{sy(ymin)}" x2="{sx(xmax)}" y2="{sy(ymin)}" '
        'stroke="#222" stroke-width="1"/>'
    )
    for ml_tick in (1e4, 1e5, 5e5, 2e6, 5e6, 1e7):
        xv = math.log(ml_tick)
        if xmin <= xv <= xmax:
            parts.append(
                f'<line x1="{sx(xv):.1f}" y1="{sy(ymin)}" x2="{sx(xv):.1f}" '
                f'y2="{sy(ymax)}" stroke="#e5e5e5"/>'
            )
            label = (
                f"{int(ml_tick/1e6)}M"
                if ml_tick >= 1e6
                else (f"{int(ml_tick/1e3)}k" if ml_tick >= 1e3 else str(int(ml_tick)))
            )
            parts.append(
                f'<text x="{sx(xv):.1f}" y="{sy(ymin)+18:.1f}" text-anchor="middle" '
                f'font-size="11" fill="#444">{label}</text>'
            )

    for dash, feat_val, pts in lines:
        label = "live model, feat=0, ed=1" if feat_val == 0 else "live model, feat=1, ed=1"
        parts.append(
            f'<polyline fill="none" stroke="#111" stroke-width="1.4" '
            f'stroke-dasharray="{dash}" points="{pts}"/>'
        )

    for rec in records:
        cx, cy = sx(math.log(rec["ml"])), sy(math.log(rec["wk1"]))
        fill = colors[rec["ml_bin"]]
        parts.append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="5" fill="{fill}" fill-opacity="0.82" '
            f'stroke="#fff" stroke-width="0.8">'
            f'<title>{rec["track_name"]} ({rec["artist"]}) ML={rec["ml"]:,.0f} '
            f'wk1={rec["wk1"]:,}</title></circle>'
        )

    legend_y = 48
    for i, (label, color) in enumerate(colors.items()):
        x = pad_l + i * 145
        parts.append(f'<circle cx="{x}" cy="{legend_y}" r="5" fill="{color}"/>')
        parts.append(
            f'<text x="{x+10}" y="{legend_y+4}" font-size="11" fill="#333">{label}</text>'
        )
    parts.append(
        f'<line x1="{pad_l + 5*145}" y1="{legend_y}" x2="{pad_l + 5*145 + 28}" '
        f'y2="{legend_y}" stroke="#111" stroke-width="1.4"/>'
    )
    parts.append(
        f'<text x="{pad_l + 5*145 + 34}" y="{legend_y+4}" font-size="11">live OLS (ed=1)</text>'
    )
    parts.append("</svg>")
    SVG_PATH.write_text("\n".join(parts) + "\n")


def main() -> int:
    client = get_db_client()
    bundle = fetch_closed_releases_with_daily_data(client)
    rows = build_training_rows(bundle.releases, bundle.daily_data_by_release_id)
    live_payload = load_active_consolidated_payload(client)
    live_scorer = scorer_from_payload(live_payload)
    live = live_scorer.streams_d0

    records: list[dict] = []
    for row in rows:
        ml = float(row.monthly_listeners)
        xbeta = (
            live.intercept
            + live.log_ml * math.log(ml)
            + live.feat * feat(row)
            + live.ed_tier * ed_tier(row)
        )
        ols_pred = math.exp(xbeta)
        live_pred = predict_wk1_streams(row, live, live_scorer.magnitudes)
        ols_log_resid = math.log(row.wk1_streams) - xbeta
        records.append(
            {
                "release_id": row.release_id,
                "track_name": row.track_name,
                "artist": row.artist_name,
                "artist_key": (row.artist_name or "").strip().casefold(),
                "genre": row.genre,
                "release_type": row.release_type,
                "is_feature": row.is_feature,
                "editorial_tier": row.editorial_tier,
                "ml": ml,
                "ml_bin": ml_bin(ml),
                "tier": config.artist_tier_from_monthly_listeners(ml),
                "wk1": int(row.wk1_streams),
                "locked": int(row.locked_forecast_streams),
                "live_ols_pred": ols_pred,
                "live_pred": live_pred,
                "live_ols_log_resid": ols_log_resid,
                "live_ratio": float(row.wk1_streams) / live_pred if live_pred > 0 else None,
                "locked_ratio": float(row.wk1_streams) / row.locked_forecast_streams,
                "row": row,
            }
        )

    # TEST 1 bins
    bin_rows = []
    loo = []
    for label in BIN_ORDER + ("2M+ pooled",):
        if label == "2M+ pooled":
            group = [r for r in records if r["ml"] >= 2_000_000]
        else:
            group = [r for r in records if r["ml_bin"] == label]
        resid = bin_stats(group, "live_ols_log_resid")
        ratio = bin_stats(group, "live_ratio")
        artists = defaultdict(int)
        for r in group:
            artists[r["artist"]] += 1
        bin_rows.append(
            {
                "bin": label,
                "n": resid.get("n", 0),
                "characterize": resid.get("n", 0) >= MIN_CHAR,
                "median_log_resid": resid.get("median"),
                "mean_log_resid": resid.get("mean"),
                "median_ratio": ratio.get("median"),
                "iqr_ratio": ratio.get("iqr"),
                "artists": dict(sorted(artists.items(), key=lambda kv: -kv[1])),
                "tracks": [
                    {
                        "track": r["track_name"],
                        "artist": r["artist"],
                        "ml": r["ml"],
                        "log_resid": r["live_ols_log_resid"],
                        "ratio": r["live_ratio"],
                    }
                    for r in sorted(group, key=lambda x: x["ml"])
                ],
            }
        )
        # leave-one-artist-out for bins that exist
        by_artist = defaultdict(list)
        for r in group:
            by_artist[r["artist_key"]].append(r)
        for akey, arows in sorted(by_artist.items(), key=lambda kv: -len(kv[1])):
            rest = [r for r in group if r["artist_key"] != akey]
            if not rest:
                continue
            name = arows[0]["artist"]
            s = bin_stats(rest, "live_ols_log_resid")
            q = bin_stats(rest, "live_ratio")
            loo.append(
                {
                    "bin": label,
                    "excluded_artist": name,
                    "excluded_n": len(arows),
                    "remaining_n": s["n"],
                    "median_log_resid": s["median"],
                    "median_ratio": q["median"],
                }
            )

    # extra confound cuts on 2M+
    pooled = [r for r in records if r["ml"] >= 2_000_000]
    confound = []
    for title, pred in (
        ("2M+ exclude house", lambda r: r["genre"] != "house"),
        ("2M+ exclude features", lambda r: not r["is_feature"]),
        ("2M+ exclude remixes", lambda r: r["release_type"] != "alternate_version"),
        ("2M+ exclude Cedric+KSHMR+Kasango", lambda r: r["artist_key"] not in {"cedric gervais", "kshmr", "kasango"}),
    ):
        group = [r for r in pooled if pred(r)]
        s = bin_stats(group, "live_ols_log_resid")
        q = bin_stats(group, "live_ratio")
        confound.append(
            {
                "cut": title,
                "n": s.get("n", 0),
                "median_log_resid": s.get("median"),
                "median_ratio": q.get("median"),
                "iqr_ratio": q.get("iqr"),
            }
        )

    # TEST 2
    spec_labels = {
        "A": "log(ML) + feat + ed_tier",
        "B": "log(ML) + log(ML)^2 + feat + ed_tier",
        "C": "piecewise-linear log(ML), knots 500k & 2M",
        "D": "tier intercepts (dev/mid/est) + shared log(ML) slope",
        "E": "tier-specific log(ML) slopes, shared intercept",
    }
    spec_summaries = []
    for spec in "ABCDE":
        flags, excluded = cooks_union(spec, rows)
        clean = [r for r in rows if r.release_id not in excluded]
        sample, result, cols = fit_ols(spec, clean)
        params = np.asarray(result.params, dtype=float)
        magnitude = derive_release_type_magnitude_multipliers(clean)

        d0_sample, d0_result, _ = fit_ols(spec, rows)
        d0_thr = cooks_d_threshold(len(d0_sample))
        d0_raw = d0_result.get_influence().cooks_distance
        d0_dist = (
            np.asarray(d0_raw[0]).ravel()
            if isinstance(d0_raw, tuple)
            else np.ravel(d0_raw)
        )
        d0_drops = {
            d0_sample[i].release_id
            for i, v in enumerate(d0_dist)
            if np.isfinite(v) and float(v) > d0_thr
        }

        ratios_all = []
        bias_all = []
        bias_clean = []
        by_id = {r.release_id: r for r in rows}
        for rec in records:
            row = rec["row"]
            ols_pred = predict_ols(spec, row, params)
            mag = float(magnitude.multipliers.get(row.release_type, 1.0))
            pred = ols_pred * mag
            rec[f"{spec}_pred"] = pred
            rec[f"{spec}_ols_log_resid"] = math.log(row.wk1_streams) - math.log(ols_pred)
            rec[f"{spec}_ratio"] = float(row.wk1_streams) / pred if pred > 0 else None
            rec[f"{spec}_cooks_dropped"] = row.release_id in excluded
            rec[f"{spec}_cooks_d0_dropped"] = row.release_id in d0_drops
            rec[f"{spec}_ratio"] = rec[f"{spec}_ratio"]
            if pred > 0 and row.wk1_streams > 0:
                ratios_all.append(float(row.wk1_streams) / pred)
                bias = (pred - float(row.wk1_streams)) / float(row.wk1_streams)
                bias_all.append(bias)
                if row.release_id not in excluded:
                    bias_clean.append(bias)

        dropped_names = [
            f"{by_id[rid].track_name} ({by_id[rid].artist_name})"
            for rid in sorted(excluded)
        ]
        spec_summaries.append(
            {
                "spec": spec,
                "label": spec_labels[spec],
                "n_params": int(len(cols)),
                "columns": cols,
                "coefficients": {
                    name: float(val) for name, val in zip(cols, params, strict=True)
                },
                "cooks_d_drops": len(excluded),
                "streams_d0_only_drops": len(d0_drops),
                "clean_n": len(clean),
                "r2_clean": float(result.rsquared),
                "adj_r2_clean": float(result.rsquared_adj),
                "aic": float(result.aic),
                "bic": float(result.bic),
                "rmse": float(math.sqrt(np.mean(np.square(result.resid)))),
                "forward_bias_all": float(np.median(bias_all)) if bias_all else None,
                "forward_bias_clean": float(np.median(bias_clean)) if bias_clean else None,
                "ratio_median_all": float(np.median(ratios_all)) if ratios_all else None,
                "ratio_iqr_all": (
                    float(np.percentile(ratios_all, 75) - np.percentile(ratios_all, 25))
                    if ratios_all
                    else None
                ),
                "dropped_names": dropped_names,
                "tier_counts_clean": {
                    t: sum(
                        1
                        for r in clean
                        if config.artist_tier_from_monthly_listeners(r.monthly_listeners)
                        == t
                    )
                    for t in config.ARTIST_TIERS
                },
            }
        )

    write_svg(records, live)

    fieldnames = [
        "release_id",
        "track_name",
        "artist",
        "genre",
        "release_type",
        "is_feature",
        "editorial_tier",
        "ml",
        "ml_bin",
        "tier",
        "wk1",
        "locked",
        "live_ols_pred",
        "live_pred",
        "live_ols_log_resid",
        "live_ratio",
        "locked_ratio",
    ]
    for spec in "ABCDE":
        fieldnames.extend(
            [
                f"{spec}_pred",
                f"{spec}_ols_log_resid",
                f"{spec}_ratio",
                f"{spec}_cooks_dropped",
                f"{spec}_cooks_d0_dropped",
            ]
        )

    with RELEASES_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(sorted(records, key=lambda r: r["ml"]))

    with BINS_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "bin",
                "n",
                "characterize",
                "median_log_resid",
                "mean_log_resid",
                "median_ratio",
                "iqr_ratio",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        for row in bin_rows:
            writer.writerow({k: row[k] for k in writer.fieldnames})

    with SPECS_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "spec",
                "label",
                "n_params",
                "cooks_d_drops",
                "streams_d0_only_drops",
                "clean_n",
                "r2_clean",
                "adj_r2_clean",
                "aic",
                "forward_bias_all",
                "forward_bias_clean",
                "ratio_median_all",
                "ratio_iqr_all",
            ],
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(spec_summaries)

    summary = {
        "n": len(records),
        "live_streams_d0": {
            "intercept": live.intercept,
            "log_ml": live.log_ml,
            "feat": live.feat,
            "ed_tier": live.ed_tier,
        },
        "test1_bins": bin_rows,
        "leave_one_artist_out": loo,
        "confound_cuts": confound,
        "test2": spec_summaries,
    }
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2, default=str) + "\n")

    print(f"n={len(records)}")
    print("TEST 1 bins (live OLS log residual; ratio = actual / live pred w/ magnitude)")
    print(f"{'bin':<16} {'n':>3} {'med_resid':>10} {'mean_resid':>10} {'med_ratio':>9} {'iqr_r':>7} ok")
    for row in bin_rows:
        ok = "yes" if row["characterize"] else "no"
        mr = row["median_log_resid"]
        print(
            f"{row['bin']:<16} {row['n']:>3} "
            f"{mr:10.3f} {row['mean_log_resid']:10.3f} "
            f"{row['median_ratio']:9.3f} {row['iqr_ratio']:7.3f} {ok}"
        )
    print()
    print("Leave-one-artist-out (bins with remaining n):")
    for row in loo:
        if row["bin"] not in ("<100k", "5M+", "2M+ pooled", "2M-5M"):
            continue
        print(
            f"  {row['bin']:<14} drop {row['excluded_artist']:<18} "
            f"n_ex={row['excluded_n']} remain={row['remaining_n']} "
            f"med_resid={row['median_log_resid']:.3f} med_ratio={row['median_ratio']:.3f}"
        )
    print()
    print("2M+ confound cuts:")
    for row in confound:
        print(
            f"  {row['cut']:<40} n={row['n']:>2} "
            f"med_resid={row['median_log_resid']:.3f} med_ratio={row['median_ratio']:.3f}"
        )
    print()
    print("TEST 2")
    print(
        f"{'sp':<3} {'drops':>5} {'d0':>3} {'clean':>5} {'R2':>7} {'adjR2':>7} "
        f"{'bias_all':>9} {'bias_cln':>9} {'med_r':>7} {'iqr':>6} params"
    )
    for s in spec_summaries:
        print(
            f"{s['spec']:<3} {s['cooks_d_drops']:>5} {s['streams_d0_only_drops']:>3} "
            f"{s['clean_n']:>5} {s['r2_clean']:7.4f} {s['adj_r2_clean']:7.4f} "
            f"{s['forward_bias_all']:9.4f} {s['forward_bias_clean']:9.4f} "
            f"{s['ratio_median_all']:7.3f} {s['ratio_iqr_all']:6.3f} "
            f"{s['n_params']} {s['coefficients']}"
        )
    print(f"wrote {RELEASES_CSV.name} {BINS_CSV.name} {SPECS_CSV.name} {SVG_PATH.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
