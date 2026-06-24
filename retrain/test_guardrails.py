"""Unit tests for guardrails.py — pass and fail paths per RETRAINING.md."""

from __future__ import annotations

import json
from dataclasses import replace

import pytest

import config
from fit import fit_all_regression_models
from guardrails import (
    apply_outlier_exclusion,
    check_minimum_sample_size,
    check_r2_degradation,
    detect_cooks_outliers,
    run_guardrails,
    validate_reproducibility,
)
from test_fit import _split_wk1_streams, make_synthetic_training_rows


def _active_r2_from_rows(rows: list) -> dict[str, float]:
    models = fit_all_regression_models(rows)
    return {model_type: float(models[model_type].r2) for model_type in config.REGRESSION_MODEL_TYPES}


def _active_r2_perfect() -> dict[str, float]:
    return {model_type: 1.0 for model_type in config.REGRESSION_MODEL_TYPES}


def make_low_r2_rows(n: int = 50, seed: int = 99) -> list:
    """Random wk1 streams decoupled from predictors → low R²."""
    import numpy as np

    rows = make_synthetic_training_rows(n=n, seed=seed)
    rng = np.random.default_rng(seed)
    randomized = []
    for row in rows:
        random_wk1 = max(7, int(rng.integers(1_000, 500_000)))
        randomized.append(
            replace(
                row,
                wk1_streams=random_wk1,
                streams_by_day=_split_wk1_streams(random_wk1),
            )
        )
    return randomized


def test_insufficient_sample_rejects_n10() -> None:
    rows = make_synthetic_training_rows(n=10)
    result = run_guardrails(rows, active_r2=_active_r2_from_rows(rows))

    assert result.passed is False
    assert result.failure is not None
    assert result.failure.code == "insufficient_sample"
    assert result.sample_size_final < config.MIN_SAMPLE_SIZE


def test_cooks_distance_flags_injected_outlier() -> None:
    rows = make_synthetic_training_rows(n=50, seed=42)
    outlier = replace(
        rows[0],
        release_id="outlier-injected",
        track_name="Outlier Track",
        artist_name="Outlier Artist",
        wk1_streams=rows[0].wk1_streams * 1_000,
        streams_by_day={
            day: max(1, streams * 1_000)
            for day, streams in rows[0].streams_by_day.items()
        },
    )
    rows_with_outlier = [outlier, *rows[1:]]

    flags, excluded = detect_cooks_outliers(rows_with_outlier)

    assert "outlier-injected" in excluded
    assert any(flag.release_id == "outlier-injected" for flag in flags)
    filtered = apply_outlier_exclusion(rows_with_outlier, excluded)
    assert "outlier-injected" not in {row.release_id for row in filtered}
    assert len(filtered) < len(rows_with_outlier)


def test_r2_degradation_rejects_whole_batch() -> None:
    rows = make_low_r2_rows(n=80, seed=99)
    result = run_guardrails(rows, active_r2=_active_r2_perfect())

    assert result.passed is False
    assert result.failure is not None
    assert result.failure.code == "r2_degradation"
    assert result.sample_size_final >= config.MIN_SAMPLE_SIZE
    assert any(item.degraded for item in result.r2_comparisons)


def test_r2_degradation_force_skips_check() -> None:
    rows = make_low_r2_rows(n=80, seed=99)
    strict = run_guardrails(rows, active_r2=_active_r2_perfect(), force_r2=False)
    forced = run_guardrails(rows, active_r2=_active_r2_perfect(), force_r2=True)

    assert strict.passed is False
    assert strict.failure is not None
    assert strict.failure.code == "r2_degradation"
    assert forced.passed is True


def test_reproducibility_passes_on_identical_pipeline() -> None:
    rows = make_synthetic_training_rows(n=50, seed=42)
    passed, _models = validate_reproducibility(rows)
    assert passed is True


def test_guardrails_full_pass_path() -> None:
    rows = make_synthetic_training_rows(n=80, seed=42)
    active_r2 = _active_r2_from_rows(rows)
    active_r2 = {key: value - 0.01 for key, value in active_r2.items()}

    result = run_guardrails(rows, active_r2=active_r2)

    assert result.passed is True
    assert result.failure is None
    assert result.sample_size_final >= config.MIN_SAMPLE_SIZE
    assert result.reproducibility_passed is True
    assert result.regression_models is not None
    assert len(result.regression_models) == len(config.REGRESSION_MODEL_TYPES)


def test_guardrails_report(capsys: pytest.CaptureFixture[str]) -> None:
    rows = make_synthetic_training_rows(n=80, seed=42)

    insufficient = run_guardrails(
        make_synthetic_training_rows(n=10),
        active_r2=_active_r2_from_rows(rows),
    )
    outlier_rows = make_synthetic_training_rows(n=50, seed=42)
    outlier_rows[0] = replace(
        outlier_rows[0],
        release_id="report-outlier",
        wk1_streams=outlier_rows[0].wk1_streams * 2_000,
        streams_by_day={
            day: max(1, streams * 2_000)
            for day, streams in outlier_rows[0].streams_by_day.items()
        },
    )
    outlier_flags, excluded = detect_cooks_outliers(outlier_rows)
    r2_fail = run_guardrails(make_low_r2_rows(n=80, seed=99), active_r2=_active_r2_perfect())
    active_r2 = _active_r2_from_rows(rows)
    active_r2 = {key: value - 0.01 for key, value in active_r2.items()}
    full_pass = run_guardrails(rows, active_r2=active_r2)
    repro_pass, _ = validate_reproducibility(rows)

    report = {
        "insufficient_sample": {
            "passed": insufficient.passed,
            "code": insufficient.failure.code if insufficient.failure else None,
            "sample_size_final": insufficient.sample_size_final,
        },
        "cooks_outlier": {
            "excluded_ids": sorted(excluded),
            "flag_count": len(outlier_flags),
            "flagged_report_outlier": "report-outlier" in excluded,
        },
        "r2_degradation": {
            "passed": r2_fail.passed,
            "code": r2_fail.failure.code if r2_fail.failure else None,
            "sample_size_final": r2_fail.sample_size_final,
            "degraded_model_count": sum(
                1 for item in r2_fail.r2_comparisons if item.degraded
            ),
        },
        "reproducibility": {
            "passed": repro_pass,
        },
        "full_pass": {
            "passed": full_pass.passed,
            "sample_size_initial": full_pass.sample_size_initial,
            "sample_size_final": full_pass.sample_size_final,
            "outliers_excluded": len(full_pass.excluded_release_ids),
        },
        "all_scenarios_behave_as_expected": (
            insufficient.failure is not None
            and insufficient.failure.code == "insufficient_sample"
            and "report-outlier" in excluded
            and r2_fail.failure is not None
            and r2_fail.failure.code == "r2_degradation"
            and repro_pass
            and full_pass.passed
        ),
    }

    print("=== guardrails pass/fail scenarios (synthetic) ===")
    print(json.dumps(report, indent=2))
    assert report["all_scenarios_behave_as_expected"] is True
    print("PASS: guardrails scenarios")


def test_minimum_sample_size_helper() -> None:
    assert check_minimum_sample_size(40) is None
    failure = check_minimum_sample_size(10)
    assert failure is not None
    assert failure.code == "insufficient_sample"


def test_r2_degradation_helper_direct() -> None:
    rows = make_low_r2_rows(n=50)
    models = fit_all_regression_models(rows)
    failure, comparisons = check_r2_degradation(models, _active_r2_perfect())
    assert failure is not None
    assert failure.code == "r2_degradation"
    assert any(item.degraded for item in comparisons)
