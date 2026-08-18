#!/usr/bin/env python3
"""
Budget-allocation counterfactual on closed releases. Analysis only.

The product has no mix-recommender UI. Implicit rec = put 100% of paid budget
on the channel with the lowest modeled cost-per-stream (awareness = 0 streams).

Run from repo root:
  retrain/.venv/bin/python analysis/budget_allocation.py
"""

from __future__ import annotations

import csv
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
RETRAIN_DIR = REPO_ROOT / "retrain"
sys.path.insert(0, str(RETRAIN_DIR))

from dataset import build_training_rows  # noqa: E402
from db import get_db_client, load_active_consolidated_payload  # noqa: E402
from fetch import (  # noqa: E402
    fetch_closed_releases_with_daily_data,
    fetch_primary_artist_names,
)

OUT = Path(__file__).resolve().parent
RELEASES_CSV = OUT / "budget-allocation-releases.csv"
SUMMARY_JSON = OUT / "budget-allocation-summary.json"

CHANNELS = ("marquee", "showcase", "meta_traffic", "meta_awareness")
STREAM_CHANNELS = ("marquee", "showcase", "meta_traffic")


def release_key(track_name: str) -> str:
    text = unicodedata.normalize("NFKD", track_name)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:120]


def num(value, default=0.0) -> float:
    if value is None or value == "":
        return default
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    return n if math.isfinite(n) else default


def parse_ad_model(payload: dict) -> dict:
    raw = payload.get("ad_model") or {}
    cpl = raw.get("spotify_cpl") or {}
    funnel = raw.get("meta_funnel") or {}
    awareness = raw.get("meta_awareness") or {}
    return {
        "cpl_marquee": float(cpl.get("marquee") or 0.49),
        "cpl_showcase": float(cpl.get("showcase") or 0.35),
        "spl_by_artist": {
            str(k).strip().casefold(): float(v)
            for k, v in (raw.get("spotify_spl_by_artist") or {}).items()
            if v is not None and float(v) > 0
        },
        "spl_by_genre": {
            str(k): float(v)
            for k, v in (raw.get("spotify_spl_by_genre") or {}).items()
            if v is not None and float(v) > 0
        },
        "spl_global": float(raw.get("spotify_spl_global") or 2.65),
        "cpc": float(funnel.get("cpc") or 0.15),
        "click_share": float(funnel.get("spotify_click_share") or 0.45),
        "spc_base": float(funnel.get("streams_per_spotify_click_base") or 1.0),
        "cpm": float(awareness.get("cpm") or 3.7),
        "cost_per_reach": float(awareness.get("cost_per_reach") or 0.0053),
    }


def resolve_spl(model: dict, artist: str, genre: str) -> tuple[float, str]:
    key = (artist or "").strip().casefold()
    if key and key in model["spl_by_artist"]:
        return model["spl_by_artist"][key], "artist"
    if genre in model["spl_by_genre"]:
        return model["spl_by_genre"][genre], "genre"
    return model["spl_global"], "global"


def model_cps(model: dict, spl: float) -> dict[str, float]:
    """28-day attributed $ per stream. Awareness is inf (0 streams)."""
    out = {"meta_awareness": float("inf")}
    out["marquee"] = model["cpl_marquee"] / spl if spl > 0 else float("inf")
    out["showcase"] = model["cpl_showcase"] / spl if spl > 0 else float("inf")
    denom = model["click_share"] * model["spc_base"] * (spl / model["spl_global"])
    if model["cpc"] > 0 and denom > 0:
        out["meta_traffic"] = model["cpc"] / denom
    else:
        out["meta_traffic"] = float("inf")
    return out


def wk1_fraction(offset: int, duration: int, start_in_wk1_days: int | None = None) -> float:
    """Share of a duration-day even campaign that lands in D1–D7."""
    start = 1 + max(0, offset)
    dur = max(1, duration)
    if start > 7:
        return 0.0
    overlap = min(7, start + dur - 1) - start + 1
    return max(0.0, overlap) / dur


def marquee_wk1_fraction(offset: int) -> float:
    # 2-day front-loaded; both days in wk1 if start<=6.
    start = 1 + max(0, offset)
    if start > 7:
        return 0.0
    overlap = min(7, start + 2 - 1) - start + 1
    return max(0.0, overlap) / 2.0


def streams_from_spend(channel: str, spend: float, cps: dict[str, float]) -> float:
    rate = cps[channel]
    if not math.isfinite(rate) or rate <= 0 or spend <= 0:
        return 0.0
    return spend / rate


