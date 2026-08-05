"""
Build + insert consolidated forecast_model draft rows (Phase 2a --write-draft).
"""

from __future__ import annotations

from typing import Any

import config
from db import DbError, utc_now_iso
from fit import (
    AlgoBandsFit,
    RegressionFit,
    ReleaseTypeMagnitudeFit,
    SaveRateBandsFit,
    StreamCurveFit,
)
from forward_bias import (
    StreamsD0Scorer,
    compute_forward_bias,
    scorer_from_fit,
)
from guardrails import GuardrailResult
from dataset import TrainingRow
from supabase import Client


DOW_NAMES = config.DOW_WEEKDAY_NAMES


def build_forecast_model_payload(
    *,
    streams_d0: RegressionFit,
    stream_curve: StreamCurveFit,
    release_type_magnitude: ReleaseTypeMagnitudeFit,
    algo_bands: AlgoBandsFit,
    save_rate_bands: SaveRateBandsFit,
    ad_model: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if len(stream_curve.dow_multiplier) != 7:
        raise DbError(
            f"dow_multiplier length {len(stream_curve.dow_multiplier)} !== 7"
        )
    dow = {
        name: float(stream_curve.dow_multiplier[index])
        for index, name in enumerate(DOW_NAMES)
    }
    payload: dict[str, Any] = {
        "trend": {
            "median": list(stream_curve.trend_median),
            "p25": list(stream_curve.trend_p25),
            "p75": list(stream_curve.trend_p75),
        },
        "dow": dow,
        "editorial_kernel": list(stream_curve.editorial_kernel),
        "kernel_length": len(stream_curve.editorial_kernel),
        "release_type_magnitude_multipliers": dict(
            release_type_magnitude.multipliers
        ),
        "save_rate_bands": {
            genre: dict(band) for genre, band in save_rate_bands.bands.items()
        },
        "save_count_bands": {
            tier: dict(band) for tier, band in algo_bands.bands.items()
        },
        "streams_d0": streams_d0.to_coefficients_json(),
        "config": {
            "tier_ml_thresholds": {
                "mid": config.TIER_ML_MID,
                "established": config.TIER_ML_ESTABLISHED,
            },
            "retrain_min_sample_size": config.MIN_SAMPLE_SIZE,
            "retrain_threshold": config.RETRAIN_THRESHOLD,
            "editorial_kernel_k": config.EDITORIAL_KERNEL_K,
            "stream_curve_day_end": config.STREAM_CURVE_DAY_END,
            "wk1_day_end": config.WK1_DAY_END,
            "release_type_magnitude_shrinkage_k": (
                config.RELEASE_TYPE_MAGNITUDE_SHRINKAGE_K
            ),
        },
    }
    # Preserve live ad_model until retrain fits it (spec §6).
    if isinstance(ad_model, dict) and ad_model:
        payload["ad_model"] = ad_model
    return payload


def build_draft_metadata(
    *,
    eligible_rows: list[TrainingRow],
    clean_rows: list[TrainingRow],
    derived_rows: list[TrainingRow],
    guardrail_result: GuardrailResult,
    streams_d0: RegressionFit,
    release_type_magnitude: ReleaseTypeMagnitudeFit,
    live_scorer: StreamsD0Scorer,
    job_id: str | None = None,
) -> dict[str, Any]:
    new_scorer = scorer_from_fit(streams_d0, release_type_magnitude)
    forward_bias = compute_forward_bias(
        eligible_rows,
        clean_rows,
        live=live_scorer,
        new=new_scorer,
    )
    codes: list[str] = []
    if guardrail_result.failure is not None:
        codes.append(guardrail_result.failure.code)

    metadata: dict[str, Any] = {
        "sample_sizes": {
            "eligible": len(eligible_rows),
            "clean": len(clean_rows),
            "regression": len(clean_rows),
            "derived": len(derived_rows),
        },
        "forward_bias": forward_bias,
        "cooks_d_drops": len(guardrail_result.excluded_release_ids),
        "cooks_d_dropped_ids": list(guardrail_result.excluded_release_ids),
        "threshold": {
            "min_sample_size": config.MIN_SAMPLE_SIZE,
            "retrain_threshold": config.RETRAIN_THRESHOLD,
            "cooks_d_threshold_factor": config.COOKS_D_THRESHOLD_FACTOR,
        },
        "guardrails": {
            "passed": guardrail_result.passed,
            "insufficient_sample": (
                guardrail_result.failure is not None
                and guardrail_result.failure.code == "insufficient_sample"
            ),
            "codes": codes,
            "message": (
                guardrail_result.failure.message
                if guardrail_result.failure is not None
                else None
            ),
        },
        "override_notes": None,
    }
    if job_id:
        metadata["job_id"] = job_id
    return metadata


def insert_draft_forecast_model(
    client: Client,
    *,
    payload: dict[str, Any],
    metadata: dict[str, Any],
    streams_d0: RegressionFit,
    fitted_at: str | None = None,
    training_notes: str | None = None,
) -> str:
    timestamp = fitted_at or utc_now_iso()
    row = {
        "model_type": "forecast_model",
        "coefficients_json": {},
        "r_squared": float(streams_d0.r2),
        "sample_size": int(streams_d0.sample_size),
        "fitted_at": timestamp,
        "activated_at": None,
        "is_active": False,
        "status": "draft",
        "payload": payload,
        "metadata": metadata,
        "training_notes": training_notes
        or "Phase 2a --write-draft consolidated forecast_model",
    }
    response = client.table("model_coefficients").insert(row).execute()
    if not response.data:
        raise DbError("draft forecast_model insert returned no rows")
    draft_id = response.data[0].get("id")
    if not draft_id:
        raise DbError("draft forecast_model insert missing id")
    return str(draft_id)
