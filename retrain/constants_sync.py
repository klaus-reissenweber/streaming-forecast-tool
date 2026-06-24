"""
Patch lib/constants.ts band blocks via RETRAIN marker comments (see RETRAINING.md).

Option A: markers must exist before sync runs. Missing markers raise with operator
setup instructions — no auto-wrapping.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import config
from fit import AlgoBandsFit, SaveRateBandsFit, StreamCurveFit

DEFAULT_CONSTANTS_PATH = config.CONSTANTS_TS_PATH

STREAM_CURVE_VALUES_PER_LINE = 13


class ConstantsSyncError(Exception):
    """Base error for constants.ts sync operations."""


class MissingMarkersError(ConstantsSyncError):
    """One or more RETRAIN marker pairs are absent from lib/constants.ts."""


@dataclass(frozen=True)
class MarkerRegion:
    """Line indices for a START/END marker pair (0-based, inclusive markers)."""

    name: str
    start_line: int
    end_line: int

    @property
    def inner_start(self) -> int:
        return self.start_line + 1

    @property
    def inner_end(self) -> int:
        return self.end_line


def _detect_line_ending(content: str) -> str:
    if "\r\n" in content:
        return "\r\n"
    return "\n"


def _split_lines(content: str) -> tuple[list[str], str]:
    line_ending = _detect_line_ending(content)
    if not content:
        return [], line_ending
    lines = content.split(line_ending)
    if content.endswith(line_ending) and lines and lines[-1] == "":
        lines.pop()
    return lines, line_ending


def _join_lines(lines: list[str], line_ending: str, *, trailing_newline: bool) -> str:
    body = line_ending.join(lines)
    if trailing_newline:
        body += line_ending
    return body


def _missing_markers_message(missing: list[str]) -> str:
    blocks: list[str] = [
        "Missing RETRAIN marker comments in lib/constants.ts. "
        "Add these once (preserve any doc comments above each export, outside the markers):",
        "",
    ]
    for index, name in enumerate(config.CONSTANTS_MARKERS, start=1):
        start_marker, end_marker = config.CONSTANTS_MARKERS[name]
        status = "MISSING" if name in missing else "ok"
        blocks.append(f"{index}. {name} ({status}):")
        blocks.append(start_marker)
        blocks.append(f"export const {name} = {{ ... }} as const;")
        blocks.append(end_marker)
        blocks.append("")

    blocks.append(
        f"Edit {config.CONSTANTS_TS_PATH}, commit the marker setup, then re-run the retrain script."
    )
    return "\n".join(blocks)


def find_marker_regions(content: str) -> dict[str, MarkerRegion]:
    lines, _ = _split_lines(content)
    regions: dict[str, MarkerRegion] = {}
    missing: list[str] = []

    for name, (start_marker, end_marker) in config.CONSTANTS_MARKERS.items():
        start_matches = [
            index for index, line in enumerate(lines) if line.strip() == start_marker
        ]
        end_matches = [
            index for index, line in enumerate(lines) if line.strip() == end_marker
        ]

        if len(start_matches) != 1 or len(end_matches) != 1:
            missing.append(name)
            continue

        start_line = start_matches[0]
        end_line = end_matches[0]
        if end_line <= start_line:
            missing.append(name)
            continue

        regions[name] = MarkerRegion(
            name=name,
            start_line=start_line,
            end_line=end_line,
        )

    if missing:
        raise MissingMarkersError(_missing_markers_message(missing))

    return regions


def _ts_object_key(key: str) -> str:
    if key.replace("-", "_").isidentifier() and "-" not in key:
        return key
    return f'"{key}"'


def _format_number(value: float) -> str:
    rounded = round(value, 1)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.1f}"


def _format_curve_number(value: float) -> str:
    return f"{round(value, 1):.1f}"


def _format_ts_array(
    values: list[float],
    *,
    indent: str,
    values_per_line: int,
) -> list[str]:
    if not values:
        return ["[]"]

    formatted = [_format_curve_number(value) for value in values]
    lines: list[str] = []
    for index in range(0, len(formatted), values_per_line):
        chunk = formatted[index : index + values_per_line]
        prefix = f"{indent}  " if index == 0 else f"{indent}    "
        lines.append(f"{prefix}{', '.join(chunk)},")
    lines[-1] = lines[-1][:-1]
    return lines


def format_save_count_bands(algo_bands: AlgoBandsFit) -> str:
    lines = ["export const SAVE_COUNT_BANDS = {"]
    for tier in config.ARTIST_TIERS:
        band = algo_bands.bands[tier]
        lines.append(
            "  "
            f"{tier}: {{ p25: {band['p25']}, p50: {band['p50']}, "
            f"p75: {band['p75']}, p90: {band['p90']} }},"
        )
    lines[-1] = lines[-1][:-1]
    lines.append("} as const;")
    return "\n".join(lines)


def format_save_rate_bands(save_rate_bands: SaveRateBandsFit) -> str:
    lines = ["export const SAVE_RATE_BANDS = {"]
    for genre in config.GENRES:
        band = save_rate_bands.bands[genre]
        key = _ts_object_key(genre)
        lo = _format_number(band["lo"])
        hi = _format_number(band["hi"])
        lines.append(f"  {key}: {{ lo: {lo}, hi: {hi} }},")
    lines[-1] = lines[-1][:-1]
    lines.append("} as const;")
    return "\n".join(lines)


def format_stream_curve_template(stream_curve: StreamCurveFit) -> str:
    lines = ["export const STREAM_CURVE_TEMPLATE = {"]
    for field_name, values in (
        ("median", stream_curve.median),
        ("p25", stream_curve.p25),
        ("p75", stream_curve.p75),
    ):
        lines.append(f"  {field_name}: [")
        lines.extend(
            _format_ts_array(values, indent="  ", values_per_line=STREAM_CURVE_VALUES_PER_LINE)
        )
        lines.append("  ],")
    lines[-1] = lines[-1][:-1]
    lines.append("} as const;")
    return "\n".join(lines)


def build_marker_replacements(
    *,
    algo_bands: AlgoBandsFit,
    save_rate_bands: SaveRateBandsFit,
    stream_curve: StreamCurveFit,
) -> dict[str, str]:
    return {
        "SAVE_COUNT_BANDS": format_save_count_bands(algo_bands),
        "SAVE_RATE_BANDS": format_save_rate_bands(save_rate_bands),
        "STREAM_CURVE_TEMPLATE": format_stream_curve_template(stream_curve),
    }


def apply_marker_replacements(
    content: str,
    replacements: dict[str, str],
) -> str:
    lines, line_ending = _split_lines(content)
    trailing_newline = content.endswith(line_ending) if content else True
    regions = find_marker_regions(content)

    missing_replacements = sorted(set(regions) - set(replacements))
    if missing_replacements:
        raise ConstantsSyncError(
            "Missing replacement content for marker blocks: "
            + ", ".join(missing_replacements)
        )

    # Apply from bottom to top so line indices stay valid.
    for name in sorted(regions, key=lambda block: regions[block].start_line, reverse=True):
        region = regions[name]
        new_inner_lines = replacements[name].split("\n")
        lines[region.inner_start : region.inner_end] = new_inner_lines

    return _join_lines(lines, line_ending, trailing_newline=trailing_newline)


def read_constants(path: Path | None = None) -> str:
    constants_path = path or DEFAULT_CONSTANTS_PATH
    return constants_path.read_text(encoding="utf-8")


def write_constants(content: str, path: Path | None = None) -> None:
    constants_path = path or DEFAULT_CONSTANTS_PATH
    constants_path.write_text(content, encoding="utf-8", newline="")


def sync_constants(
    *,
    algo_bands: AlgoBandsFit,
    save_rate_bands: SaveRateBandsFit,
    stream_curve: StreamCurveFit,
    path: Path | None = None,
    dry_run: bool = False,
) -> str:
    constants_path = path or DEFAULT_CONSTANTS_PATH
    original = read_constants(constants_path)
    replacements = build_marker_replacements(
        algo_bands=algo_bands,
        save_rate_bands=save_rate_bands,
        stream_curve=stream_curve,
    )
    updated = apply_marker_replacements(original, replacements)
    if not dry_run and updated != original:
        write_constants(updated, constants_path)
    return updated