def mix_streams(mix: dict[str, float], cps: dict[str, float]) -> float:
    return sum(streams_from_spend(ch, mix.get(ch, 0.0), cps) for ch in CHANNELS)


def mix_wk1(
    mix: dict[str, float],
    cps: dict[str, float],
    offset: int,
    meta_duration: int,
) -> float:
    s28 = {ch: streams_from_spend(ch, mix.get(ch, 0.0), cps) for ch in CHANNELS}
    return (
        s28["marquee"] * marquee_wk1_fraction(offset)
        + s28["showcase"] * wk1_fraction(offset, 14)
        + s28["meta_traffic"] * wk1_fraction(offset, meta_duration)
        + 0.0
    )


def greedy_mix(total: float, cps: dict[str, float], *, week1: bool, offset: int, meta_duration: int) -> tuple[str, dict[str, float]]:
    best_ch = None
    best_rate = float("inf")
    for ch in STREAM_CHANNELS:
        rate = cps[ch]
        if week1:
            frac = (
                marquee_wk1_fraction(offset)
                if ch == "marquee"
                else wk1_fraction(offset, 14 if ch == "showcase" else meta_duration)
            )
            if frac <= 0:
                continue
            rate = rate / frac
        if rate < best_rate:
            best_rate = rate
            best_ch = ch
    mix = {ch: 0.0 for ch in CHANNELS}
    if best_ch and total > 0:
        mix[best_ch] = total
    return best_ch or "none", mix


def fetch_extra_releases(client, ids: list[str]) -> dict[str, dict]:
    extra: dict[str, dict] = {}
    cols = (
        "id, track_name, genre, spotify_format, meta_spend_planned, "
        "spotify_spend_planned, spotify_marquee_spend_planned, "
        "spotify_showcase_spend_planned, meta_traffic_spend_planned, "
        "meta_awareness_spend_planned, meta_objective, "
        "campaign_start_offset_days, campaign_duration_days, status"
    )
    for start in range(0, len(ids), 100):
        chunk = ids[start : start + 100]
        resp = (
            client.table("releases")
            .select(cols)
            .in_("id", chunk)
            .execute()
        )
        for row in resp.data or []:
            extra[str(row["id"])] = row
    return extra


def fetch_campaigns(client) -> tuple[list[dict], list[dict]]:
    spotify = (
        client.table("ad_spotify_campaigns")
        .select(
            "release_key, artist, format, spend_usd, converted_listeners, "
            "est_attributed_streams, usable_for_modeling, start_date, end_date"
        )
        .execute()
        .data
        or []
    )
    meta = (
        client.table("ad_meta_campaigns")
        .select(
            "release_key, objective, spend_usd, link_clicks, spotify_click_share, "
            "impressions, reach, linkfire_streams, start_date, end_date"
        )
        .execute()
        .data
        or []
    )
    return list(spotify), list(meta)


def plan_mix(row: dict, spotify_format: str, meta_objective: str | None) -> dict[str, float]:
    marquee = num(row.get("spotify_marquee_spend_planned"))
    showcase = num(row.get("spotify_showcase_spend_planned"))
    traffic = num(row.get("meta_traffic_spend_planned"))
    awareness = num(row.get("meta_awareness_spend_planned"))
    spotify_total = num(row.get("spotify_spend_planned"))
    meta_total = num(row.get("meta_spend_planned"))

    if marquee <= 0 and showcase <= 0 and spotify_total > 0:
        if spotify_format == "showcase":
            showcase = spotify_total
        else:
            marquee = spotify_total
    if traffic <= 0 and awareness <= 0 and meta_total > 0:
        obj = (meta_objective or "traffic").strip().lower()
        if obj in {"reach", "awareness"}:
            awareness = meta_total
        elif obj == "streaming":
            pass
        else:
            traffic = meta_total
    return {
        "marquee": marquee,
        "showcase": showcase,
        "meta_traffic": traffic,
        "meta_awareness": awareness,
    }


def actual_mix(spotify_rows: list[dict], meta_rows: list[dict]) -> dict[str, float]:
    mix = {ch: 0.0 for ch in CHANNELS}
    for row in spotify_rows:
        fmt = str(row.get("format") or "")
        if fmt in mix:
            mix[fmt] += num(row.get("spend_usd"))
    for row in meta_rows:
        obj = str(row.get("objective") or "traffic").strip().lower()
        spend = num(row.get("spend_usd"))
        if obj in {"reach", "awareness"}:
            mix["meta_awareness"] += spend
        elif obj == "streaming":
            mix["meta_awareness"] += 0.0  # streaming objective → 0 attributed
        else:
            mix["meta_traffic"] += spend
    return mix


