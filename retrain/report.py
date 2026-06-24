"""
Human-readable stdout summary for retrain runs (see RETRAINING.md).

Accepts plain report dataclasses only — no imports from fit, guardrails, or db.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class OutlierReportLine:
    release_id: str
    track_name: str
    artist_name: str
    model_type: str
    cooks_d: float
    threshold: float


@dataclass(frozen=True)
class R2ReportLine:
    model_type: str
    active_r2: float
    new_r2: float
    delta: float
    degraded: bool


@dataclass(frozen=True)
class BandDeltaLine:
    block_name: str
    summary: str


@dataclass(frozen=True)
class RetrainReport:
    dry_run: bool
    force_r2: bool
    skip_constants_sync: bool
    closed_release_count: int
    eligible_release_count: int
    sample_size_initial: int
    sample_size_final: int
    outlier_lines: tuple[OutlierReportLine, ...]
    excluded_release_count: int
    r2_lines: tuple[R2ReportLine, ...]
    band_deltas: tuple[BandDeltaLine, ...]
    promotion_status: str
    files_written: tuple[str, ...]
    fitted_at: str | None
    success: bool
    failure_code: str | None
    failure_message: str | None
    recovery_instructions: str | None


def _section(title: str) -> None:
    print()
    print(title)
    print("-" * len(title))


def _format_rate(value: float) -> str:
    rounded = round(value, 1)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.1f}"


def print_retrain_report(report: RetrainReport) -> None:
    mode = "DRY RUN" if report.dry_run else "LIVE"
    outcome = "PASSED" if report.success else "FAILED"
    print(f"=== Retrain summary ({mode}) — {outcome} ===")

    _section("Run flags")
    print(f"  dry_run: {report.dry_run}")
    print(f"  force_r2: {report.force_r2}")
    print(f"  skip_constants_sync: {report.skip_constants_sync}")

    _section("Sample sizes")
    print(f"  closed releases fetched: {report.closed_release_count}")
    print(f"  retrain-eligible (complete wk1 streams): {report.eligible_release_count}")
    print(f"  initial training pool: {report.sample_size_initial}")
    print(f"  after Cook's D exclusion: {report.sample_size_final}")

    _section("Outlier flags (Cook's D)")
    if not report.outlier_lines:
        print("  (none)")
    else:
        by_release: dict[str, list[OutlierReportLine]] = {}
        for line in report.outlier_lines:
            by_release.setdefault(line.release_id, []).append(line)
        for release_id, lines in sorted(by_release.items()):
            first = lines[0]
            models = ", ".join(sorted({line.model_type for line in lines}))
            max_d = max(line.cooks_d for line in lines)
            print(
                f"  {first.track_name} — {first.artist_name} "
                f"({release_id[:8]}…): models={models}, max D={max_d:.4f}"
            )
        print(f"  releases excluded (union): {report.excluded_release_count}")

    _section("R² before / after (regression models)")
    if not report.r2_lines:
        print("  (not computed)")
    else:
        for line in report.r2_lines:
            flag = " DEGRADED" if line.degraded else ""
            print(
                f"  {line.model_type:12} active={line.active_r2:.4f} "
                f"new={line.new_r2:.4f} delta={line.delta:+.4f}{flag}"
            )

    _section("Band deltas (high level)")
    if not report.band_deltas:
        print("  (not computed)")
    else:
        for line in report.band_deltas:
            print(f"  {line.block_name}: {line.summary}")

    _section("Promotion")
    print(f"  status: {report.promotion_status}")
    if report.fitted_at:
        print(f"  fitted_at: {report.fitted_at}")

    _section("Files written")
    if not report.files_written:
        print("  (none)")
    else:
        for path in report.files_written:
            print(f"  {path}")

    if not report.success:
        _section("Failure")
        if report.failure_code:
            print(f"  code: {report.failure_code}")
        if report.failure_message:
            print(f"  message: {report.failure_message}")
        if report.recovery_instructions:
            print()
            print(report.recovery_instructions)


def build_band_deltas(
    *,
    active_algo_bands: dict[str, dict[str, int]] | None,
    active_save_rate_bands: dict[str, dict[str, float]] | None,
    active_stream_curve: dict[str, list[float]] | None,
    new_algo_bands: dict[str, dict[str, int]] | None,
    new_save_rate_bands: dict[str, dict[str, float]] | None,
    new_stream_curve: dict[str, list[float]] | None,
) -> tuple[BandDeltaLine, ...]:
    deltas: list[BandDeltaLine] = []

    if active_algo_bands and new_algo_bands:
        parts: list[str] = []
        for tier in ("developing", "mid", "established"):
            old_p50 = active_algo_bands.get(tier, {}).get("p50")
            new_p50 = new_algo_bands.get(tier, {}).get("p50")
            if old_p50 is not None and new_p50 is not None:
                parts.append(f"{tier} p50 {old_p50}→{new_p50} ({new_p50 - old_p50:+d})")
        deltas.append(
            BandDeltaLine(
                block_name="SAVE_COUNT_BANDS",
                summary="; ".join(parts) if parts else "no comparable tiers",
            )
        )

    if active_save_rate_bands and new_save_rate_bands:
        parts = []
        for genre in sorted(new_save_rate_bands):
            old = active_save_rate_bands.get(genre)
            new = new_save_rate_bands.get(genre)
            if old and new:
                parts.append(
                    f"{genre} lo {_format_rate(old['lo'])}→{_format_rate(new['lo'])}, "
                    f"hi {_format_rate(old['hi'])}→{_format_rate(new['hi'])}"
                )
        deltas.append(
            BandDeltaLine(
                block_name="SAVE_RATE_BANDS",
                summary="; ".join(parts) if parts else "no comparable genres",
            )
        )

    if active_stream_curve and new_stream_curve:
        old_median = active_stream_curve.get("curve_median") or active_stream_curve.get("median")
        new_median = new_stream_curve.get("curve_median") or new_stream_curve.get("median")
        if old_median and new_median and old_median[0:1] and new_median[0:1]:
            deltas.append(
                BandDeltaLine(
                    block_name="STREAM_CURVE_TEMPLATE",
                    summary=(
                        f"median D1 {_format_rate(old_median[0])}→{_format_rate(new_median[0])}, "
                        f"D2 {_format_rate(old_median[1])}→{_format_rate(new_median[1])}"
                        if len(old_median) > 1 and len(new_median) > 1
                        else f"median D1 {_format_rate(old_median[0])}→{_format_rate(new_median[0])}"
                    ),
                )
            )

    return tuple(deltas)
