"""
Retrain guardrails (see RETRAINING.md).

Minimum sample size, Cook's distance outlier exclusion, R² degradation,
and reproducibility validation before DB promotion.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

import config
from dataset import TrainingRow
from fit import (
    RegressionFit,
    SavesFit,
    StreamsRefinementFit,
    fit_all_regression_models,
    ols_for_regression_model,
)


@dataclass(frozen=True)
class OutlierFlag:
    release_id: str
    track_name: str
    artist_name: str
    model_type: str
    cooks_d: float
    threshold: float


@dataclass(frozen=True)
class R2Comparison:
    model_type: str
    active_r2: float
    new_r2: float
    delta: float
    degraded: bool


@dataclass(frozen=True)
class GuardrailFailure:
    code: str
    message: str
    details: dict[str, Any]


@dataclass(frozen=True)
class GuardrailResult:
    passed: bool
    failure: GuardrailFailure | None
    sample_size_initial: int
    sample_size_final: int
    outlier_flags: tuple[OutlierFlag, ...]
    excluded_release_ids: frozenset[str]
    regression_models: dict[str, RegressionFit | StreamsRefinementFit | SavesFit] | None
    r2_comparisons: tuple[R2Comparison, ...]
    reproducibility_passed: bool | None


def cooks_d_threshold(sample_size: int) -> float:
    if sample_size <= 0:
        return float("inf")
    return config.COOKS_D_THRESHOLD_FACTOR / sample_size


def detect_cooks_outliers(
    rows: list[TrainingRow],
) -> tuple[tuple[OutlierFlag, ...], frozenset[str]]:
    """
    Flag releases exceeding Cook's D threshold (4/n by default) on any model.

    Final exclusion set is the union across models (RETRAINING.md).
    """
    flags: list[OutlierFlag] = []
    excluded_ids: set[str] = set()

    for model_type in config.REGRESSION_MODEL_TYPES:
        try:
            sample, result = ols_for_regression_model(model_type, rows)
        except ValueError:
            continue

        threshold = cooks_d_threshold(len(sample))
        cooks_raw = result.get_influence().cooks_distance
        if isinstance(cooks_raw, tuple):
            cooks_distances = np.asarray(cooks_raw[0]).ravel()
        else:
            cooks_distances = np.ravel(cooks_raw)

        if len(cooks_distances) != len(sample):
            raise ValueError(
                f"{model_type}: Cook's distance length {len(cooks_distances)} "
                f"!= sample size {len(sample)}"
            )

        for index in range(len(sample)):
            cooks_value = float(cooks_distances[index])
            if not np.isfinite(cooks_value):
                continue
            if cooks_value <= threshold:
                continue
            row = sample[index]
            flags.append(
                OutlierFlag(
                    release_id=row.release_id,
                    track_name=row.track_name,
                    artist_name=row.artist_name,
                    model_type=model_type,
                    cooks_d=cooks_value,
                    threshold=float(threshold),
                )
            )
            excluded_ids.add(row.release_id)

    return tuple(flags), frozenset(excluded_ids)


def apply_outlier_exclusion(
    rows: list[TrainingRow],
    excluded_release_ids: frozenset[str],
) -> list[TrainingRow]:
    if not excluded_release_ids:
        return list(rows)
    return [row for row in rows if row.release_id not in excluded_release_ids]


def check_minimum_sample_size(sample_size: int) -> GuardrailFailure | None:
    if sample_size >= config.MIN_SAMPLE_SIZE:
        return None
    return GuardrailFailure(
        code="insufficient_sample",
        message=(
            f"Need at least {config.MIN_SAMPLE_SIZE} releases after outlier exclusion; "
            f"got {sample_size}."
        ),
        details={
            "sample_size": sample_size,
            "required": config.MIN_SAMPLE_SIZE,
        },
    )


def _values_allclose(left: Any, right: Any) -> bool:
    if isinstance(left, dict) and isinstance(right, dict):
        if set(left.keys()) != set(right.keys()):
            return False
        return all(_values_allclose(left[key], right[key]) for key in left)

    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return bool(
            np.isclose(
                float(left),
                float(right),
                rtol=config.REPRODUCIBILITY_RTOL,
                atol=config.REPRODUCIBILITY_ATOL,
            )
        )

    return left == right


def regression_payloads_match(
    left: dict[str, RegressionFit | StreamsRefinementFit | SavesFit],
    right: dict[str, RegressionFit | StreamsRefinementFit | SavesFit],
) -> bool:
    for model_type in config.REGRESSION_MODEL_TYPES:
        left_payload = left[model_type].to_coefficients_json()
        right_payload = right[model_type].to_coefficients_json()
        if not _values_allclose(left_payload, right_payload):
            return False
    return True


def validate_reproducibility(
    rows: list[TrainingRow],
) -> tuple[bool, dict[str, RegressionFit | StreamsRefinementFit | SavesFit]]:
    """
    Fit the full regression pipeline twice; payloads must match within tolerance.
    """
    first = fit_all_regression_models(rows)
    second = fit_all_regression_models(rows)
    return regression_payloads_match(first, second), first


def extract_r2_values(
    models: dict[str, RegressionFit | StreamsRefinementFit | SavesFit],
) -> dict[str, float]:
    return {model_type: float(models[model_type].r2) for model_type in config.REGRESSION_MODEL_TYPES}


def check_r2_degradation(
    new_models: dict[str, RegressionFit | StreamsRefinementFit | SavesFit],
    active_r2: dict[str, float],
    *,
    force: bool = False,
) -> tuple[GuardrailFailure | None, tuple[R2Comparison, ...]]:
    comparisons: list[R2Comparison] = []

    for model_type in config.REGRESSION_MODEL_TYPES:
        if model_type not in active_r2:
            raise ValueError(f"Missing active R² for {model_type}")

        new_r2 = float(new_models[model_type].r2)
        current_r2 = float(active_r2[model_type])
        delta = current_r2 - new_r2
        degraded = delta > config.R2_DEGRADATION_MAX
        comparisons.append(
            R2Comparison(
                model_type=model_type,
                active_r2=current_r2,
                new_r2=new_r2,
                delta=delta,
                degraded=degraded,
            )
        )

    degraded_models = [item for item in comparisons if item.degraded]
    if degraded_models and not force:
        return (
            GuardrailFailure(
                code="r2_degradation",
                message=(
                    "One or more regression models degraded by more than "
                    f"{config.R2_DEGRADATION_MAX} R² vs the active model."
                ),
                details={
                    "degraded_models": [
                        {
                            "model_type": item.model_type,
                            "active_r2": item.active_r2,
                            "new_r2": item.new_r2,
                            "delta": item.delta,
                        }
                        for item in degraded_models
                    ],
                },
            ),
            tuple(comparisons),
        )

    return None, tuple(comparisons)


def run_guardrails(
    rows: list[TrainingRow],
    active_r2: dict[str, float],
    *,
    force_r2: bool = False,
) -> GuardrailResult:
    """
    Full guardrail pipeline:
    1. Cook's D exclusion on initial pool
    2. Minimum sample size (n ≥ 40)
    3. Reproducibility (double fit)
    4. R² degradation vs active (whole-batch rejection)
    """
    sample_size_initial = len(rows)
    outlier_flags, excluded_ids = detect_cooks_outliers(rows)
    filtered_rows = apply_outlier_exclusion(rows, excluded_ids)
    sample_size_final = len(filtered_rows)

    sample_failure = check_minimum_sample_size(sample_size_final)
    if sample_failure is not None:
        return GuardrailResult(
            passed=False,
            failure=sample_failure,
            sample_size_initial=sample_size_initial,
            sample_size_final=sample_size_final,
            outlier_flags=outlier_flags,
            excluded_release_ids=excluded_ids,
            regression_models=None,
            r2_comparisons=(),
            reproducibility_passed=None,
        )

    reproducibility_passed, regression_models = validate_reproducibility(filtered_rows)
    if not reproducibility_passed:
        return GuardrailResult(
            passed=False,
            failure=GuardrailFailure(
                code="reproducibility_failed",
                message="Regression pipeline produced different coefficients on identical data.",
                details={"sample_size": sample_size_final},
            ),
            sample_size_initial=sample_size_initial,
            sample_size_final=sample_size_final,
            outlier_flags=outlier_flags,
            excluded_release_ids=excluded_ids,
            regression_models=None,
            r2_comparisons=(),
            reproducibility_passed=False,
        )

    r2_failure, r2_comparisons = check_r2_degradation(
        regression_models,
        active_r2,
        force=force_r2,
    )
    if r2_failure is not None:
        return GuardrailResult(
            passed=False,
            failure=r2_failure,
            sample_size_initial=sample_size_initial,
            sample_size_final=sample_size_final,
            outlier_flags=outlier_flags,
            excluded_release_ids=excluded_ids,
            regression_models=regression_models,
            r2_comparisons=r2_comparisons,
            reproducibility_passed=True,
        )

    return GuardrailResult(
        passed=True,
        failure=None,
        sample_size_initial=sample_size_initial,
        sample_size_final=sample_size_final,
        outlier_flags=outlier_flags,
        excluded_release_ids=excluded_ids,
        regression_models=regression_models,
        r2_comparisons=r2_comparisons,
        reproducibility_passed=True,
    )
