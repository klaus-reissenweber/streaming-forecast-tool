"""
OLS regression fitting and band derivations for the retrain script.

Regression: streams_d0–d7 and saves. Derived: algo_bands, save_rate_bands,
stream_curve, Spotify ad_rates (Meta copied from active row).

Output shapes match lib/forecast.ts and lib/constants.ts (see RETRAINING.md).
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

import numpy as np
import statsmodels.api as sm

import config
from dataset import (
    TrainingRow,
    editorial_day_number,
    iso_weekday_on_campaign_day,
    release_iso_weekday,
)


@dataclass(frozen=True)
class RegressionFit:
    """streams_d0 payload (matches lib/forecast.ts RegressionModel)."""

    intercept: float
    log_ml: float
    feat: float
    ed_tier: float
    rmse: float
    r2: float
    sample_size: int

    def to_coefficients_json(self) -> dict[str, float]:
        return {
            "intercept": self.intercept,
            "log_ml": self.log_ml,
            "feat": self.feat,
            "ed_tier": self.ed_tier,
            "rmse": self.rmse,
            "r2": self.r2,
        }


@dataclass(frozen=True)
class StreamsRefinementFit:
    """streams_d1…d7 payload (matches lib/forecast.ts RegressionModel + log_dN)."""

    refinement_day: int
    intercept: float
    log_d: float
    log_ml: float
    feat: float
    ed_tier: float
    rmse: float
    r2: float
    sample_size: int

    def to_coefficients_json(self) -> dict[str, float]:
        return {
            "intercept": self.intercept,
            f"log_d{self.refinement_day}": self.log_d,
            "log_ml": self.log_ml,
            "feat": self.feat,
            "ed_tier": self.ed_tier,
            "rmse": self.rmse,
            "r2": self.r2,
        }


@dataclass(frozen=True)
class SavesFit:
    """saves payload (matches lib/forecast.ts SavesModel)."""

    intercept: float
    log_ml: float
    feat: float
    ed_tier: float
    rmse: float
    r2: float
    genre_offset: dict[str, float]
    sample_size: int

    def to_coefficients_json(self) -> dict[str, Any]:
        return {
            "intercept": self.intercept,
            "log_ml": self.log_ml,
            "feat": self.feat,
            "ed_tier": self.ed_tier,
            "rmse": self.rmse,
            "r2": self.r2,
            "genre_offset": dict(self.genre_offset),
        }


@dataclass(frozen=True)
class AlgoBandsFit:
    sample_size: int
    bands: dict[str, dict[str, int]]

    def to_coefficients_json(self) -> dict[str, dict[str, int]]:
        return dict(self.bands)


@dataclass(frozen=True)
class SaveRateBandsFit:
    sample_size: int
    bands: dict[str, dict[str, float]]
    percentile_lo: float = 10.0
    percentile_hi: float = 90.0

    def to_coefficients_json(self) -> dict[str, dict[str, float]]:
        return dict(self.bands)


@dataclass(frozen=True)
class StreamCurveFit:
    """
    Weekday-aware stream curve components + composed-Thursday legacy view.

    Components sync to STREAM_DOW_MULTIPLIER / STREAM_EDITORIAL_KERNEL /
    STREAM_CURVE_TREND. Legacy curve_* is compose(Thursday) for reports/DB.
    """

    sample_size: int
    trend_median: list[float]
    trend_p25: list[float]
    trend_p75: list[float]
    # Mon…Sun multipliers (mean ≈ 1).
    dow_multiplier: list[float]
    editorial_kernel: list[float]
    # Composed Thursday (legacy STREAM_CURVE_TEMPLATE / curve_* shape).
    median: list[float]
    p25: list[float]
    p75: list[float]

    def to_coefficients_json(self) -> dict[str, Any]:
        return {
            "trend_median": list(self.trend_median),
            "trend_p25": list(self.trend_p25),
            "trend_p75": list(self.trend_p75),
            "dow_multiplier": list(self.dow_multiplier),
            "editorial_kernel": list(self.editorial_kernel),
            "curve_median": list(self.median),
            "curve_p25": list(self.p25),
            "curve_p75": list(self.p75),
        }


@dataclass(frozen=True)
class ReleaseTypeMagnitudeFit:
    """Per release_type magnitude vs single/lead reference (k-shrunk toward 1.0)."""

    sample_size: int
    multipliers: dict[str, float]
    raw_ratios: dict[str, float]
    counts: dict[str, int]
    shrinkage_k: int

    def to_coefficients_json(self) -> dict[str, Any]:
        return {
            "multipliers": dict(self.multipliers),
            "raw_ratios": dict(self.raw_ratios),
            "counts": dict(self.counts),
            "shrinkage_k": self.shrinkage_k,
        }


@dataclass(frozen=True)
class AdRatesFit:
    spotify_rates: dict[str, Any]
    meta_rates_by_genre: dict[str, float]
    meta_objective_multipliers: dict[str, float]
    meta_delivery_per_objective: dict[str, dict[str, float]]
    sample_size: int

    def to_coefficients_json(self) -> dict[str, Any]:
        return {
            "spotify_rates": self.spotify_rates,
            "meta_rates_by_genre": dict(self.meta_rates_by_genre),
            "meta_objective_multipliers": dict(self.meta_objective_multipliers),
            "meta_delivery_per_objective": {
                key: dict(value)
                for key, value in self.meta_delivery_per_objective.items()
            },
        }


def _feature_matrix(rows: list[TrainingRow]) -> tuple[np.ndarray, list[str]]:
    """Design matrix for shared stream/save predictors (no genre dummies)."""
    x = np.column_stack(
        [
            np.ones(len(rows)),
            np.log([row.monthly_listeners for row in rows]),
            np.array([1.0 if row.is_feature else 0.0 for row in rows]),
            np.array([float(row.editorial_tier) for row in rows]),
        ]
    )
    columns = ["intercept", "log_ml", "feat", "ed_tier"]
    return x, columns


def _refinement_feature_matrix(
    rows: list[TrainingRow],
    day: int,
) -> tuple[np.ndarray, list[str]]:
    x = np.column_stack(
        [
            np.ones(len(rows)),
            np.log([float(row.streams_by_day[day]) for row in rows]),
            np.log([row.monthly_listeners for row in rows]),
            np.array([1.0 if row.is_feature else 0.0 for row in rows]),
            np.array([float(row.editorial_tier) for row in rows]),
        ]
    )
    columns = ["intercept", f"log_d{day}", "log_ml", "feat", "ed_tier"]
    return x, columns


def _rmse(residuals: np.ndarray) -> float:
    if len(residuals) == 0:
        return float("nan")
    return float(math.sqrt(np.mean(np.square(residuals))))


def _percentile(values: list[float], percentile: float) -> float:
    return float(np.percentile(np.array(values, dtype=float), percentile))


def _round_percentile_count(value: float) -> int:
    return int(round(value))


def _round_rate(value: float) -> float:
    return float(round(value, 1))


def _saves_feature_matrix(
    rows: list[TrainingRow],
) -> tuple[np.ndarray, list[str]]:
    x_base, base_columns = _feature_matrix(rows)
    dummy_columns: list[str] = []
    dummy_data: list[list[float]] = []
    for genre in config.GENRES:
        if genre == config.SAVES_REFERENCE_GENRE:
            continue
        dummy_columns.append(f"genre_{genre}")
        dummy_data.append(
            [1.0 if row.genre == genre else 0.0 for row in rows]
        )
    if dummy_data:
        x = np.column_stack([x_base, np.array(dummy_data).T])
        columns = base_columns + dummy_columns
    else:
        x = x_base
        columns = base_columns
    return x, columns


def regression_sample_rows(
    model_type: str,
    rows: list[TrainingRow],
) -> list[TrainingRow]:
    """Rows used to fit a given regression model_type."""
    if model_type == "streams_d0":
        return [row for row in rows if row.wk1_streams > 0]
    if model_type == "saves":
        return [row for row in rows if row.wk1_saves > 0]
    if model_type.startswith("streams_d"):
        day = int(model_type.removeprefix("streams_d"))
        if day == 0:
            return [row for row in rows if row.wk1_streams > 0]
        return [row for row in rows if row.streams_by_day.get(day, 0) > 0]
    raise ValueError(f"Unknown regression model_type: {model_type}")


def ols_for_regression_model(
    model_type: str,
    rows: list[TrainingRow],
) -> tuple[list[TrainingRow], Any]:
    """
    Fit statsmodels OLS for guardrails (Cook's distance, influence).

    Returns (sample_rows, RegressionResults).
    """
    sample = regression_sample_rows(model_type, rows)
    if len(sample) < 2:
        raise ValueError(
            f"{model_type} requires at least 2 training rows, got {len(sample)}"
        )

    if model_type == "streams_d0":
        y = np.log(np.array([row.wk1_streams for row in sample], dtype=float))
        x, _columns = _feature_matrix(sample)
    elif model_type == "saves":
        y = np.log(np.array([row.wk1_saves for row in sample], dtype=float))
        x, _columns = _saves_feature_matrix(sample)
    elif model_type.startswith("streams_d"):
        day = int(model_type.removeprefix("streams_d"))
        y = np.log(np.array([row.wk1_streams for row in sample], dtype=float))
        x, _columns = _refinement_feature_matrix(sample, day)
    else:
        raise ValueError(f"Unknown regression model_type: {model_type}")

    return sample, sm.OLS(y, x).fit()


def fit_all_regression_models(
    rows: list[TrainingRow],
) -> dict[str, RegressionFit | StreamsRefinementFit | SavesFit]:
    """All nine regression payloads (streams_d0–d7 + saves)."""
    models: dict[str, RegressionFit | StreamsRefinementFit | SavesFit] = dict(
        fit_all_streams_models(rows)
    )
    models["saves"] = fit_saves(rows)
    return models


def fit_streams_d0(rows: list[TrainingRow]) -> RegressionFit:
    """
    log(wk1_streams) ~ log(ML) + feat + ed_tier

    Requires wk1_streams > 0 for every row (caller's responsibility).
    """
    if len(rows) < 2:
        raise ValueError("streams_d0 requires at least 2 training rows")

    y = np.log(np.array([row.wk1_streams for row in rows], dtype=float))
    x, columns = _feature_matrix(rows)
    result = sm.OLS(y, x).fit()

    coefficients = dict(zip(columns, result.params, strict=True))
    return RegressionFit(
        intercept=float(coefficients["intercept"]),
        log_ml=float(coefficients["log_ml"]),
        feat=float(coefficients["feat"]),
        ed_tier=float(coefficients["ed_tier"]),
        rmse=_rmse(result.resid),
        r2=float(result.rsquared),
        sample_size=len(rows),
    )


def fit_streams_refinement(rows: list[TrainingRow], day: int) -> StreamsRefinementFit:
    """
    log(wk1_streams) ~ log(d_N) + log(ML) + feat + ed_tier

    Fit on subset where day N streams > 0.
    """
    if day < 1 or day > config.WK1_DAY_END:
        raise ValueError(f"refinement day must be 1–{config.WK1_DAY_END}, got {day}")

    eligible = [row for row in rows if row.streams_by_day.get(day, 0) > 0]
    if len(eligible) < 2:
        raise ValueError(
            f"streams_d{day} requires at least 2 training rows with day {day} streams > 0"
        )

    y = np.log(np.array([row.wk1_streams for row in eligible], dtype=float))
    x, columns = _refinement_feature_matrix(eligible, day)
    result = sm.OLS(y, x).fit()

    coefficients = dict(zip(columns, result.params, strict=True))
    return StreamsRefinementFit(
        refinement_day=day,
        intercept=float(coefficients["intercept"]),
        log_d=float(coefficients[f"log_d{day}"]),
        log_ml=float(coefficients["log_ml"]),
        feat=float(coefficients["feat"]),
        ed_tier=float(coefficients["ed_tier"]),
        rmse=_rmse(result.resid),
        r2=float(result.rsquared),
        sample_size=len(eligible),
    )


def fit_all_streams_models(
    rows: list[TrainingRow],
) -> dict[str, RegressionFit | StreamsRefinementFit]:
    models: dict[str, RegressionFit | StreamsRefinementFit] = {
        "streams_d0": fit_streams_d0(rows),
    }
    for day in range(1, config.WK1_DAY_END + 1):
        models[f"streams_d{day}"] = fit_streams_refinement(rows, day)
    return models


def fit_saves(rows: list[TrainingRow]) -> SavesFit:
    """
    log(wk1_saves) ~ log(ML) + feat + ed_tier + genre_dummies

    Reference genre: house (genre_offset.house = 0).
    """
    eligible = [row for row in rows if row.wk1_saves > 0]
    if len(eligible) < 2:
        raise ValueError("saves requires at least 2 training rows with wk1_saves > 0")

    y = np.log(np.array([row.wk1_saves for row in eligible], dtype=float))
    x, columns = _saves_feature_matrix(eligible)

    result = sm.OLS(y, x).fit()
    coefficients = dict(zip(columns, result.params, strict=True))

    genre_offset: dict[str, float] = {config.SAVES_REFERENCE_GENRE: 0.0}
    for genre in config.GENRES:
        if genre == config.SAVES_REFERENCE_GENRE:
            continue
        genre_offset[genre] = float(coefficients[f"genre_{genre}"])

    return SavesFit(
        intercept=float(coefficients["intercept"]),
        log_ml=float(coefficients["log_ml"]),
        feat=float(coefficients["feat"]),
        ed_tier=float(coefficients["ed_tier"]),
        rmse=_rmse(result.resid),
        r2=float(result.rsquared),
        genre_offset=genre_offset,
        sample_size=len(eligible),
    )


def _isotonic_nondecreasing(values: list[float]) -> list[float]:
    """Pool-adjacent-violators: enforce non-decreasing sequence."""
    if not values:
        return []
    n = len(values)
    # Block representation: (sum, count) for each pooled block.
    sums: list[float] = []
    counts: list[int] = []
    for value in values:
        sums.append(float(value))
        counts.append(1)
        while len(sums) >= 2 and sums[-2] / counts[-2] > sums[-1] / counts[-1]:
            sums[-2] += sums[-1]
            counts[-2] += counts[-1]
            sums.pop()
            counts.pop()
    result: list[float] = []
    for total, count in zip(sums, counts, strict=True):
        mean = total / count
        result.extend([mean] * count)
    if len(result) != n:
        raise RuntimeError("isotonic regression length mismatch")
    return result


def _enforce_tier_monotonicity(
    bands: dict[str, dict[str, int]],
) -> dict[str, dict[str, int]]:
    """
    Enforce developing ≤ mid ≤ established at each percentile, then
    re-assert p25 ≤ p50 ≤ p75 ≤ p90 within each tier.
    """
    percentile_keys = ("p25", "p50", "p75", "p90")
    adjusted = {
        tier: dict(bands[tier]) for tier in config.ARTIST_TIERS
    }
    for key in percentile_keys:
        raw = [float(adjusted[tier][key]) for tier in config.ARTIST_TIERS]
        mono = _isotonic_nondecreasing(raw)
        for tier, value in zip(config.ARTIST_TIERS, mono, strict=True):
            adjusted[tier][key] = _round_percentile_count(value)

    for tier in config.ARTIST_TIERS:
        ordered = _isotonic_nondecreasing(
            [float(adjusted[tier][key]) for key in percentile_keys]
        )
        for key, value in zip(percentile_keys, ordered, strict=True):
            adjusted[tier][key] = _round_percentile_count(value)
    return adjusted


def derive_algo_bands(rows: list[TrainingRow]) -> AlgoBandsFit:
    """
    p25/p50/p75/p90 of wk1 saves by artist tier.

    Fit on the provided rows as-is (caller should pass the full eligible
    set — not the Cook's D regression filter). Enforces tier monotonicity.
    """
    by_tier: dict[str, list[float]] = {tier: [] for tier in config.ARTIST_TIERS}

    for row in rows:
        if row.wk1_saves <= 0:
            continue
        tier = config.artist_tier_from_monthly_listeners(row.monthly_listeners)
        by_tier[tier].append(float(row.wk1_saves))

    bands: dict[str, dict[str, int]] = {}
    used_rows = 0
    for tier in config.ARTIST_TIERS:
        values = by_tier[tier]
        if len(values) < 1:
            raise ValueError(f"algo_bands requires at least 1 release with saves for tier {tier}")
        used_rows += len(values)
        bands[tier] = {
            "p25": _round_percentile_count(_percentile(values, 25)),
            "p50": _round_percentile_count(_percentile(values, 50)),
            "p75": _round_percentile_count(_percentile(values, 75)),
            "p90": _round_percentile_count(_percentile(values, 90)),
        }

    bands = _enforce_tier_monotonicity(bands)
    return AlgoBandsFit(sample_size=used_rows, bands=bands)


def _shrink_toward_prior(empirical: float, n: int, prior: float, k: int) -> float:
    """Empirical Bayes: (n * empirical + k * prior) / (n + k)."""
    if n <= 0:
        return prior
    return (n * empirical + k * prior) / (n + k)


def derive_save_rate_bands(
    rows: list[TrainingRow],
    percentile_lo: float = 10.0,
    percentile_hi: float = 90.0,
    *,
    min_sample: int = config.SAVE_RATE_BANDS_MIN_SAMPLE,
    shrinkage_k: int = config.SAVE_RATE_BANDS_SHRINKAGE_K,
) -> SaveRateBandsFit:
    """
    lo/hi per genre via p10/p90 of wk1 save rate (%), shrunk toward catalog prior.

    Genres with n < min_sample use n=0 weight on the empirical (full prior);
    all genres still get k-shrinkage. Caller should pass the full eligible set.
    """
    by_genre: dict[str, list[float]] = {genre: [] for genre in config.GENRES}

    for row in rows:
        if row.wk1_streams <= 0 or row.wk1_saves <= 0:
            continue
        if row.genre not in by_genre:
            continue
        rate = (row.wk1_saves / row.wk1_streams) * 100.0
        by_genre[row.genre].append(rate)

    all_rates = [rate for values in by_genre.values() for rate in values]
    if all_rates:
        prior_lo = float(np.percentile(all_rates, percentile_lo))
        prior_hi = float(np.percentile(all_rates, percentile_hi))
    else:
        seed_los = [band["lo"] for band in config.SAVE_RATE_BANDS_SEED_PRIOR.values()]
        seed_his = [band["hi"] for band in config.SAVE_RATE_BANDS_SEED_PRIOR.values()]
        prior_lo = float(np.median(seed_los))
        prior_hi = float(np.median(seed_his))

    bands: dict[str, dict[str, float]] = {}
    used_rows = 0
    for genre in config.GENRES:
        values = by_genre[genre]
        n = len(values)
        used_rows += n
        seed = config.SAVE_RATE_BANDS_SEED_PRIOR.get(genre, {"lo": prior_lo, "hi": prior_hi})
        genre_prior_lo = prior_lo if all_rates else float(seed["lo"])
        genre_prior_hi = prior_hi if all_rates else float(seed["hi"])

        if n >= 1:
            empirical_lo = float(np.percentile(values, percentile_lo))
            empirical_hi = float(np.percentile(values, percentile_hi))
        else:
            empirical_lo = genre_prior_lo
            empirical_hi = genre_prior_hi

        # Below min_sample: ignore empirical (n_eff=0); else k-shrink.
        n_eff = 0 if n < min_sample else n
        lo = _shrink_toward_prior(empirical_lo, n_eff, genre_prior_lo, shrinkage_k)
        hi = _shrink_toward_prior(empirical_hi, n_eff, genre_prior_hi, shrinkage_k)
        if hi < lo:
            lo, hi = hi, lo
        bands[genre] = {
            "lo": _round_rate(lo),
            "hi": _round_rate(hi),
        }

    return SaveRateBandsFit(
        sample_size=used_rows,
        bands=bands,
        percentile_lo=percentile_lo,
        percentile_hi=percentile_hi,
    )


def _curve_eligible_rows(rows: list[TrainingRow]) -> list[TrainingRow]:
    """Rows with positive wk1 streams and a parsable release_date."""
    eligible: list[TrainingRow] = []
    for row in rows:
        if row.wk1_streams <= 0:
            continue
        if row.release_date is None:
            continue
        eligible.append(row)
    return eligible


def _daily_pct(row: TrainingRow, day: int) -> float | None:
    streams = row.streams_by_day.get(day)
    if streams is None or streams < 0:
        return None
    return (streams / row.wk1_streams) * 100.0


def _round_dow(value: float) -> float:
    return float(round(value, 3))


def _round_kernel(value: float) -> float:
    return float(round(value, 2))


def _neighbor_interpolate(values: list[float | None]) -> list[float]:
    """Fill None gaps by linear interpolation between nearest defined neighbors."""
    n = len(values)
    if n == 0:
        return []

    defined = [index for index, value in enumerate(values) if value is not None]
    if not defined:
        return [0.0] * n
    if len(defined) == 1:
        fill = float(values[defined[0]])  # type: ignore[arg-type]
        return [fill] * n

    result = [0.0] * n
    for index, value in enumerate(values):
        if value is not None:
            result[index] = float(value)
            continue

        left = None
        for candidate in reversed(defined):
            if candidate < index:
                left = candidate
                break
        right = None
        for candidate in defined:
            if candidate > index:
                right = candidate
                break

        if left is None:
            result[index] = float(values[right])  # type: ignore[arg-type, index]
        elif right is None:
            result[index] = float(values[left])  # type: ignore[arg-type]
        else:
            left_val = float(values[left])  # type: ignore[arg-type]
            right_val = float(values[right])  # type: ignore[arg-type]
            span = right - left
            weight = (index - left) / span
            result[index] = left_val + weight * (right_val - left_val)

    return result


def compose_stream_curve_pct(
    trend: list[float],
    dow_multiplier: list[float],
    editorial_kernel: list[float],
    *,
    release_iso: int,
    editorial_offset: int,
    rescale_wk1: bool = True,
) -> list[float]:
    """
    Python twin of lib/forecast.ts composeStreamCurvePct (no constants import).

    dow_multiplier is Mon…Sun (index 0 = Mon).
    """
    if len(dow_multiplier) != 7:
        raise ValueError("dow_multiplier must have 7 values (Mon…Sun)")

    composed: list[float] = []
    for index, trend_pct in enumerate(trend):
        day_number = index + 1
        iso = iso_weekday_on_campaign_day(release_iso, day_number)
        dow = dow_multiplier[iso - 1]
        kernel_index = day_number - editorial_offset
        editorial = (
            editorial_kernel[kernel_index]
            if 0 <= kernel_index < len(editorial_kernel)
            else 0.0
        )
        composed.append(trend_pct * dow + editorial)

    if not rescale_wk1:
        return composed

    week1_sum = sum(composed[: config.WK1_DAY_END])
    if week1_sum <= 0:
        return composed
    scale = 100.0 / week1_sum
    return [
        pct * scale if index < config.WK1_DAY_END else pct
        for index, pct in enumerate(composed)
    ]


def derive_dow_multiplier(rows: list[TrainingRow]) -> list[float]:
    """
    Steady-state (d ≥ 8) streams / mean_ss, bucketed by calendar ISO weekday.

    Returns Mon…Sun multipliers renormalized to mean 1.0.
    """
    by_iso: dict[int, list[float]] = {iso: [] for iso in range(1, 8)}

    for row in rows:
        assert row.release_date is not None
        release_iso = release_iso_weekday(row.release_date)
        steady: list[tuple[int, float]] = []
        for day in range(
            config.DOW_STEADY_STATE_DAY_START,
            config.STREAM_CURVE_DAY_END + 1,
        ):
            streams = row.streams_by_day.get(day)
            if streams is None or streams < 0:
                continue
            steady.append((day, float(streams)))
        if not steady:
            continue
        mean_ss = sum(value for _day, value in steady) / len(steady)
        if mean_ss <= 0:
            continue
        for day, streams in steady:
            iso = iso_weekday_on_campaign_day(release_iso, day)
            by_iso[iso].append(streams / mean_ss)

    medians: list[float] = []
    for iso in range(1, 8):
        samples = by_iso[iso]
        if not samples:
            medians.append(1.0)
        else:
            medians.append(float(np.median(samples)))

    mean_median = sum(medians) / 7.0
    if mean_median <= 0:
        return [1.0] * 7
    return [_round_dow(value / mean_median) for value in medians]


def derive_editorial_kernel(
    rows: list[TrainingRow],
    dow_multiplier: list[float],
    *,
    kernel_k: int = config.EDITORIAL_KERNEL_K,
) -> list[float]:
    """
    Median additive excess over provisional seasonless trend × DOW.

    Provisional trend excludes each release's editorial window; gaps are
    neighbor-interpolated.
    """
    if kernel_k < 1:
        raise ValueError(f"kernel_k must be >= 1, got {kernel_k}")

    # Provisional seasonless trend by day-since-release, excluding editorial days.
    seasonless_samples: list[list[float]] = [
        [] for _ in range(config.STREAM_CURVE_DAY_END)
    ]
    for row in rows:
        assert row.release_date is not None
        release_iso = release_iso_weekday(row.release_date)
        offset = editorial_day_number(row.release_date)
        for day in range(1, config.STREAM_CURVE_DAY_END + 1):
            if offset <= day < offset + kernel_k:
                continue
            y = _daily_pct(row, day)
            if y is None:
                continue
            iso = iso_weekday_on_campaign_day(release_iso, day)
            dow = dow_multiplier[iso - 1]
            if dow <= 0:
                continue
            seasonless_samples[day - 1].append(y / dow)

    provisional_raw: list[float | None] = [
        float(np.median(samples)) if samples else None
        for samples in seasonless_samples
    ]
    trend_proxy = _neighbor_interpolate(provisional_raw)

    excess_by_k: list[list[float]] = [[] for _ in range(kernel_k)]
    for row in rows:
        assert row.release_date is not None
        release_iso = release_iso_weekday(row.release_date)
        offset = editorial_day_number(row.release_date)
        for k in range(kernel_k):
            day = offset + k
            if day < 1 or day > config.STREAM_CURVE_DAY_END:
                continue
            y = _daily_pct(row, day)
            if y is None:
                continue
            iso = iso_weekday_on_campaign_day(release_iso, day)
            dow = dow_multiplier[iso - 1]
            excess = y - trend_proxy[day - 1] * dow
            excess_by_k[k].append(excess)

    kernel: list[float] = []
    for samples in excess_by_k:
        if not samples:
            kernel.append(0.0)
            continue
        kernel.append(max(0.0, _round_kernel(float(np.median(samples)))))
    return kernel


def derive_stream_curve_trend(
    rows: list[TrainingRow],
    dow_multiplier: list[float],
    editorial_kernel: list[float],
) -> tuple[list[float], list[float], list[float]]:
    """Invert compose per release; aggregate median/p25/p75 by day-since-release."""
    daily_samples: list[list[float]] = [
        [] for _ in range(config.STREAM_CURVE_DAY_END)
    ]

    for row in rows:
        assert row.release_date is not None
        release_iso = release_iso_weekday(row.release_date)
        offset = editorial_day_number(row.release_date)
        for day in range(1, config.STREAM_CURVE_DAY_END + 1):
            y = _daily_pct(row, day)
            if y is None:
                continue
            iso = iso_weekday_on_campaign_day(release_iso, day)
            dow = dow_multiplier[iso - 1]
            if dow <= 0:
                continue
            kernel_index = day - offset
            kernel_contrib = (
                editorial_kernel[kernel_index]
                if 0 <= kernel_index < len(editorial_kernel)
                else 0.0
            )
            daily_samples[day - 1].append((y - kernel_contrib) / dow)

    median: list[float] = []
    p25: list[float] = []
    p75: list[float] = []
    for day_samples in daily_samples:
        if not day_samples:
            # Placeholder — filled by trailing carry-forward below.
            median.append(float("nan"))
            p25.append(float("nan"))
            p75.append(float("nan"))
            continue
        median.append(_round_rate(_percentile(day_samples, 50)))
        p25.append(_round_rate(_percentile(day_samples, 25)))
        p75.append(_round_rate(_percentile(day_samples, 75)))

    # Sparse late days (often d26–d28): carry forward last observed value
    # (same convention as the old d28 = d27 seed carry).
    return (
        _carry_forward_tail(median),
        _carry_forward_tail(p25),
        _carry_forward_tail(p75),
    )


def _carry_forward_tail(values: list[float]) -> list[float]:
    """Replace leading/trailing NaN gaps by nearest prior defined value."""
    if not values:
        return values
    result = list(values)
    last: float | None = None
    for index, value in enumerate(result):
        if value == value:  # not NaN
            last = value
            continue
        if last is not None:
            result[index] = last
    # Leading NaNs (no prior): fill from first defined, else 0.
    first = next((value for value in result if value == value), 0.0)
    for index, value in enumerate(result):
        if value != value:  # NaN
            result[index] = first
    return result


def derive_stream_curve(rows: list[TrainingRow]) -> StreamCurveFit:
    """
    Weekday-aware fit: DOW → editorial kernel → seasonless trend.

    Also stores compose(Thursday) as legacy curve_median/p25/p75.
    """
    eligible = _curve_eligible_rows(rows)
    if not eligible:
        zeros = [0.0] * config.STREAM_CURVE_DAY_END
        ones = [1.0] * 7
        return StreamCurveFit(
            sample_size=0,
            trend_median=list(zeros),
            trend_p25=list(zeros),
            trend_p75=list(zeros),
            dow_multiplier=ones,
            editorial_kernel=[0.0] * config.EDITORIAL_KERNEL_K,
            median=list(zeros),
            p25=list(zeros),
            p75=list(zeros),
        )

    dow = derive_dow_multiplier(eligible)
    kernel = derive_editorial_kernel(eligible, dow)
    trend_median, trend_p25, trend_p75 = derive_stream_curve_trend(
        eligible, dow, kernel
    )

    thu_offset = editorial_day_number(
        # Any Thursday: editorial Friday is campaign day 2.
        "2026-05-28"
    )
    assert thu_offset == 2
    curve_median = [
        _round_rate(value)
        for value in compose_stream_curve_pct(
            trend_median,
            dow,
            kernel,
            release_iso=config.THURSDAY_ISO_WEEKDAY,
            editorial_offset=thu_offset,
        )
    ]
    curve_p25 = [
        _round_rate(value)
        for value in compose_stream_curve_pct(
            trend_p25,
            dow,
            kernel,
            release_iso=config.THURSDAY_ISO_WEEKDAY,
            editorial_offset=thu_offset,
        )
    ]
    curve_p75 = [
        _round_rate(value)
        for value in compose_stream_curve_pct(
            trend_p75,
            dow,
            kernel,
            release_iso=config.THURSDAY_ISO_WEEKDAY,
            editorial_offset=thu_offset,
        )
    ]

    return StreamCurveFit(
        sample_size=len(eligible),
        trend_median=trend_median,
        trend_p25=trend_p25,
        trend_p75=trend_p75,
        dow_multiplier=dow,
        editorial_kernel=kernel,
        median=curve_median,
        p25=curve_p25,
        p75=curve_p75,
    )


def _shrink_toward_one(raw: float, n: int, k: int) -> float:
    """Empirical Bayes: (n * raw + k * 1.0) / (n + k)."""
    return (n * raw + k * 1.0) / (n + k)


def derive_release_type_magnitude_multipliers(
    rows: list[TrainingRow],
    *,
    shrinkage_k: int = config.RELEASE_TYPE_MAGNITUDE_SHRINKAGE_K,
) -> ReleaseTypeMagnitudeFit:
    """
    Per-type median of (actual_wk1 / locked_forecast_streams), relative to the
    single∪lead_single reference median, then k-shrink toward 1.0.

    Reference types are pinned to 1.0. Types with no rows shrink fully to 1.0.
    Sync target: lib/constants.ts RELEASE_TYPE_MAGNITUDE_MULTIPLIER.
    """
    by_type: dict[str, list[float]] = {rt: [] for rt in config.RELEASE_TYPES}
    for row in rows:
        if row.wk1_streams <= 0 or row.locked_forecast_streams <= 0:
            continue
        if row.release_type not in by_type:
            continue
        # Forecast-normalized residual: actual wk1 / locked forecast.
        by_type[row.release_type].append(
            float(row.wk1_streams) / float(row.locked_forecast_streams)
        )

    reference_values: list[float] = []
    for rt in config.RELEASE_TYPE_MAGNITUDE_REFERENCE_TYPES:
        reference_values.extend(by_type[rt])

    if not reference_values:
        # No reference yet — emit identity multipliers (seed / cold start).
        multipliers = {rt: 1.0 for rt in config.RELEASE_TYPES}
        return ReleaseTypeMagnitudeFit(
            sample_size=0,
            multipliers=multipliers,
            raw_ratios={rt: 1.0 for rt in config.RELEASE_TYPES},
            counts={rt: len(by_type[rt]) for rt in config.RELEASE_TYPES},
            shrinkage_k=shrinkage_k,
        )

    ref_median = float(np.median(reference_values))
    if ref_median <= 0:
        raise ValueError("release_type magnitude reference median must be > 0")

    raw_ratios: dict[str, float] = {}
    multipliers: dict[str, float] = {}
    counts: dict[str, int] = {}
    used = 0

    for rt in config.RELEASE_TYPES:
        values = by_type[rt]
        n = len(values)
        counts[rt] = n
        used += n

        if rt in config.RELEASE_TYPE_MAGNITUDE_REFERENCE_TYPES:
            raw_ratios[rt] = 1.0
            multipliers[rt] = 1.0
            continue

        if n == 0 or ref_median <= 0:
            raw = 1.0
        else:
            raw = float(np.median(values)) / ref_median
        raw_ratios[rt] = raw
        multipliers[rt] = round(_shrink_toward_one(raw, n, shrinkage_k), 2)

    return ReleaseTypeMagnitudeFit(
        sample_size=used,
        multipliers=multipliers,
        raw_ratios=raw_ratios,
        counts=counts,
        shrinkage_k=shrinkage_k,
    )


def derive_spotify_rates(rows: list[TrainingRow]) -> dict[str, Any]:
    """
    CPS = spotify_spend_planned / wk1_streams, median by
    (release_type, spotify_format, tier) where spend > 0.
    """
    cells: dict[tuple[str, str, str], list[float]] = defaultdict(list)

    for row in rows:
        if row.spotify_spend_planned <= 0 or row.wk1_streams <= 0:
            continue
        tier = config.artist_tier_from_monthly_listeners(row.monthly_listeners)
        cps = row.spotify_spend_planned / row.wk1_streams
        # Catalog release_type does not drive CPS yet — always bucket as single.
        cells[("single", row.spotify_format, tier)].append(cps)

    matrix: dict[str, Any] = {}
    for release_type in config.SPOTIFY_CPS_RELEASE_TYPES:
        matrix[release_type] = {}
        for spotify_format in config.SPOTIFY_FORMATS:
            matrix[release_type][spotify_format] = {}
            for tier in config.ARTIST_TIERS:
                values = cells.get((release_type, spotify_format, tier), [])
                matrix[release_type][spotify_format][tier] = (
                    float(np.median(values)) if values else None
                )

    return matrix


def build_ad_rates(
    rows: list[TrainingRow],
    active_ad_rates: dict[str, Any],
) -> AdRatesFit:
    """
    Recompute Spotify CPS matrix; copy Meta fields unchanged from active row.
    """
    spotify_rates = derive_spotify_rates(rows)

    meta_rates = active_ad_rates.get("meta_rates_by_genre")
    meta_multipliers = active_ad_rates.get("meta_objective_multipliers")
    meta_delivery = active_ad_rates.get("meta_delivery_per_objective")

    if not isinstance(meta_rates, dict):
        raise ValueError("active_ad_rates.meta_rates_by_genre must be a dict")
    if not isinstance(meta_multipliers, dict):
        raise ValueError("active_ad_rates.meta_objective_multipliers must be a dict")
    if not isinstance(meta_delivery, dict):
        raise ValueError("active_ad_rates.meta_delivery_per_objective must be a dict")

    spend_rows = sum(
        1 for row in rows if row.spotify_spend_planned > 0 and row.wk1_streams > 0
    )

    return AdRatesFit(
        spotify_rates=spotify_rates,
        meta_rates_by_genre={str(k): float(v) for k, v in meta_rates.items()},
        meta_objective_multipliers={
            str(k): float(v) for k, v in meta_multipliers.items()
        },
        meta_delivery_per_objective={
            str(k): {str(m): float(v) for m, v in values.items()}
            for k, values in meta_delivery.items()
        },
        sample_size=spend_rows,
    )


def fit_streams_d0_and_saves(rows: list[TrainingRow]) -> tuple[RegressionFit, SavesFit]:
    """Convenience wrapper for the initial two-model slice."""
    return fit_streams_d0(rows), fit_saves(rows)


def fit_all_derived_models(
    rows: list[TrainingRow],
    active_ad_rates: dict[str, Any],
    *,
    band_rows: list[TrainingRow] | None = None,
) -> dict[str, Any]:
    """
    All non-regression model_coefficients payloads for this slice.

    Save-count / save-rate bands always use `band_rows` when provided so they
    can be decoupled from the Cook's D regression filter (`rows`).
    """
    bands_source = band_rows if band_rows is not None else rows
    return {
        "algo_bands": derive_algo_bands(bands_source),
        "save_rate_bands": derive_save_rate_bands(bands_source),
        "stream_curve": derive_stream_curve(rows),
        "ad_rates": build_ad_rates(rows, active_ad_rates),
        # Sync-only (not promoted to model_coefficients): see constants_sync.py.
        "release_type_magnitude": derive_release_type_magnitude_multipliers(rows),
    }
