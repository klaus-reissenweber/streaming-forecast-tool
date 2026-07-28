"""
Creation-time forward bias: active consolidated model vs newly fitted streams_d0.

Both sides scored on the same releases with the same formula:
  pred = exp(streams_d0 · X) × release_type_magnitude

Bias per release = (pred − actual) / actual. Aggregate = median over slices.

"live" MUST come from the active consolidated model_coefficients row
(status='active', non-null payload) — the same source loadActiveModel() reads —
NOT from historical locked_forecast_streams (those freeze the model at create time).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from dataset import TrainingRow
from fit import RegressionFit, ReleaseTypeMagnitudeFit


@dataclass(frozen=True)
class StreamsD0Scorer:
    """streams_d0 betas + per-release_type magnitude multipliers."""

    streams_d0: RegressionFit
    magnitudes: dict[str, float]


def _feat(row: TrainingRow) -> float:
    return 1.0 if row.is_feature else 0.0


def predict_wk1_streams(
    row: TrainingRow,
    streams_d0: RegressionFit,
    magnitudes: dict[str, float],
) -> float:
    if row.monthly_listeners <= 0:
        return float("nan")
    log_pred = (
        streams_d0.intercept
        + streams_d0.log_ml * math.log(row.monthly_listeners)
        + streams_d0.feat * _feat(row)
        + streams_d0.ed_tier * float(row.editorial_tier)
    )
    magnitude = float(magnitudes.get(row.release_type, 1.0))
    return math.exp(log_pred) * magnitude


def scorer_from_payload(payload: dict[str, Any]) -> StreamsD0Scorer:
    """Parse consolidated forecast_model.payload into a scorer."""
    raw = payload.get("streams_d0")
    if not isinstance(raw, dict):
        raise ValueError("active payload missing streams_d0")
    for key in ("intercept", "log_ml", "feat", "ed_tier", "rmse", "r2"):
        if key not in raw:
            raise ValueError(f"active payload.streams_d0 missing '{key}'")
    streams_d0 = RegressionFit(
        intercept=float(raw["intercept"]),
        log_ml=float(raw["log_ml"]),
        feat=float(raw["feat"]),
        ed_tier=float(raw["ed_tier"]),
        rmse=float(raw["rmse"]),
        r2=float(raw["r2"]),
        sample_size=0,
    )
    mags_raw = payload.get("release_type_magnitude_multipliers")
    if not isinstance(mags_raw, dict) or not mags_raw:
        raise ValueError(
            "active payload missing release_type_magnitude_multipliers"
        )
    magnitudes = {str(key): float(value) for key, value in mags_raw.items()}
    return StreamsD0Scorer(streams_d0=streams_d0, magnitudes=magnitudes)


def scorer_from_fit(
    streams_d0: RegressionFit,
    release_type_magnitude: ReleaseTypeMagnitudeFit,
) -> StreamsD0Scorer:
    return StreamsD0Scorer(
        streams_d0=streams_d0,
        magnitudes=dict(release_type_magnitude.multipliers),
    )


def _row_bias(pred: float, actual: int) -> float | None:
    if actual <= 0 or not math.isfinite(pred) or pred <= 0:
        return None
    return (pred - float(actual)) / float(actual)


def _median_bias(
    rows: list[TrainingRow],
    scorer: StreamsD0Scorer,
) -> float | None:
    values: list[float] = []
    for row in rows:
        pred = predict_wk1_streams(row, scorer.streams_d0, scorer.magnitudes)
        bias = _row_bias(pred, row.wk1_streams)
        if bias is not None:
            values.append(bias)
    if not values:
        return None
    return float(np.median(np.asarray(values, dtype=float)))


def _pair(
    rows: list[TrainingRow],
    *,
    live: StreamsD0Scorer,
    new: StreamsD0Scorer,
) -> dict[str, float | None]:
    return {
        "live": _median_bias(rows, live),
        "new": _median_bias(rows, new),
    }


def _newest_n(rows: list[TrainingRow], n: int = 10) -> list[TrainingRow]:
    """Prefer closed_at, then created_at, then release_date (newest first)."""

    def sort_key(row: TrainingRow) -> str:
        return row.closed_at or row.created_at or row.release_date or ""

    ordered = sorted(rows, key=sort_key, reverse=True)
    return ordered[:n]


def compute_forward_bias(
    eligible_rows: list[TrainingRow],
    clean_rows: list[TrainingRow],
    *,
    live: StreamsD0Scorer,
    new: StreamsD0Scorer,
) -> dict[str, dict[str, float | None]]:
    newest = _newest_n(eligible_rows, 10)
    return {
        "all": _pair(eligible_rows, live=live, new=new),
        "clean": _pair(clean_rows, live=live, new=new),
        "newest_10": _pair(newest, live=live, new=new),
    }
