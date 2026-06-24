#!/usr/bin/env python3
"""
Offline model retrain CLI (see RETRAINING.md).

retrain.py is the sole orchestrator — it imports all pipeline modules.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

import config
from constants_sync import MissingMarkersError, sync_constants
from dataset import build_training_rows
from db import (
    ActiveRowIntegrityError,
    DbError,
    PromotionError,
    get_db_client,
    insert_and_promote,
    load_active_ad_rates,
    load_active_r2,
    load_active_snapshot,
    utc_now_iso,
)
from fetch import ClosedReleasesBundle, FetchError, fetch_closed_releases_with_daily_data
from fit import SavesFit, fit_all_derived_models, fit_all_streams_models, fit_saves
from guardrails import GuardrailResult, OutlierFlag, R2Comparison, run_guardrails
from report import (
    BandDeltaLine,
    OutlierReportLine,
    R2ReportLine,
    RetrainReport,
    build_band_deltas,
    print_retrain_report,
)


def parse_args(argv: list[str] | None = None) -> config.RetrainFlags:
    parser = argparse.ArgumentParser(
        description="Retrain streaming forecast models from closed releases."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fit + guardrails + report only; no DB writes or constants patch.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip R² degradation guardrail (manual override; logged loudly).",
    )
    parser.add_argument(
        "--skip-constants-sync",
        action="store_true",
        help="Promote DB rows only; do not patch lib/constants.ts.",
    )
    args = parser.parse_args(argv)
    return config.RetrainFlags(
        dry_run=args.dry_run,
        force=args.force,
        skip_constants_sync=args.skip_constants_sync,
    )


def _recovery_for_guardrail(result: GuardrailResult) -> str:
    if result.failure is None:
        return ""
    code = result.failure.code
    if code == "insufficient_sample":
        return (
            "Wait for more closed releases with complete D1–D7 stream entry, "
            "or verify daily_data completeness in Supabase. "
            "Check /archive retrain-eligible count before re-running."
        )
    if code == "r2_degradation":
        return (
            "Investigate recent outliers, genre mix shifts, or data entry errors. "
            "Use --dry-run to inspect per-model R² deltas. "
            "Only use --force with explicit operator intent."
        )
    if code == "reproducibility_failed":
        return (
            "Do not promote. This indicates a non-deterministic fit pipeline bug. "
            "Do not retry with --force."
        )
    return result.failure.message


def _recovery_for_exception(error: Exception) -> str:
    if isinstance(error, (ActiveRowIntegrityError, PromotionError, MissingMarkersError)):
        return str(error)
    if isinstance(error, DbError):
        return (
            f"{error}\n"
            "Verify model_coefficients active-row integrity in Supabase, then re-run "
            "with --dry-run before attempting another live promotion."
        )
    if isinstance(error, FetchError):
        return (
            f"{error}\n"
            "Verify Supabase credentials in retrain/.env.local and that closed releases "
            "have valid daily_data rows."
        )
    return str(error)


def _outlier_lines(flags: tuple[OutlierFlag, ...]) -> tuple[OutlierReportLine, ...]:
    return tuple(
        OutlierReportLine(
            release_id=flag.release_id,
            track_name=flag.track_name,
            artist_name=flag.artist_name,
            model_type=flag.model_type,
            cooks_d=flag.cooks_d,
            threshold=flag.threshold,
        )
        for flag in flags
    )


def _r2_lines(comparisons: tuple[R2Comparison, ...]) -> tuple[R2ReportLine, ...]:
    return tuple(
        R2ReportLine(
            model_type=item.model_type,
            active_r2=item.active_r2,
            new_r2=item.new_r2,
            delta=item.delta,
            degraded=item.degraded,
        )
        for item in comparisons
    )


def _combine_regression_models(
    stream_models: dict[str, Any],
    saves_model: SavesFit,
) -> dict[str, Any]:
    return {**stream_models, "saves": saves_model}


def _active_band_payloads(snapshot: Any) -> tuple[
    dict[str, dict[str, int]] | None,
    dict[str, dict[str, float]] | None,
    dict[str, list[float]] | None,
]:
    try:
        algo = snapshot.require("algo_bands").coefficients_json
        save_rate = snapshot.require("save_rate_bands").coefficients_json
        stream = snapshot.require("stream_curve").coefficients_json
        return algo, save_rate, stream
    except DbError:
        return None, None, None


def run(flags: config.RetrainFlags) -> int:
    files_written: list[str] = []
    fitted_at: str | None = None
    promotion_status = "not attempted"
    band_deltas: tuple[BandDeltaLine, ...] = ()
    guardrail_result: GuardrailResult | None = None
    closed_count = 0
    eligible_count = 0

    try:
        client = get_db_client()
        bundle: ClosedReleasesBundle = fetch_closed_releases_with_daily_data(client)
        closed_count = len(bundle.releases)

        training_rows = build_training_rows(
            bundle.releases,
            bundle.daily_data_by_release_id,
        )
        eligible_count = len(training_rows)

        active_r2 = load_active_r2(client)
        active_ad_rates = load_active_ad_rates(client)
        active_snapshot = load_active_snapshot(client)

        if flags.force:
            print("WARNING: --force is set; R² degradation guardrail will be skipped.")

        guardrail_result = run_guardrails(
            training_rows,
            active_r2,
            force_r2=flags.force,
        )

        if not guardrail_result.passed:
            failure = guardrail_result.failure
            report = RetrainReport(
                dry_run=flags.dry_run,
                force_r2=flags.force,
                skip_constants_sync=flags.skip_constants_sync,
                closed_release_count=closed_count,
                eligible_release_count=eligible_count,
                sample_size_initial=guardrail_result.sample_size_initial,
                sample_size_final=guardrail_result.sample_size_final,
                outlier_lines=_outlier_lines(guardrail_result.outlier_flags),
                excluded_release_count=len(guardrail_result.excluded_release_ids),
                r2_lines=_r2_lines(guardrail_result.r2_comparisons),
                band_deltas=(),
                promotion_status="blocked by guardrails",
                files_written=tuple(files_written),
                fitted_at=None,
                success=False,
                failure_code=failure.code if failure else "guardrail_failed",
                failure_message=failure.message if failure else "Guardrails failed.",
                recovery_instructions=_recovery_for_guardrail(guardrail_result),
            )
            print_retrain_report(report)
            return 1

        filtered_rows = [
            row
            for row in training_rows
            if row.release_id not in guardrail_result.excluded_release_ids
        ]

        stream_models = fit_all_streams_models(filtered_rows)
        saves_model = fit_saves(filtered_rows)
        regression_models = _combine_regression_models(stream_models, saves_model)
        derived_models = fit_all_derived_models(filtered_rows, active_ad_rates)

        active_algo, active_save_rate, active_stream = _active_band_payloads(active_snapshot)
        band_deltas = build_band_deltas(
            active_algo_bands=active_algo,
            active_save_rate_bands=active_save_rate,
            active_stream_curve=active_stream,
            new_algo_bands=derived_models["algo_bands"].bands,
            new_save_rate_bands=derived_models["save_rate_bands"].bands,
            new_stream_curve=derived_models["stream_curve"].to_coefficients_json(),
        )

        if flags.dry_run:
            promotion_status = "skipped (--dry-run)"
            report = RetrainReport(
                dry_run=True,
                force_r2=flags.force,
                skip_constants_sync=flags.skip_constants_sync,
                closed_release_count=closed_count,
                eligible_release_count=eligible_count,
                sample_size_initial=guardrail_result.sample_size_initial,
                sample_size_final=guardrail_result.sample_size_final,
                outlier_lines=_outlier_lines(guardrail_result.outlier_flags),
                excluded_release_count=len(guardrail_result.excluded_release_ids),
                r2_lines=_r2_lines(guardrail_result.r2_comparisons),
                band_deltas=band_deltas,
                promotion_status=promotion_status,
                files_written=tuple(files_written),
                fitted_at=None,
                success=True,
                failure_code=None,
                failure_message=None,
                recovery_instructions=None,
            )
            print_retrain_report(report)
            return 0

        fitted_at = utc_now_iso()
        insert_and_promote(
            client,
            regression_models=regression_models,
            derived_models=derived_models,
            fitted_at=fitted_at,
        )
        promotion_status = "promoted (13 model_coefficients rows)"

        if not flags.skip_constants_sync:
            sync_constants(
                algo_bands=derived_models["algo_bands"],
                save_rate_bands=derived_models["save_rate_bands"],
                stream_curve=derived_models["stream_curve"],
                dry_run=False,
            )
            files_written.append(str(config.CONSTANTS_TS_PATH))
        else:
            promotion_status += "; constants sync skipped"

        report = RetrainReport(
            dry_run=False,
            force_r2=flags.force,
            skip_constants_sync=flags.skip_constants_sync,
            closed_release_count=closed_count,
            eligible_release_count=eligible_count,
            sample_size_initial=guardrail_result.sample_size_initial,
            sample_size_final=guardrail_result.sample_size_final,
            outlier_lines=_outlier_lines(guardrail_result.outlier_flags),
            excluded_release_count=len(guardrail_result.excluded_release_ids),
            r2_lines=_r2_lines(guardrail_result.r2_comparisons),
            band_deltas=band_deltas,
            promotion_status=promotion_status,
            files_written=tuple(files_written),
            fitted_at=fitted_at,
            success=True,
            failure_code=None,
            failure_message=None,
            recovery_instructions=None,
        )
        print_retrain_report(report)
        return 0

    except Exception as error:
        report = RetrainReport(
            dry_run=flags.dry_run,
            force_r2=flags.force,
            skip_constants_sync=flags.skip_constants_sync,
            closed_release_count=closed_count,
            eligible_release_count=eligible_count,
            sample_size_initial=guardrail_result.sample_size_initial if guardrail_result else 0,
            sample_size_final=guardrail_result.sample_size_final if guardrail_result else 0,
            outlier_lines=_outlier_lines(guardrail_result.outlier_flags)
            if guardrail_result
            else (),
            excluded_release_count=len(guardrail_result.excluded_release_ids)
            if guardrail_result
            else 0,
            r2_lines=_r2_lines(guardrail_result.r2_comparisons) if guardrail_result else (),
            band_deltas=band_deltas,
            promotion_status=promotion_status,
            files_written=tuple(files_written),
            fitted_at=fitted_at,
            success=False,
            failure_code=type(error).__name__,
            failure_message=str(error),
            recovery_instructions=_recovery_for_exception(error),
        )
        print_retrain_report(report)
        return 1


def main(argv: list[str] | None = None) -> int:
    flags = parse_args(argv)
    return run(flags)


if __name__ == "__main__":
    sys.exit(main())
