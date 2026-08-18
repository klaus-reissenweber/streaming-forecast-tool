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
    load_active_consolidated_payload,
    load_active_r2,
    load_active_snapshot,
    stamp_active_fitted_at,
    utc_now_iso,
)
from draft_model import (
    build_draft_metadata,
    build_forecast_model_payload,
    insert_draft_forecast_model,
)
from fit_ad_model import fit_ad_model_payload
from forward_bias import scorer_from_payload
from fetch import ClosedReleasesBundle, FetchError, fetch_closed_releases_with_daily_data
from fit import (
    RegressionFit,
    SavesFit,
    fit_all_derived_models,
    fit_all_streams_models,
    fit_saves,
)
from guardrails import GuardrailResult, OutlierFlag, R2Comparison, run_guardrails

# Set by --write-draft on success for the job runner to attach to retrain_jobs.
LAST_DRAFT_MODEL_ID: str | None = None
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
    parser.add_argument(
        "--hold-the-commit",
        action="store_true",
        help=(
            "Fit + write lib/constants.ts markers; skip DB promote. "
            "Does not commit or deploy — review the constants diff first."
        ),
    )
    parser.add_argument(
        "--write-draft",
        action="store_true",
        help=(
            "Fit + write one consolidated model_coefficients draft row "
            "(status=draft, not active). Skips constants.ts sync and promote. "
            "Reviewable guardrail failures still write the draft."
        ),
    )
    parser.add_argument(
        "--job-id",
        metavar="UUID",
        default=None,
        help="Optional retrain_jobs.id to stamp into draft metadata.",
    )
    parser.add_argument(
        "--override-insufficient-sample",
        metavar="REASON",
        default=None,
        help=(
            "Promote despite post-Cook's n < MIN_SAMPLE_SIZE. Requires a "
            "non-empty documented reason (logged loudly). Uses the same "
            "all-eligible derived-band path as --hold-the-commit."
        ),
    )
    parser.add_argument(
        "--stamp-last-retrain",
        action="store_true",
        help=(
            "Stamp fitted_at on all active model_coefficients rows to "
            f"RETRAIN_LAST_AT ({config.RETRAIN_LAST_AT}), then exit. "
            "Seeds the archive retrain-progress cutoff after a hold-the-commit "
            "ship; future live promotes stamp fitted_at automatically."
        ),
    )
    args = parser.parse_args(argv)
    override = args.override_insufficient_sample
    if override is not None:
        override = override.strip() or None
    job_id = args.job_id.strip() if isinstance(args.job_id, str) else None
    return config.RetrainFlags(
        dry_run=args.dry_run,
        force=args.force,
        skip_constants_sync=args.skip_constants_sync,
        hold_the_commit=args.hold_the_commit,
        write_draft=args.write_draft,
        job_id=job_id or None,
        override_insufficient_sample=override,
        stamp_last_retrain=args.stamp_last_retrain,
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
    dict[str, float] | None,
    dict[str, list[float]] | None,
]:
    try:
        algo = snapshot.require("algo_bands").coefficients_json
        save_rate = snapshot.require("save_rate_bands").coefficients_json
        stream_bands = snapshot.require("stream_bands").coefficients_json
        stream = snapshot.require("stream_curve").coefficients_json
        return algo, save_rate, stream_bands, stream
    except DbError:
        return None, None, None, None


def run_stamp_last_retrain() -> int:
    """Stamp active fitted_at = RETRAIN_LAST_AT (baseline progress-bar seed)."""
    try:
        client = get_db_client()
        ids = stamp_active_fitted_at(client, config.RETRAIN_LAST_AT)
    except DbError as error:
        print(f"FAIL: stamp-last-retrain: {error}", file=sys.stderr)
        return 1

    print(
        f"OK: stamped fitted_at={config.RETRAIN_LAST_AT} on "
        f"{len(ids)} active model_coefficients row(s)."
    )
    return 0


