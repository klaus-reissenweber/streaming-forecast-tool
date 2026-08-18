"""
Supabase read/write for model_coefficients (see RETRAINING.md).

Uses SUPABASE_SERVICE_ROLE_KEY only — never the anon key.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from supabase import Client, create_client

import config
from fit import (
    AdRatesFit,
    AlgoBandsFit,
    RegressionFit,
    SaveRateBandsFit,
    SavesFit,
    StreamBandsFit,
    StreamCurveFit,
    StreamsRefinementFit,
)

MODEL_COEFFICIENTS_TABLE = "model_coefficients"
SELECT_COLUMNS = (
    "id, model_type, coefficients_json, r_squared, sample_size, fitted_at, is_active"
)

RegressionModel = RegressionFit | StreamsRefinementFit | SavesFit
DerivedModel = (
    AlgoBandsFit | SaveRateBandsFit | StreamBandsFit | StreamCurveFit | AdRatesFit
)


class DbError(Exception):
    """Base error for model_coefficients DB operations."""


class ActiveRowIntegrityError(DbError):
    """Active-row counts are not exactly one per model_type."""


class PromotionError(DbError):
    """Promotion demote/promote sequence failed mid-batch."""


@dataclass(frozen=True)
class ModelCoefficientRecord:
    id: str
    model_type: str
    coefficients_json: dict[str, Any]
    r_squared: float | None
    sample_size: int
    fitted_at: str
    is_active: bool

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> ModelCoefficientRecord:
        r_squared = row.get("r_squared")
        return cls(
            id=str(row["id"]),
            model_type=str(row["model_type"]),
            coefficients_json=dict(row["coefficients_json"]),
            r_squared=float(r_squared) if r_squared is not None else None,
            sample_size=int(row["sample_size"]),
            fitted_at=str(row["fitted_at"]),
            is_active=bool(row["is_active"]),
        )


@dataclass(frozen=True)
class ActiveModelSnapshot:
    by_type: dict[str, ModelCoefficientRecord]

    def require(self, model_type: str) -> ModelCoefficientRecord:
        record = self.by_type.get(model_type)
        if record is None:
            raise DbError(f"Missing active model_coefficients row: {model_type}")
        return record


@dataclass(frozen=True)
class InsertRecord:
    model_type: str
    coefficients_json: dict[str, Any]
    r_squared: float | None
    sample_size: int
    fitted_at: str
    is_active: bool = False

    def to_insert_dict(self) -> dict[str, Any]:
        return {
            "model_type": self.model_type,
            "coefficients_json": self.coefficients_json,
            "r_squared": self.r_squared,
            "sample_size": self.sample_size,
            "fitted_at": self.fitted_at,
            "is_active": self.is_active,
        }


@dataclass(frozen=True)
class InsertedModelBatch:
    ids_by_type: dict[str, str]
    records_by_type: dict[str, ModelCoefficientRecord]
    fitted_at: str


def get_db_client() -> Client:
    return create_client(
        config.get_supabase_url(),
        config.get_supabase_service_role_key(),
    )


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _integrity_recovery_message(model_type: str, count: int) -> str:
    if count == 0:
        return (
            f"model_type '{model_type}' has 0 active rows (expected exactly 1). "
            "Resolve in Supabase Table Editor: filter by this model_type, sort by "
            "fitted_at descending, and set is_active=true on the most recent row. "
            "Then re-run the retrain script with --dry-run to verify integrity "
            "before promoting."
        )
    return (
        f"model_type '{model_type}' has {count} active rows (expected exactly 1). "
        "Resolve in Supabase Table Editor: set is_active=false on duplicate rows, "
        "leaving exactly one active row (prefer the most recent fitted_at). "
        "Then re-run the retrain script with --dry-run to verify integrity "
        "before promoting."
    )


def _promotion_recovery_message(
    *,
    failed_model_type: str,
    completed_types: list[str],
    new_id: str,
    previous_active_id: str | None,
) -> str:
    completed = ", ".join(completed_types) if completed_types else "(none)"
    rollback = (
        f"To rollback: set is_active=true on row id={previous_active_id}, "
        f"set is_active=false on row id={new_id}."
        if previous_active_id
        else f"To rollback: set is_active=false on row id={new_id} and restore the "
        "previous active row for this model_type."
    )
    return (
        f"Promotion failed at model_type '{failed_model_type}'. "
        f"Completed types: {completed}. "
        f"Failed type '{failed_model_type}' may now have 0 active rows. "
        f"To complete promotion: set is_active=true on row id={new_id}. "
        f"{rollback} "
        "Then audit all model types via the integrity check before re-running."
    )


def fetch_active_rows(client: Client) -> list[ModelCoefficientRecord]:
    response = (
        client.table(MODEL_COEFFICIENTS_TABLE)
        .select(SELECT_COLUMNS)
        .eq("is_active", True)
        .execute()
    )
    if response.data is None:
        raise DbError("model_coefficients active fetch returned no data payload")

    return [ModelCoefficientRecord.from_row(row) for row in response.data]


def load_active_snapshot(client: Client) -> ActiveModelSnapshot:
    rows = fetch_active_rows(client)
    by_type = {row.model_type: row for row in rows}

    for model_type in config.ALL_MODEL_TYPES:
        record = by_type.get(model_type)
        if record is None:
            raise DbError(f"Missing active model_coefficients row: {model_type}")
        _validate_coefficients_json(model_type, record.coefficients_json)

    return ActiveModelSnapshot(by_type=by_type)


def load_active_r2(client: Client) -> dict[str, float]:
    snapshot = load_active_snapshot(client)
    active_r2: dict[str, float] = {}

    for model_type in config.REGRESSION_MODEL_TYPES:
        record = snapshot.require(model_type)
        if record.r_squared is not None:
            active_r2[model_type] = record.r_squared
            continue
        json_r2 = record.coefficients_json.get("r2")
        if json_r2 is None:
            raise DbError(
                f"Active regression row '{model_type}' is missing r_squared and "
                "coefficients_json.r2"
            )
        active_r2[model_type] = float(json_r2)

    return active_r2


def load_active_ad_rates(client: Client) -> dict[str, Any]:
    record = load_active_snapshot(client).require("ad_rates")
    return dict(record.coefficients_json)


def load_active_consolidated_payload(client: Client) -> dict[str, Any]:
    """
    Active consolidated forecast_model payload (status='active', payload not null).

    Same row loadActiveModel() reads — NOT legacy per-model_type is_active rows.
    """
    response = (
        client.table(MODEL_COEFFICIENTS_TABLE)
        .select("id, status, payload, fitted_at, model_type")
        .eq("status", "active")
        .not_.is_("payload", "null")
        .limit(1)
        .maybe_single()
        .execute()
    )
    if not response.data:
        raise DbError(
            "No active consolidated model_coefficients row "
            "(status='active' with non-null payload)"
        )
    payload = response.data.get("payload")
    if not isinstance(payload, dict):
        raise DbError(
            f"Active consolidated row {response.data.get('id')} has invalid payload"
        )
    return dict(payload)


def count_active_by_model_type(client: Client) -> dict[str, int]:
    response = (
        client.table(MODEL_COEFFICIENTS_TABLE)
        .select("id, model_type")
        .eq("is_active", True)
        .execute()
    )
    counts = {model_type: 0 for model_type in config.ALL_MODEL_TYPES}
    for row in response.data or []:
        model_type = str(row["model_type"])
        if model_type in counts:
            counts[model_type] += 1
    return counts


def verify_single_active_per_model_type(client: Client) -> None:
    counts = count_active_by_model_type(client)
    violations = [
        (model_type, count)
        for model_type, count in counts.items()
        if count != 1
    ]
    if not violations:
        return

    details = "; ".join(
        _integrity_recovery_message(model_type, count)
        for model_type, count in violations
    )
    raise ActiveRowIntegrityError(
        "Active-row integrity check failed. " + details
    )


def fetch_active_row(client: Client, model_type: str) -> ModelCoefficientRecord | None:
    response = (
        client.table(MODEL_COEFFICIENTS_TABLE)
        .select(SELECT_COLUMNS)
        .eq("model_type", model_type)
        .eq("is_active", True)
        .execute()
    )
    rows = response.data or []
    if not rows:
        return None
    if len(rows) > 1:
        raise ActiveRowIntegrityError(_integrity_recovery_message(model_type, len(rows)))
    return ModelCoefficientRecord.from_row(rows[0])


def verify_type_active(
    client: Client,
    model_type: str,
    *,
    expected_id: str,
) -> None:
    active = fetch_active_row(client, model_type)
    if active is None:
        raise ActiveRowIntegrityError(_integrity_recovery_message(model_type, 0))
    if active.id != expected_id:
        raise ActiveRowIntegrityError(
            f"model_type '{model_type}' active row id mismatch: expected "
            f"{expected_id}, found {active.id}. Resolve in Supabase Table Editor "
            f"by setting is_active=true on id={expected_id} and is_active=false "
            "on any other active rows for this model_type."
        )


def verify_promotion_result(
    client: Client,
    expected_active_ids: dict[str, str],
) -> None:
    verify_single_active_per_model_type(client)
    for model_type, expected_id in expected_active_ids.items():
        verify_type_active(client, model_type, expected_id=expected_id)


def _validate_coefficients_json(model_type: str, payload: dict[str, Any]) -> None:
    """
    Validate active/new coefficient payloads.

    Tolerates legacy active-row shapes (rmse/r2 on column only, log_dN,
    stream_curve median/p25/p75, older save_rate genres) so retrain can read
    production rows; new inserts still emit the current schema.
    """
    if model_type in config.REGRESSION_MODEL_TYPES:
        for key in ("intercept", "log_ml", "feat", "ed_tier"):
            if key not in payload:
                raise DbError(
                    f"Active row '{model_type}' coefficients_json missing '{key}'"
                )
        if model_type.startswith("streams_d") and model_type != "streams_d0":
            day = int(model_type.removeprefix("streams_d"))
            if f"log_d{day}" not in payload and "log_dN" not in payload:
                raise DbError(
                    f"Active row '{model_type}' coefficients_json missing "
                    f"'log_d{day}' (or legacy 'log_dN')"
                )
        if model_type == "saves" and "genre_offset" not in payload:
            raise DbError("Active row 'saves' coefficients_json missing 'genre_offset'")
        return

    if model_type == "algo_bands":
        for tier in config.ARTIST_TIERS:
            if tier not in payload:
                raise DbError(f"algo_bands missing tier '{tier}'")
        return

    if model_type == "save_rate_bands":
        if not payload:
            raise DbError("save_rate_bands payload is empty")
        return

    if model_type == "stream_bands":
        for key in ("lo", "hi", "n"):
            if key not in payload:
                raise DbError(f"stream_bands coefficients_json missing '{key}'")
        return

    if model_type == "stream_curve":
        has_curve_keys = all(
            key in payload for key in ("curve_median", "curve_p25", "curve_p75")
        )
        has_legacy_keys = all(key in payload for key in ("median", "p25", "p75"))
        if not has_curve_keys and not has_legacy_keys:
            raise DbError(
                "stream_curve missing curve_median/p25/p75 "
                "(or legacy median/p25/p75)"
            )
        # Weekday-aware components (optional on legacy active rows).
        component_keys = (
            "trend_median",
            "trend_p25",
            "trend_p75",
            "dow_multiplier",
            "editorial_kernel",
        )
        present = [key for key in component_keys if key in payload]
        if present and len(present) != len(component_keys):
            missing = [key for key in component_keys if key not in payload]
            raise DbError(
                "stream_curve weekday components incomplete; missing "
                + ", ".join(missing)
            )
        if "dow_multiplier" in payload:
            dow = payload["dow_multiplier"]
            if not isinstance(dow, list) or len(dow) != 7:
                raise DbError("stream_curve.dow_multiplier must be a list of 7")
        if "editorial_kernel" in payload:
            kernel = payload["editorial_kernel"]
            if not isinstance(kernel, list) or len(kernel) < 1:
                raise DbError("stream_curve.editorial_kernel must be a non-empty list")
        return

    if model_type == "ad_rates":
        if "spotify_rates" not in payload:
            raise DbError("ad_rates missing 'spotify_rates'")
        return

    raise DbError(f"Unknown model_type: {model_type}")


def _regression_r_squared(model: RegressionModel) -> float:
    return float(model.r2)


def build_insert_records(
    *,
    regression_models: dict[str, RegressionModel],
    derived_models: dict[str, DerivedModel],
    fitted_at: str | None = None,
) -> list[InsertRecord]:
    timestamp = fitted_at or utc_now_iso()
    records: list[InsertRecord] = []

    for model_type in config.REGRESSION_MODEL_TYPES:
        model = regression_models.get(model_type)
        if model is None:
            raise DbError(f"Missing regression model for insert: {model_type}")
        records.append(
            InsertRecord(
                model_type=model_type,
                coefficients_json=model.to_coefficients_json(),
                r_squared=_regression_r_squared(model),
                sample_size=int(model.sample_size),
                fitted_at=timestamp,
                is_active=False,
            )
        )

    derived_key_map = {
        "algo_bands": "algo_bands",
        "save_rate_bands": "save_rate_bands",
        "stream_bands": "stream_bands",
        "stream_curve": "stream_curve",
        "ad_rates": "ad_rates",
    }
    for model_type in config.DERIVED_MODEL_TYPES:
        model = derived_models.get(derived_key_map[model_type])
        if model is None:
            raise DbError(f"Missing derived model for insert: {model_type}")
        records.append(
            InsertRecord(
                model_type=model_type,
                coefficients_json=model.to_coefficients_json(),
                r_squared=None,
                sample_size=int(model.sample_size),
                fitted_at=timestamp,
                is_active=False,
            )
        )

    if len(records) != len(config.ALL_MODEL_TYPES):
        raise DbError(
            f"Expected {len(config.ALL_MODEL_TYPES)} insert records, got {len(records)}"
        )

    return records


def insert_inactive_batch(
    client: Client,
    records: list[InsertRecord],
) -> InsertedModelBatch:
    if len(records) != len(config.ALL_MODEL_TYPES):
        raise DbError(
            f"insert_inactive_batch requires {len(config.ALL_MODEL_TYPES)} records"
        )

    payload = [record.to_insert_dict() for record in records]
    response = client.table(MODEL_COEFFICIENTS_TABLE).insert(payload).execute()
    if not response.data:
        raise DbError("model_coefficients insert returned no rows")

    inserted_rows = [ModelCoefficientRecord.from_row(row) for row in response.data]
    ids_by_type = {row.model_type: row.id for row in inserted_rows}
    records_by_type = {row.model_type: row for row in inserted_rows}

    for model_type in config.ALL_MODEL_TYPES:
        if model_type not in ids_by_type:
            raise DbError(f"Insert response missing model_type: {model_type}")

    fitted_at = records[0].fitted_at
    return InsertedModelBatch(
        ids_by_type=ids_by_type,
        records_by_type=records_by_type,
        fitted_at=fitted_at,
    )


def demote_active_for_type(client: Client, model_type: str) -> None:
    response = (
        client.table(MODEL_COEFFICIENTS_TABLE)
        .update({"is_active": False})
        .eq("model_type", model_type)
        .eq("is_active", True)
        .execute()
    )
    if response.data is None:
        raise DbError(f"Demote for '{model_type}' returned no data payload")


def promote_row(client: Client, row_id: str, *, fitted_at: str) -> None:
    """Activate a row and stamp fitted_at = promote time (progress-bar cutoff)."""
    response = (
        client.table(MODEL_COEFFICIENTS_TABLE)
        .update({"is_active": True, "fitted_at": fitted_at})
        .eq("id", row_id)
        .execute()
    )
    if response.data is None:
        raise DbError(f"Promote for id '{row_id}' returned no data payload")


def promote_batch(client: Client, inserted: InsertedModelBatch) -> None:
    verify_single_active_per_model_type(client)

    completed_types: list[str] = []
    for model_type in config.ALL_MODEL_TYPES:
        new_id = inserted.ids_by_type[model_type]
        previous_active = fetch_active_row(client, model_type)
        previous_active_id = previous_active.id if previous_active else None

        try:
            demote_active_for_type(client, model_type)
            promote_row(client, new_id, fitted_at=inserted.fitted_at)
            verify_type_active(client, model_type, expected_id=new_id)
        except DbError as error:
            raise PromotionError(
                _promotion_recovery_message(
                    failed_model_type=model_type,
                    completed_types=completed_types,
                    new_id=new_id,
                    previous_active_id=previous_active_id,
                )
            ) from error

        completed_types.append(model_type)

    verify_promotion_result(client, inserted.ids_by_type)


def stamp_active_fitted_at(client: Client, fitted_at: str) -> list[str]:
    """
    Set fitted_at on every currently active model_coefficients row.

    Used to seed the archive retrain-progress cutoff after a constants-only
    (hold-the-commit) ship that did not promote. Future live promotes stamp
    fitted_at via promote_row; this is the one-time baseline backfill.
    """
    response = (
        client.table(MODEL_COEFFICIENTS_TABLE)
        .update({"fitted_at": fitted_at})
        .eq("is_active", True)
        .execute()
    )
    if response.data is None:
        raise DbError("stamp_active_fitted_at returned no data payload")

    ids = [str(row["id"]) for row in response.data]
    if not ids:
        raise DbError("stamp_active_fitted_at matched no active rows")
    return ids


def insert_and_promote(
    client: Client,
    *,
    regression_models: dict[str, RegressionModel],
    derived_models: dict[str, DerivedModel],
    fitted_at: str | None = None,
) -> InsertedModelBatch:
    """Insert inactive batch then promote sequentially (see RETRAINING.md).

    ``fitted_at`` defaults to promote time (utc now). Inserts and the promote
    flip both write that timestamp so max(active fitted_at) advances the
    archive retrain-progress cutoff automatically.
    """
    promote_at = fitted_at or utc_now_iso()
    records = build_insert_records(
        regression_models=regression_models,
        derived_models=derived_models,
        fitted_at=promote_at,
    )
    inserted = insert_inactive_batch(client, records)
    promote_batch(client, inserted)
    return inserted
