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
from dataset import TrainingRow


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
    sample_size: int
    median: list[float]
    p25: list[float]
    p75: list[float]

    def to_coefficients_json(self) -> dict[str, list[float]]:
        return {
            "curve_median": list(self.median),
            "curve_p25": list(self.p25),
            "curve_p75": list(self.p75),
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


def derive_algo_bands(rows: list[TrainingRow]) -> AlgoBandsFit:
    """p25/p50/p75/p90 of wk1 saves by artist tier."""
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

    return AlgoBandsFit(sample_size=used_rows, bands=bands)


def derive_save_rate_bands(
    rows: list[TrainingRow],
    percentile_lo: float = 10.0,
    percentile_hi: float = 90.0,
) -> SaveRateBandsFit:
    """lo/hi per genre via p10/p90 of wk1 save rate (%)."""
    by_genre: dict[str, list[float]] = {genre: [] for genre in config.GENRES}

    for row in rows:
        if row.wk1_streams <= 0 or row.wk1_saves <= 0:
            continue
        rate = (row.wk1_saves / row.wk1_streams) * 100.0
        by_genre[row.genre].append(rate)

    bands: dict[str, dict[str, float]] = {}
    used_rows = 0
    for genre in config.GENRES:
        values = by_genre[genre]
        if len(values) < 1:
            raise ValueError(
                f"save_rate_bands requires at least 1 release with save rate for genre {genre}"
            )
        used_rows += len(values)
        bands[genre] = {
            "lo": _round_rate(_percentile(values, percentile_lo)),
            "hi": _round_rate(_percentile(values, percentile_hi)),
        }

    return SaveRateBandsFit(
        sample_size=used_rows,
        bands=bands,
        percentile_lo=percentile_lo,
        percentile_hi=percentile_hi,
    )


def derive_stream_curve(rows: list[TrainingRow]) -> StreamCurveFit:
    """
    median/p25/p75 of daily stream % of wk1 total (days 1–28).

    Per release: daily_pct = (streams_day / wk1_streams) * 100.
    """
    daily_samples: list[list[float]] = [
        [] for _ in range(config.STREAM_CURVE_DAY_END)
    ]
    used_rows = 0

    for row in rows:
        if row.wk1_streams <= 0:
            continue
        has_day = False
        for day in range(1, config.STREAM_CURVE_DAY_END + 1):
            streams = row.streams_by_day.get(day)
            if streams is None or streams < 0:
                continue
            daily_samples[day - 1].append((streams / row.wk1_streams) * 100.0)
            has_day = True
        if has_day:
            used_rows += 1

    median: list[float] = []
    p25: list[float] = []
    p75: list[float] = []
    for day_samples in daily_samples:
        if not day_samples:
            median.append(0.0)
            p25.append(0.0)
            p75.append(0.0)
            continue
        median.append(_round_rate(_percentile(day_samples, 50)))
        p25.append(_round_rate(_percentile(day_samples, 25)))
        p75.append(_round_rate(_percentile(day_samples, 75)))

    return StreamCurveFit(
        sample_size=used_rows,
        median=median,
        p25=p25,
        p75=p75,
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
        cells[(row.release_type, row.spotify_format, tier)].append(cps)

    matrix: dict[str, Any] = {}
    for release_type in config.RELEASE_TYPES:
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
) -> dict[str, Any]:
    """All non-regression model_coefficients payloads for this slice."""
    return {
        "algo_bands": derive_algo_bands(rows),
        "save_rate_bands": derive_save_rate_bands(rows),
        "stream_curve": derive_stream_curve(rows),
        "ad_rates": build_ad_rates(rows, active_ad_rates),
    }