def actual_streams(spotify_rows: list[dict], meta_rows: list[dict], model: dict, spl: float) -> dict[str, float]:
    """Measured Spotify streams; Meta estimated via clicks × share × SPL path when possible."""
    out = {ch: 0.0 for ch in CHANNELS}
    measured = {ch: False for ch in CHANNELS}
    for row in spotify_rows:
        fmt = str(row.get("format") or "")
        streams = num(row.get("est_attributed_streams"))
        if fmt in out:
            out[fmt] += streams
            if streams > 0:
                measured[fmt] = True
    spc = model["spc_base"] * (spl / model["spl_global"]) if model["spl_global"] > 0 else 0.0
    for row in meta_rows:
        obj = str(row.get("objective") or "traffic").strip().lower()
        if obj in {"reach", "awareness", "streaming"}:
            continue
        lf = num(row.get("linkfire_streams"))
        clicks = num(row.get("link_clicks"))
        share = num(row.get("spotify_click_share"), default=model["click_share"])
        if lf > 0:
            out["meta_traffic"] += lf
            measured["meta_traffic"] = True
        elif clicks > 0 and share > 0 and spc > 0:
            out["meta_traffic"] += clicks * share * spc
    return out


def main() -> int:
    client = get_db_client()
    bundle = fetch_closed_releases_with_daily_data(client)
    training = build_training_rows(bundle.releases, bundle.daily_data_by_release_id)
    wk1 = {r.release_id: r.wk1_streams for r in training}
    payload = load_active_consolidated_payload(client)
    model = parse_ad_model(payload)
    extra = fetch_extra_releases(client, [r.id for r in bundle.releases])
    names = fetch_primary_artist_names(client, [r.id for r in bundle.releases])
    spotify_all, meta_all = fetch_campaigns(client)

    spotify_by_key: dict[str, list[dict]] = defaultdict(list)
    for row in spotify_all:
        key = str(row.get("release_key") or "").strip()
        if key:
            spotify_by_key[key].append(row)
    meta_by_key: dict[str, list[dict]] = defaultdict(list)
    for row in meta_all:
        key = str(row.get("release_key") or "").strip()
        if key:
            meta_by_key[key].append(row)

    records = []
    for rel in bundle.releases:
        row = extra.get(rel.id, {})
        artist = names.get(rel.id) or rel.artist_name
        genre = rel.genre
        key = release_key(rel.track_name)
        offset = int(num(row.get("campaign_start_offset_days"), 0))
        meta_dur = int(num(row.get("campaign_duration_days"), 14) or 14)
        fmt = str(row.get("spotify_format") or rel.spotify_format or "marquee")
        mix_plan = plan_mix(row, fmt, row.get("meta_objective"))
        plan_total = sum(mix_plan.values())
        sp_rows = spotify_by_key.get(key, [])
        meta_rows = meta_by_key.get(key, [])
        mix_act = actual_mix(sp_rows, meta_rows)
        act_total = sum(mix_act.values())
        has_campaigns = bool(sp_rows or meta_rows)
        spl, spl_src = resolve_spl(model, artist, genre)
        cps = model_cps(model, spl)

        rec28_ch, rec28 = greedy_mix(plan_total, cps, week1=False, offset=offset, meta_duration=meta_dur)
        recw1_ch, recw1 = greedy_mix(plan_total, cps, week1=True, offset=offset, meta_duration=meta_dur)

        plan_28 = mix_streams(mix_plan, cps)
        rec_28 = mix_streams(rec28, cps)
        plan_w1 = mix_wk1(mix_plan, cps, offset, meta_dur)
        rec_w1 = mix_wk1(recw1, cps, offset, meta_dur)

        rec28_on_actual_total_ch, rec28_on_act = greedy_mix(
            act_total, cps, week1=False, offset=offset, meta_duration=meta_dur
        )
        act_28_model = mix_streams(mix_act, cps) if has_campaigns else None
        rec_on_act_28 = mix_streams(rec28_on_act, cps) if has_campaigns else None

        observed = actual_streams(sp_rows, meta_rows, model, spl)
        obs_total = sum(observed.values())
        emp_cps = {}
        for ch in STREAM_CHANNELS:
            spend = mix_act[ch]
            streams = observed[ch]
            emp_cps[ch] = spend / streams if spend > 0 and streams > 0 else None

        # Score rec with actual CPS where observed; else model CPS.
        scored_rec_streams = None
        if has_campaigns and act_total > 0:
            scored = 0.0
            rec_ch = rec28_on_actual_total_ch
            if rec_ch in STREAM_CHANNELS:
                if emp_cps.get(rec_ch):
                    scored = act_total / emp_cps[rec_ch]
                else:
                    scored = streams_from_spend(rec_ch, act_total, cps)
            scored_rec_streams = scored

        records.append(
            {
                "release_id": rel.id,
                "track_name": rel.track_name,
                "artist": artist,
                "genre": genre,
                "release_key": key,
                "wk1_actual": wk1.get(rel.id),
                "spl": spl,
                "spl_source": spl_src,
                "plan_marquee": mix_plan["marquee"],
                "plan_showcase": mix_plan["showcase"],
                "plan_meta_traffic": mix_plan["meta_traffic"],
                "plan_meta_awareness": mix_plan["meta_awareness"],
                "plan_total": plan_total,
                "act_marquee": mix_act["marquee"],
                "act_showcase": mix_act["showcase"],
                "act_meta_traffic": mix_act["meta_traffic"],
                "act_meta_awareness": mix_act["meta_awareness"],
                "act_total": act_total,
                "has_campaigns": has_campaigns,
                "rec_28d_channel": rec28_ch,
                "rec_wk1_channel": recw1_ch,
                "model_cps_marquee": cps["marquee"],
                "model_cps_showcase": cps["showcase"],
                "model_cps_meta": cps["meta_traffic"],
                "plan_model_streams_28d": plan_28,
                "rec_model_streams_28d": rec_28,
                "delta_28d": rec_28 - plan_28,
                "plan_model_streams_wk1": plan_w1,
                "rec_model_streams_wk1": rec_w1,
                "delta_wk1": rec_w1 - plan_w1,
                "act_model_streams_28d": act_28_model,
                "rec_on_act_total_28d": rec_on_act_28,
                "delta_act_total_28d": (
                    rec_on_act_28 - act_28_model
                    if rec_on_act_28 is not None and act_28_model is not None
                    else None
                ),
                "obs_streams_total": obs_total if has_campaigns else None,
                "obs_cps_marquee": emp_cps.get("marquee"),
                "obs_cps_showcase": emp_cps.get("showcase"),
                "obs_cps_meta": emp_cps.get("meta_traffic"),
                "rec_scored_on_actuals": scored_rec_streams,
                "rec_beats_obs": (
                    scored_rec_streams - obs_total
                    if scored_rec_streams is not None and has_campaigns
                    else None
                ),
                "already_greedy_28d": rec28_ch != "none"
                and mix_plan[rec28_ch] >= plan_total - 1e-6
                and plan_total > 0,
                "awareness_share_plan": (
                    mix_plan["meta_awareness"] / plan_total if plan_total > 0 else 0.0
                ),
                "campaign_offset": offset,
                "meta_duration": meta_dur,
                "n_spotify_campaigns": len(sp_rows),
                "n_meta_campaigns": len(meta_rows),
            }
        )

    paid = [r for r in records if r["plan_total"] > 0]
    unpaid = [r for r in records if r["plan_total"] <= 0]
    with_camp = [r for r in records if r["has_campaigns"]]
    paid_and_camp = [r for r in paid if r["has_campaigns"]]

    def summarize(rows, key):
        vals = [r[key] for r in rows if r.get(key) is not None]
        if not vals:
            return None
        arr = np.asarray(vals, dtype=float)
        return {
            "n": int(len(arr)),
            "median": float(np.median(arr)),
            "mean": float(np.mean(arr)),
            "sum": float(np.sum(arr)),
            "p25": float(np.percentile(arr, 25)),
            "p75": float(np.percentile(arr, 75)),
        }

    rec_counts = defaultdict(int)
    rec_w1_counts = defaultdict(int)
    for r in paid:
        rec_counts[r["rec_28d_channel"]] += 1
        rec_w1_counts[r["rec_wk1_channel"]] += 1

    already = sum(1 for r in paid if r["already_greedy_28d"])
    beats_plan = sum(1 for r in paid if r["delta_28d"] > 1)
    beats_obs = [
        r for r in with_camp if r.get("rec_beats_obs") is not None
    ]

    summary = {
        "n_closed": len(records),
        "n_with_planned_spend": len(paid),
        "n_zero_plan": len(unpaid),
        "n_with_campaigns": len(with_camp),
        "n_paid_and_campaigns": len(paid_and_camp),
        "ad_model": {
            "cpl_marquee": model["cpl_marquee"],
            "cpl_showcase": model["cpl_showcase"],
            "cpc": model["cpc"],
            "click_share": model["click_share"],
            "spc_base": model["spc_base"],
            "spl_global": model["spl_global"],
        },
        "implicit_recommendation": (
            "100% of paid budget to the lowest modeled CPS channel among "
            "marquee / showcase / meta traffic. Awareness is never chosen "
            "for attributed streams."
        ),
        "rec_28d_channel_counts": dict(rec_counts),
        "rec_wk1_channel_counts": dict(rec_w1_counts),
        "already_on_greedy": already,
        "n_rec_beats_plan_model": beats_plan,
        "delta_28d": summarize(paid, "delta_28d"),
        "delta_wk1": summarize(paid, "delta_wk1"),
        "plan_model_streams_28d": summarize(paid, "plan_model_streams_28d"),
        "rec_model_streams_28d": summarize(paid, "rec_model_streams_28d"),
        "awareness_share_plan": summarize(paid, "awareness_share_plan"),
        "delta_act_total_28d": summarize(paid_and_camp, "delta_act_total_28d"),
        "rec_beats_obs": summarize(beats_obs, "rec_beats_obs"),
        "unmatched_campaign_keys": sorted(
            set(spotify_by_key) | set(meta_by_key)
            - {r["release_key"] for r in records}
        ),
    }
    SUMMARY_JSON.write_text(json.dumps(summary, indent=2, default=str) + "\n")

    fieldnames = [
        "release_id",
        "track_name",
        "artist",
        "genre",
        "release_key",
        "wk1_actual",
        "plan_total",
        "plan_marquee",
        "plan_showcase",
        "plan_meta_traffic",
        "plan_meta_awareness",
        "act_total",
        "act_marquee",
        "act_showcase",
        "act_meta_traffic",
        "act_meta_awareness",
        "has_campaigns",
        "spl",
        "spl_source",
        "rec_28d_channel",
        "rec_wk1_channel",
        "model_cps_marquee",
        "model_cps_showcase",
        "model_cps_meta",
        "plan_model_streams_28d",
        "rec_model_streams_28d",
        "delta_28d",
        "plan_model_streams_wk1",
        "rec_model_streams_wk1",
        "delta_wk1",
        "already_greedy_28d",
        "awareness_share_plan",
        "obs_streams_total",
        "rec_scored_on_actuals",
        "rec_beats_obs",
        "n_spotify_campaigns",
        "n_meta_campaigns",
    ]
    with RELEASES_CSV.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(sorted(records, key=lambda r: -r["plan_total"]))

    print(f"closed={len(records)} paid_plan={len(paid)} campaigns={len(with_camp)}")
    print("ad_model", summary["ad_model"])
    print("rec 28d", dict(rec_counts), "wk1", dict(rec_w1_counts))
    print("already greedy", already, "/", len(paid))
    if paid:
        d = summary["delta_28d"]
        w = summary["delta_wk1"]
        print(
            f"modeled 28d delta rec-plan: median={d['median']:.0f} mean={d['mean']:.0f} sum={d['sum']:.0f}"
        )
        print(
            f"modeled wk1 delta rec-plan: median={w['median']:.0f} mean={w['mean']:.0f} sum={w['sum']:.0f}"
        )
        print(
            f"plan 28d streams median={summary['plan_model_streams_28d']['median']:.0f} "
            f"rec median={summary['rec_model_streams_28d']['median']:.0f}"
        )
        print(
            f"awareness share of plan median={summary['awareness_share_plan']['median']:.2%}"
        )
    print("unmatched campaign keys", len(summary["unmatched_campaign_keys"]))
    for r in sorted(paid, key=lambda x: -x["delta_28d"])[:15]:
        print(
            f"  {r['track_name'][:36]:<36} plan=${r['plan_total']:,.0f} "
            f"mix m/s/t/a={r['plan_marquee']:.0f}/{r['plan_showcase']:.0f}/"
            f"{r['plan_meta_traffic']:.0f}/{r['plan_meta_awareness']:.0f} "
            f"rec={r['rec_28d_channel']}/{r['rec_wk1_channel']} "
            f"d28={r['delta_28d']:,.0f} dw1={r['delta_wk1']:,.0f} "
            f"camp={int(r['has_campaigns'])}"
        )
    print("zero-plan with campaigns:")
    for r in with_camp:
        if r["plan_total"] <= 0:
            print(
                f"  {r['track_name'][:40]} act=${r['act_total']:,.0f} "
                f"m/s/t/a={r['act_marquee']:.0f}/{r['act_showcase']:.0f}/"
                f"{r['act_meta_traffic']:.0f}/{r['act_meta_awareness']:.0f}"
            )
    print(f"wrote {RELEASES_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
