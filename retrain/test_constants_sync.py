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
    format_stream_curve_template,
    sync_constants,
)
from fit import AlgoBandsFit, SaveRateBandsFit, StreamCurveFit


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


def _sample_stream_curve() -> StreamCurveFit:
    return StreamCurveFit(
        sample_size=57,
        median=[0.5, 27.2, 16.0] + [10.0] * 25,
        p25=[0.2, 23.3, 14.9] + [8.0] * 25,
        p75=[0.7, 31.7, 18.2] + [12.0] * 25,
    )


def _marker_block(name: str, body: str) -> str:
    start_marker, end_marker = config.CONSTANTS_MARKERS[name]
    return f"{start_marker}\n{body}\n{end_marker}"


def _fixture_constants_with_markers() -> str:
    return "\n".join(
        [
            'export const GENRES = ["house"] as const;',
            "",
            "/** % of week-1 streams by day (index 0 = day 1 … index 27 = day 28). */",
            _marker_block(
                "STREAM_CURVE_TEMPLATE",
                "export const STREAM_CURVE_TEMPLATE = {\n  median: [1.0],\n} as const;",
            ),
            "",
            "export type CurvePercentile = keyof typeof STREAM_CURVE_TEMPLATE;",
            "",
            "/** Save-rate health benchmarks (%), used by flags/monitoring, not forecast math. */",
            _marker_block(
                "SAVE_RATE_BANDS",
                "export const SAVE_RATE_BANDS = {\n  house: { lo: 1, hi: 2 },\n} as const;",
            ),
            "",
            "/** Algorithmic positioning thresholds (week-1 save counts) by artist tier. */",
            _marker_block(
                "SAVE_COUNT_BANDS",
                "export const SAVE_COUNT_BANDS = {\n  mid: { p25: 1, p50: 2, p75: 3, p90: 4 },\n} as const;",
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
    assert "STREAM_CURVE_TEMPLATE (MISSING)" in message
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
    replacements = build_marker_replacements(
        algo_bands=_sample_algo_bands(),
        save_rate_bands=_sample_save_rate_bands(),
        stream_curve=_sample_stream_curve(),
    )

    assert set(replacements) == set(config.CONSTANTS_MARKERS)
    assert "export const SAVE_COUNT_BANDS = {" in replacements["SAVE_COUNT_BANDS"]
    assert "developing: { p25: 1000, p50: 2000, p75: 3000, p90: 4000 }" in replacements[
        "SAVE_COUNT_BANDS"
    ]
    assert '"melodic-bass": { lo: 13, hi: 23 }' in replacements["SAVE_RATE_BANDS"]
    assert "median: [" in replacements["STREAM_CURVE_TEMPLATE"]
    assert "p75: [" in replacements["STREAM_CURVE_TEMPLATE"]
    assert "} as const;" in replacements["STREAM_CURVE_TEMPLATE"]


def test_apply_marker_replacements_updates_inner_content_only() -> None:
    original = _fixture_constants_with_markers()
    outside_before = _lines_outside_markers(original)
    replacements = build_marker_replacements(
        algo_bands=_sample_algo_bands(),
        save_rate_bands=_sample_save_rate_bands(),
        stream_curve=_sample_stream_curve(),
    )

    updated = apply_marker_replacements(original, replacements)
    outside_after = _lines_outside_markers(updated)

    assert outside_before == outside_after
    assert "p25: 1000, p50: 2000, p75: 3000, p90: 4000" in updated
    assert '"melodic-bass": { lo: 13, hi: 23 }' in updated
    assert "export type CurvePercentile = keyof typeof STREAM_CURVE_TEMPLATE;" in updated
    assert 'export { GENRE_PLAYBOOKS } from "@/lib/constants/playbooks";' in updated


def test_apply_marker_replacements_is_deterministic() -> None:
    original = _fixture_constants_with_markers()
    replacements = build_marker_replacements(
        algo_bands=_sample_algo_bands(),
        save_rate_bands=_sample_save_rate_bands(),
        stream_curve=_sample_stream_curve(),
    )

    first = apply_marker_replacements(original, replacements)
    second = apply_marker_replacements(original, replacements)

    assert first == second


def test_apply_marker_replacements_preserves_crlf_line_endings() -> None:
    original = _fixture_constants_with_markers().replace("\n", "\r\n")
    replacements = build_marker_replacements(
        algo_bands=_sample_algo_bands(),
        save_rate_bands=_sample_save_rate_bands(),
        stream_curve=_sample_stream_curve(),
    )

    updated = apply_marker_replacements(original, replacements)

    assert "\r\n" in updated
    assert "\n" not in updated.replace("\r\n", "")


def test_sync_constants_dry_run_does_not_write(tmp_path: Path) -> None:
    constants_path = tmp_path / "constants.ts"
    original = _fixture_constants_with_markers()
    constants_path.write_text(original, encoding="utf-8")

    result = sync_constants(
        algo_bands=_sample_algo_bands(),
        save_rate_bands=_sample_save_rate_bands(),
        stream_curve=_sample_stream_curve(),
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
        algo_bands=_sample_algo_bands(),
        save_rate_bands=_sample_save_rate_bands(),
        stream_curve=_sample_stream_curve(),
        path=constants_path,
        dry_run=False,
    )

    assert constants_path.read_text(encoding="utf-8") == updated
    assert "p25: 1000, p50: 2000, p75: 3000, p90: 4000" in updated


def test_format_helpers_match_typescript_conventions() -> None:
    save_count = format_save_count_bands(_sample_algo_bands())
    save_rate = format_save_rate_bands(_sample_save_rate_bands())
    stream_curve = format_stream_curve_template(_sample_stream_curve())

    assert save_count.endswith("} as const;")
    assert '"big-room": { lo: 5, hi: 10 }' in save_rate
    assert "0.5, 27.2, 16.0" in stream_curve
    assert stream_curve.count("[") == 3


def test_constants_sync_report(capsys: pytest.CaptureFixture[str]) -> None:
    original = _fixture_constants_with_markers()
    replacements = build_marker_replacements(
        algo_bands=_sample_algo_bands(),
        save_rate_bands=_sample_save_rate_bands(),
        stream_curve=_sample_stream_curve(),
    )
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