def run(flags: config.RetrainFlags) -> int:
    global LAST_DRAFT_MODEL_ID
    LAST_DRAFT_MODEL_ID = None

    if flags.stamp_last_retrain:
        return run_stamp_last_retrain()

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

        hold_through_guardrail = False
        if not guardrail_result.passed:
            failure = guardrail_result.failure
            # Reviewable → continue fit + (for write-draft) still write draft.
            # Hard fail: reproducibility_failed / unknown codes.
            if failure is not None and failure.code == "r2_degradation":
                can_hold_through = flags.write_draft and len(training_rows) >= 2
            elif failure is not None and failure.code == "insufficient_sample":
                can_hold_through = len(training_rows) >= 2 and (
                    flags.hold_the_commit
                    or flags.write_draft
                    or bool(flags.override_insufficient_sample)
                )
            else:
                can_hold_through = False

            if not can_hold_through:
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

            hold_through_guardrail = True
            if failure is not None and failure.code == "r2_degradation":
                print(
                    "WARNING: --write-draft continuing past r2_degradation; "
                    "draft will record guardrails.passed=false for review."
                )
            elif flags.write_draft and not flags.override_insufficient_sample:
                print(
                    "WARNING: --write-draft continuing past insufficient_sample; "
                    f"fitting on all {len(training_rows)} eligible "
                    "(regression on post-Cook's). Draft guardrails.passed=false."
                )
            elif flags.hold_the_commit and not flags.override_insufficient_sample:
                print(
                    "WARNING: --hold-the-commit continuing past insufficient_sample; "
                    f"fitting weekday curve on all {len(training_rows)} eligible "
                    "releases (Cook's D exclusion not applied to derived bands). "
                    "LIVE promote remains blocked until n≥40 after exclusion."
                )
            else:
                print(
                    "WARNING: overriding insufficient_sample "
                    f"(n={guardrail_result.sample_size_final} < "
                    f"{config.MIN_SAMPLE_SIZE}); fitting derived bands on all "
                    f"{len(training_rows)} eligible releases. "
                    f"Override reason: {flags.override_insufficient_sample}"
                )

        filtered_rows = [
            row
            for row in training_rows
            if row.release_id not in guardrail_result.excluded_release_ids
        ]
        # Curve / ad_rates / magnitude: full eligible when holding through
        # sample-size failure; otherwise post-Cook's. Save-rate and stream
        # bands always use the full eligible set (decoupled from wk1 Cook's D).
        derived_rows = training_rows if hold_through_guardrail else filtered_rows
        regression_rows = filtered_rows if len(filtered_rows) >= 2 else training_rows

        stream_models = fit_all_streams_models(regression_rows)
        saves_model = fit_saves(regression_rows)
        regression_models = _combine_regression_models(stream_models, saves_model)
        derived_models = fit_all_derived_models(
            derived_rows,
            active_ad_rates,
            band_rows=training_rows,
        )

        active_algo, active_save_rate, active_stream_bands, active_stream = (
            _active_band_payloads(active_snapshot)
        )
        band_deltas = build_band_deltas(
            active_algo_bands=active_algo,
            active_save_rate_bands=active_save_rate,
            active_stream_bands=active_stream_bands,
            active_stream_curve=active_stream,
            new_algo_bands=derived_models["algo_bands"].bands,
            new_save_rate_bands=derived_models["save_rate_bands"].bands,
            new_stream_bands=derived_models["stream_bands"].to_coefficients_json(),
            new_stream_curve=derived_models["stream_curve"].to_coefficients_json(),
        )

        if flags.dry_run and not flags.hold_the_commit and not flags.write_draft:
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

        if flags.write_draft:
            streams_d0_raw = regression_models["streams_d0"]
            if not isinstance(streams_d0_raw, RegressionFit):
                raise RuntimeError("streams_d0 fit missing for --write-draft")
            streams_d0 = streams_d0_raw
            live_payload = load_active_consolidated_payload(client)
            # Hard-fail on ad fit errors: a soft live-block fallback used to
            # write a "successful" draft with stale ad coefficients while the
            # job still completed.
            ad_fit = fit_ad_model_payload()
            fitted_ad_model = ad_fit["ad_model"]
            ad_fit_meta: dict[str, Any] = {
                "ok": True,
                "sample_sizes": ad_fit.get("sample_sizes") or {},
                "excluded_auto_routers": ad_fit.get("excluded_auto_routers")
                or [],
                "excluded_non_traffic": ad_fit.get("excluded_non_traffic") or 0,
                "source": "db_ad_tables",
            }
            print(
                "OK: fitted ad_model from ad_* tables "
                f"(cpl_marquee_n={ad_fit_meta['sample_sizes'].get('cplMarquee')}, "
                f"meta_cpc_n={ad_fit_meta['sample_sizes'].get('metaCpc')})"
            )
            if not isinstance(fitted_ad_model, dict) or not fitted_ad_model:
                raise RuntimeError(
                    "ad_model fit returned empty ad_model; refusing draft write"
                )
            ad_model_for_draft = fitted_ad_model
            payload = build_forecast_model_payload(
                streams_d0=streams_d0,
                stream_curve=derived_models["stream_curve"],
                release_type_magnitude=derived_models["release_type_magnitude"],
                algo_bands=derived_models["algo_bands"],
                save_rate_bands=derived_models["save_rate_bands"],
                stream_bands=derived_models["stream_bands"],
                ad_model=ad_model_for_draft,
            )
            live_scorer = scorer_from_payload(live_payload)
            metadata = build_draft_metadata(
                eligible_rows=training_rows,
                clean_rows=filtered_rows,
                derived_rows=derived_rows,
                guardrail_result=guardrail_result,
                streams_d0=streams_d0,
                release_type_magnitude=derived_models["release_type_magnitude"],
                live_scorer=live_scorer,
                job_id=flags.job_id,
            )
            metadata["ad_model_fit"] = ad_fit_meta
            fitted_at = utc_now_iso()
            draft_id = insert_draft_forecast_model(
                client,
                payload=payload,
                metadata=metadata,
                streams_d0=streams_d0,
                fitted_at=fitted_at,
            )
            LAST_DRAFT_MODEL_ID = draft_id
            promotion_status = (
                f"draft written id={draft_id} "
                f"(guardrails.passed={guardrail_result.passed})"
            )
            print(f"OK: --write-draft → model_coefficients id={draft_id}")
            print(
                "forward_bias:",
                metadata.get("forward_bias"),
            )
            report = RetrainReport(
                dry_run=False,
                force_r2=flags.force,
                skip_constants_sync=True,
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
                failure_code=(
                    None
                    if guardrail_result.passed
                    else (
                        guardrail_result.failure.code
                        if guardrail_result.failure
                        else "guardrail_failed"
                    )
                ),
                failure_message=(
                    None
                    if guardrail_result.passed
                    else (
                        guardrail_result.failure.message
                        if guardrail_result.failure
                        else "Guardrails failed (draft still written)."
                    )
                ),
                recovery_instructions=(
                    None
                    if guardrail_result.passed
                    else "Draft written for review; do not activate until resolved."
                ),
            )
            print_retrain_report(report)
            # Exit 0 so the job worker can mark completed + attach draft_id.
            # Guardrail issues live on metadata.guardrails / report failure_*.
            return 0

        if flags.hold_the_commit:
            promotion_status = "skipped (--hold-the-commit; no DB promote)"
            if hold_through_guardrail:
                promotion_status += "; insufficient_sample (review-only)"
            if flags.skip_constants_sync:
                raise RuntimeError(
                    "--hold-the-commit writes constants; do not combine with "
                    "--skip-constants-sync."
                )
            sync_constants(
                algo_bands=derived_models["algo_bands"],
                save_rate_bands=derived_models["save_rate_bands"],
                stream_bands=derived_models["stream_bands"],
                stream_curve=derived_models["stream_curve"],
                release_type_magnitude=derived_models["release_type_magnitude"],
                dry_run=False,
            )
            files_written.append(str(config.CONSTANTS_TS_PATH))
            recovery = (
                "Hold-the-commit: constants.ts markers written. "
                "Review the DOW / kernel / trend diff, then commit and "
                "run a live promote when ready."
            )
            if hold_through_guardrail:
                recovery += (
                    " NOTE: post-Cook's n is below MIN_SAMPLE_SIZE — live "
                    "promote is still blocked until more closed releases land."
                )
            report = RetrainReport(
                dry_run=False,
                force_r2=flags.force,
                skip_constants_sync=False,
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
                recovery_instructions=recovery,
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
        promotion_status = (
            f"promoted ({len(config.ALL_MODEL_TYPES)} model_coefficients rows)"
        )
        if hold_through_guardrail and flags.override_insufficient_sample:
            promotion_status += (
                f"; insufficient_sample overridden "
                f"(n={guardrail_result.sample_size_final}"
                f"<{config.MIN_SAMPLE_SIZE}): "
                f"{flags.override_insufficient_sample}"
            )

        if not flags.skip_constants_sync:
            sync_constants(
                algo_bands=derived_models["algo_bands"],
                save_rate_bands=derived_models["save_rate_bands"],
                stream_bands=derived_models["stream_bands"],
                stream_curve=derived_models["stream_curve"],
                release_type_magnitude=derived_models["release_type_magnitude"],
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
