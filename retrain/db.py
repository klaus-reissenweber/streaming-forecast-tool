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
    StreamCurveFit,
    StreamsRefinementFit,
)

MODEL_COEFFICIENTS_TABLE = "model_coefficients"
SELECT_COLUMNS = (
    "id, model_type, coefficients_json, r_squared, sample_size, fitted_at, is_active"
)

RegressionModel = RegressionFit | StreamsRefinementFit | SavesFit
DerivedModel = AlgoBandsFit | SaveRateBandsFit | StreamCurveFit | AdRatesFit


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
    if model_type in config.REGRESSION_MODEL_TYPES:
        for key in ("intercept", "log_ml", "feat", "ed_tier", "rmse", "r2"):
            if key not in payload:
                raise DbError(
                    f"Active row '{model_type}' coefficients_json missing '{key}'"
                )
        if model_type.startswith("streams_d") and model_type != "streams_d0":
            day = int(model_type.removeprefix("streams_d"))
            if f"log_d{day}" not in payload:
                raise DbError(
                    f"Active row '{model_type}' coefficients_json missing "
                    f"'log_d{day}'"
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
        for genre in config.GENRES:
            if genre not in payload:
                raise DbError(f"save_rate_bands missing genre '{genre}'")
        return

    if model_type == "stream_curve":
        for key in ("curve_median", "curve_p25", "curve_p75"):
            if key not in payload:
                raise DbError(f"stream_curve missing '{key}'")
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


def promote_row(client: Client, row_id: str) -> None:
    response = (
        client.table(MODEL_COEFFICIENTS_TABLE)
        .update({"is_active": True})
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
            promote_row(client, new_id)
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


def insert_and_promote(
    client: Client,
    *,
    regression_models: dict[str, RegressionModel],
    derived_models: dict[str, DerivedModel],
    fitted_at: str | None = None,
) -> InsertedModelBatch:
    """Insert inactive batch then promote sequentially (see RETRAINING.md)."""
    records = build_insert_records(
        regression_models=regression_models,
        derived_models=derived_models,
        fitted_at=fitted_at,
    )
    inserted = insert_inactive_batch(client, records)
    promote_batch(client, inserted)
    return inserted
