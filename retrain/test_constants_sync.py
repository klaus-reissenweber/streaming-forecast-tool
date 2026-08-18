"""Unit tests for constants_sync.py (no live lib/constants.ts writes)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import config
from constants_sync import (
    MissingMarkersError,
    apply_marker_replacements,
    build_marker_replacements,
    find_marker_regions,
    format_save_count_bands,
    format_save_rate_bands,
    format_stream_bands,
    format_stream_curve_trend,
    format_stream_dow_multiplier,
    format_stream_editorial_kernel,
    sync_constants,
)
from fit import (
    AlgoBandsFit,
    ReleaseTypeMagnitudeFit,
    SaveRateBandsFit,
    StreamBandsFit,
    StreamCurveFit,
)


def _sample_algo_bands() -> AlgoBandsFit:
    return AlgoBandsFit(
        sample_size=57,
        bands={
            "developing": {"p25": 1000, "p50": 2000, "p75": 3000, "p90": 4000},
            "mid": {"p25": 4000, "p50": 5000, "p75": 6000, "p90": 7000},
            "established": {"p25": 8000, "p50": 9000, "p75": 10000, "p90": 11000},
        },
    )


def _sample_save_rate_bands() -> SaveRateBandsFit:
    return SaveRateBandsFit(
        sample_size=57,
        bands={
            "dubstep": {"lo": 17.0, "hi": 22.0},
            "house": {"lo": 9.0, "hi": 16.0},
            "melodic-bass": {"lo": 13.0, "hi": 23.0},
            "downtempo": {"lo": 10.0, "hi": 16.0},
            "big-room": {"lo": 5.0, "hi": 10.0},
        },
    )


def _sample_stream_bands() -> StreamBandsFit:
    return StreamBandsFit(sample_size=58, lo=0.45, hi=1.05)


def _sample_stream_curve() -> StreamCurveFit:
    trend = [5.8, 5.7, 8.2] + [10.0] * 25
    composed = [6.4, 28.5, 13.5] + [10.0] * 25
    return StreamCurveFit(
        sample_size=57,
        trend_median=list(trend),
        trend_p25=[5.0, 5.0, 7.0] + [8.0] * 25,
        trend_p75=[6.5, 6.5, 9.0] + [12.0] * 25,
        dow_multiplier=[0.912, 0.971, 0.982, 1.099, 1.262, 0.983, 0.814],
        editorial_kernel=[21.33, 5.49],
        median=list(composed),
        p25=[5.0, 24.0, 12.0] + [8.0] * 25,
        p75=[7.0, 32.0, 15.0] + [12.0] * 25,
    )


def _sample_release_type_magnitude() -> ReleaseTypeMagnitudeFit:
    return ReleaseTypeMagnitudeFit(
        sample_size=40,
        multipliers={
            "single": 1.0,
            "lead_single": 1.0,
            "focus_track": 1.03,
            "album_track": 1.0,
            "alternate_version": 0.87,
        },
        raw_ratios={
            "single": 1.0,
            "lead_single": 1.0,
            "focus_track": 1.2,
            "album_track": 1.0,
            "alternate_version": 0.55,
        },
        counts={
            "single": 20,
            "lead_single": 5,
            "focus_track": 5,
            "album_track": 5,
            "alternate_version": 5,
        },
        shrinkage_k=5,
    )


def _marker_kwargs() -> dict:
    return {
        "algo_bands": _sample_algo_bands(),
        "save_rate_bands": _sample_save_rate_bands(),
        "stream_bands": _sample_stream_bands(),
        "stream_curve": _sample_stream_curve(),
        "release_type_magnitude": _sample_release_type_magnitude(),
    }


def _marker_block(name: str, body: str) -> str:
    start_marker, end_marker = config.CONSTANTS_MARKERS[name]
    return f"{start_marker}\n{body}\n{end_marker}"


def _fixture_constants_with_markers() -> str:
    return "\n".join(
        [
            'export const GENRES = ["house"] as const;',
            "",
            "/** Calendar day-of-week multipliers. */",
            _marker_block(
                "STREAM_DOW_MULTIPLIER",
                "export const STREAM_DOW_MULTIPLIER = {\n  Mon: 1.0,\n} as const;",
            ),
            "",
            "/** New Music Friday bump. */",
            _marker_block(
                "STREAM_EDITORIAL_KERNEL",
                "export const STREAM_EDITORIAL_KERNEL = [1.0, 0.0] as const;",
            ),
            "",
            "/** Seasonless trend. */",
            _marker_block(
                "STREAM_CURVE_TREND",
                "export const STREAM_CURVE_TREND = {\n  median: [1.0],\n} as const;",
            ),
            "",
            "export type CurvePercentile = keyof typeof STREAM_CURVE_TREND;",
            "",
            "/** Save-rate health benchmarks (%), used by flags/monitoring, not forecast math. */",
            _marker_block(
                "SAVE_RATE_BANDS",
                "export const SAVE_RATE_BANDS = {\n  house: { lo: 1, hi: 2 },\n} as const;",
            ),
            "",
            "/** Week-1 stream forecast-error band (actual / locked), global. */",
            _marker_block(
                "STREAM_BANDS",
                "export const STREAM_BANDS = { lo: 0.4, hi: 1.0, n: 10 } as const;",
            ),
            "",
            "/** Algorithmic positioning thresholds (week-1 save counts) by artist tier. */",
            _marker_block(
                "SAVE_COUNT_BANDS",
                "export const SAVE_COUNT_BANDS = {\n  mid: { p25: 1, p50: 2, p75: 3, p90: 4 },\n} as const;",
            ),
            "",
            "/** Retrain-owned release_type magnitude multipliers. */",
            _marker_block(
                "RELEASE_TYPE_MAGNITUDE_MULTIPLIER",
                "export const RELEASE_TYPE_MAGNITUDE_MULTIPLIER = {\n  single: 1.0,\n} as const;",
            ),
            "",
            'export { GENRE_PLAYBOOKS } from "@/lib/constants/playbooks";',
            "",
        ]
    )


def _fixture_constants_without_markers() -> str:
    return "\n".join(
        [
            "/** Save-rate health benchmarks (%), used by flags/monitoring, not forecast math. */",
            "export const SAVE_RATE_BANDS = {",
            "  house: { lo: 9, hi: 16 },",
            "} as const;",
            "",
            "/** Algorithmic positioning thresholds (week-1 save counts) by artist tier. */",
            "export const SAVE_COUNT_BANDS = {",
            "  developing: { p25: 3018, p50: 5341, p75: 9101, p90: 13116 },",
            "} as const;",
            "",
        ]
    )


def _lines_outside_markers(content: str) -> list[str]:
    regions = find_marker_regions(content)
    lines = content.splitlines()
    masked = set()
    for region in regions.values():
        for index in range(region.start_line, region.end_line + 1):
            masked.add(index)
    return [line for index, line in enumerate(lines) if index not in masked]


def test_find_marker_regions_success() -> None:
    content = _fixture_constants_with_markers()
    regions = find_marker_regions(content)

    assert set(regions) == set(config.CONSTANTS_MARKERS)
    for name, region in regions.items():
        start_marker, end_marker = config.CONSTANTS_MARKERS[name]
        lines = content.splitlines()
        assert lines[region.start_line].strip() == start_marker
        assert lines[region.end_line].strip() == end_marker
        assert region.inner_end > region.inner_start


def test_find_marker_regions_failure_without_markers() -> None:
    content = _fixture_constants_without_markers()

    with pytest.raises(MissingMarkersError) as exc_info:
        find_marker_regions(content)

    message = str(exc_info.value)
    assert "Missing RETRAIN marker comments" in message
    assert "SAVE_COUNT_BANDS (MISSING)" in message
    assert "SAVE_RATE_BANDS (MISSING)" in message
    assert "STREAM_BANDS (MISSING)" in message
    assert "STREAM_DOW_MULTIPLIER (MISSING)" in message
    assert "STREAM_EDITORIAL_KERNEL (MISSING)" in message
    assert "STREAM_CURVE_TREND (MISSING)" in message
    assert "RELEASE_TYPE_MAGNITUDE_MULTIPLIER (MISSING)" in message
    assert "// RETRAIN:SAVE_COUNT_BANDS:START" in message
    assert str(config.CONSTANTS_TS_PATH) in message


def test_find_marker_regions_failure_on_duplicate_start_marker() -> None:
    start_marker, end_marker = config.CONSTANTS_MARKERS["SAVE_COUNT_BANDS"]
    content = "\n".join(
        [
            start_marker,
            "export const SAVE_COUNT_BANDS = {} as const;",
            end_marker,
            start_marker,
            "export const SAVE_COUNT_BANDS = {} as const;",
            end_marker,
        ]
    )

    with pytest.raises(MissingMarkersError) as exc_info:
        find_marker_regions(content)

    assert "SAVE_COUNT_BANDS (MISSING)" in str(exc_info.value)


def test_build_marker_replacements_formats_expected_blocks() -> None:
    replacements = build_marker_replacements(**_marker_kwargs())

    assert set(replacements) == set(config.CONSTANTS_MARKERS)
    assert "export const SAVE_COUNT_BANDS = {" in replacements["SAVE_COUNT_BANDS"]
    assert "developing: { p25: 1000, p50: 2000, p75: 3000, p90: 4000 }" in replacements[
        "SAVE_COUNT_BANDS"
    ]
    assert '"melodic-bass": { lo: 13, hi: 23 }' in replacements["SAVE_RATE_BANDS"]
    assert replacements["STREAM_BANDS"] == (
        "export const STREAM_BANDS = { lo: 0.45, hi: 1.05, n: 58 } as const;"
    )
    assert "Fri: 1.262" in replacements["STREAM_DOW_MULTIPLIER"]
    assert "export const STREAM_EDITORIAL_KERNEL = [21.33, 5.49] as const;" in replacements[
        "STREAM_EDITORIAL_KERNEL"
    ]
    assert "median: [" in replacements["STREAM_CURVE_TREND"]
    assert "p75: [" in replacements["STREAM_CURVE_TREND"]
    assert "} as const;" in replacements["STREAM_CURVE_TREND"]
    assert "focus_track: 1.03" in replacements["RELEASE_TYPE_MAGNITUDE_MULTIPLIER"]
    assert "alternate_version: 0.87" in replacements["RELEASE_TYPE_MAGNITUDE_MULTIPLIER"]


def test_apply_marker_replacements_updates_inner_content_only() -> None:
    original = _fixture_constants_with_markers()
    outside_before = _lines_outside_markers(original)
    replacements = build_marker_replacements(**_marker_kwargs())

    updated = apply_marker_replacements(original, replacements)
    outside_after = _lines_outside_markers(updated)

    assert outside_before == outside_after
    assert "p25: 1000, p50: 2000, p75: 3000, p90: 4000" in updated
    assert '"melodic-bass": { lo: 13, hi: 23 }' in updated
    assert "export type CurvePercentile = keyof typeof STREAM_CURVE_TREND;" in updated
    assert 'export { GENRE_PLAYBOOKS } from "@/lib/constants/playbooks";' in updated


def test_apply_marker_replacements_is_deterministic() -> None:
    original = _fixture_constants_with_markers()
    replacements = build_marker_replacements(**_marker_kwargs())

    first = apply_marker_replacements(original, replacements)
    second = apply_marker_replacements(original, replacements)

    assert first == second


def test_apply_marker_replacements_preserves_crlf_line_endings() -> None:
    original = _fixture_constants_with_markers().replace("\n", "\r\n")
    replacements = build_marker_replacements(**_marker_kwargs())

    updated = apply_marker_replacements(original, replacements)

    assert "\r\n" in updated
    assert "\n" not in updated.replace("\r\n", "")


def test_sync_constants_dry_run_does_not_write(tmp_path: Path) -> None:
    constants_path = tmp_path / "constants.ts"
    original = _fixture_constants_with_markers()
    constants_path.write_text(original, encoding="utf-8")

    result = sync_constants(
        **_marker_kwargs(),
        path=constants_path,
        dry_run=True,
    )

    assert result != original
    assert constants_path.read_text(encoding="utf-8") == original


def test_sync_constants_writes_updated_file(tmp_path: Path) -> None:
    constants_path = tmp_path / "constants.ts"
    original = _fixture_constants_with_markers()
    constants_path.write_text(original, encoding="utf-8")

    updated = sync_constants(
        **_marker_kwargs(),
        path=constants_path,
        dry_run=False,
    )

    assert constants_path.read_text(encoding="utf-8") == updated
    assert "p25: 1000, p50: 2000, p75: 3000, p90: 4000" in updated
    assert "focus_track: 1.03" in updated
    assert "Fri: 1.262" in updated


def test_format_helpers_match_typescript_conventions() -> None:
    save_count = format_save_count_bands(_sample_algo_bands())
    save_rate = format_save_rate_bands(_sample_save_rate_bands())
    stream_bands = format_stream_bands(_sample_stream_bands())
    dow = format_stream_dow_multiplier(_sample_stream_curve())
    kernel = format_stream_editorial_kernel(_sample_stream_curve())
    trend = format_stream_curve_trend(_sample_stream_curve())

    assert save_count.endswith("} as const;")
    assert '"big-room": { lo: 5, hi: 10 }' in save_rate
    assert stream_bands == (
        "export const STREAM_BANDS = { lo: 0.45, hi: 1.05, n: 58 } as const;"
    )
    assert "Mon: 0.912" in dow
    assert kernel == "export const STREAM_EDITORIAL_KERNEL = [21.33, 5.49] as const;"
    assert "5.8, 5.7, 8.2" in trend
    assert trend.count("[") == 3


def test_constants_sync_report(capsys: pytest.CaptureFixture[str]) -> None:
    original = _fixture_constants_with_markers()
    replacements = build_marker_replacements(**_marker_kwargs())
    updated = apply_marker_replacements(original, replacements)

    summary = {
        "blocks_replaced": sorted(replacements),
        "outside_lines_unchanged": _lines_outside_markers(original)
        == _lines_outside_markers(updated),
        "deterministic": updated
        == apply_marker_replacements(original, replacements),
    }

    print("=== constants_sync (mock fixture) ===")
    print(json.dumps(summary, indent=2))
    assert summary["outside_lines_unchanged"] is True
    assert summary["deterministic"] is True
    print("PASS: constants_sync")
