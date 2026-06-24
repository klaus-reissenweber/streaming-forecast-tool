"""Mock-based unit tests for db.py (no live Supabase)."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

import config
from db import (
    ActiveRowIntegrityError,
    InsertedModelBatch,
    PromotionError,
    build_insert_records,
    count_active_by_model_type,
    fetch_active_rows,
    load_active_r2,
    load_active_snapshot,
    promote_batch,
    verify_single_active_per_model_type,
    verify_type_active,
)
from fit import (
    AdRatesFit,
    AlgoBandsFit,
    RegressionFit,
    SaveRateBandsFit,
    SavesFit,
    StreamCurveFit,
    StreamsRefinementFit,
)


def _regression(model_type: str, sample_size: int = 55, r2: float = 0.91) -> RegressionFit:
    return RegressionFit(
        intercept=1.0,
        log_ml=0.4,
        feat=0.2,
        ed_tier=0.1,
        rmse=0.05,
        r2=r2,
        sample_size=sample_size,
    )


def _refinement(day: int, sample_size: int = 52) -> StreamsRefinementFit:
    return StreamsRefinementFit(
        refinement_day=day,
        intercept=1.1,
        log_d=0.9,
        log_ml=0.2,
        feat=0.1,
        ed_tier=0.05,
        rmse=0.04,
        r2=0.95,
        sample_size=sample_size,
    )


def _saves(sample_size: int = 55) -> SavesFit:
    return SavesFit(
        intercept=2.0,
        log_ml=0.3,
        feat=0.1,
        ed_tier=0.4,
        rmse=0.06,
        r2=0.88,
        genre_offset={
            "house": 0.0,
            "dubstep": 0.5,
            "melodic-bass": 0.3,
            "downtempo": 0.1,
            "big-room": -0.2,
        },
        sample_size=sample_size,
    )


def _sample_regression_models() -> dict[str, Any]:
    models: dict[str, Any] = {"streams_d0": _regression("streams_d0", 60)}
    for day in range(1, 8):
        models[f"streams_d{day}"] = _refinement(day, sample_size=58 - day)
    models["saves"] = _saves(sample_size=57)
    return models


def _sample_derived_models() -> dict[str, Any]:
    return {
        "algo_bands": AlgoBandsFit(
            sample_size=57,
            bands={
                "developing": {"p25": 1000, "p50": 2000, "p75": 3000, "p90": 4000},
                "mid": {"p25": 4000, "p50": 5000, "p75": 6000, "p90": 7000},
                "established": {"p25": 8000, "p50": 9000, "p75": 10000, "p90": 11000},
            },
        ),
        "save_rate_bands": SaveRateBandsFit(
            sample_size=57,
            bands={
                "dubstep": {"lo": 17.0, "hi": 22.0},
                "house": {"lo": 9.0, "hi": 16.0},
                "melodic-bass": {"lo": 13.0, "hi": 23.0},
                "downtempo": {"lo": 10.0, "hi": 16.0},
                "big-room": {"lo": 5.0, "hi": 10.0},
            },
        ),
        "stream_curve": StreamCurveFit(
            sample_size=57,
            median=[0.5, 27.2],
            p25=[0.2, 23.3],
            p75=[0.7, 31.7],
        ),
        "ad_rates": AdRatesFit(
            spotify_rates={"single": {"marquee": {"mid": 0.22}}},
            meta_rates_by_genre={"house": 2.73},
            meta_objective_multipliers={"traffic": 1.0},
            meta_delivery_per_objective={
                "traffic": {"cpm": 3.83, "cpr": 6.91, "cpc": 0.1}
            },
            sample_size=30,
        ),
    }


def _active_row(
    model_type: str,
    row_id: str,
    *,
    r_squared: float | None = 0.9,
    coefficients_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if coefficients_json is None:
        if model_type in config.REGRESSION_MODEL_TYPES:
            coefficients_json = {
                "intercept": 1.0,
                "log_ml": 0.4,
                "feat": 0.2,
                "ed_tier": 0.1,
                "rmse": 0.05,
                "r2": 0.9,
            }
            if model_type.startswith("streams_d") and model_type != "streams_d0":
                day = int(model_type.removeprefix("streams_d"))
                coefficients_json[f"log_d{day}"] = 0.8
            if model_type == "saves":
                coefficients_json["genre_offset"] = {"house": 0.0}
        elif model_type == "algo_bands":
            coefficients_json = {
                "developing": {"p25": 1, "p50": 2, "p75": 3, "p90": 4},
                "mid": {"p25": 5, "p50": 6, "p75": 7, "p90": 8},
                "established": {"p25": 9, "p50": 10, "p75": 11, "p90": 12},
            }
        elif model_type == "save_rate_bands":
            coefficients_json = {
                genre: {"lo": 9.0, "hi": 16.0} for genre in config.GENRES
            }
        elif model_type == "stream_curve":
            coefficients_json = {
                "curve_median": [0.5],
                "curve_p25": [0.2],
                "curve_p75": [0.7],
            }
        else:
            coefficients_json = {
                "spotify_rates": {"single": {"marquee": {"mid": 0.22}}},
                "meta_rates_by_genre": {"house": 2.73},
            }

    return {
        "id": row_id,
        "model_type": model_type,
        "coefficients_json": coefficients_json,
        "r_squared": r_squared,
        "sample_size": 50,
        "fitted_at": "2026-06-23T12:00:00.000Z",
        "is_active": True,
    }


def _inactive_row(model_type: str, row_id: str) -> dict[str, Any]:
    row = _active_row(model_type, row_id)
    row["is_active"] = False
    return row


class MockSupabaseClient:
    """Minimal in-memory mock for model_coefficients operations."""

    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows: list[dict[str, Any]] = [dict(row) for row in (rows or [])]
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.fail_promote_for: str | None = None

    def table(self, _name: str) -> MockSupabaseClient:
        return self

    def select(self, _columns: str) -> MockSupabaseClient:
        return self

    def eq(self, column: str, value: Any) -> MockSupabaseClient:
        self._filters = getattr(self, "_filters", []) + [(column, value)]
        return self

    def update(self, payload: dict[str, Any]) -> MockSupabaseClient:
        self._update_payload = payload
        return self

    def insert(self, payload: list[dict[str, Any]]) -> MockSupabaseClient:
        self._insert_payload = payload
        return self

    def execute(self) -> Any:
        filters = getattr(self, "_filters", [])
        delattr(self, "_filters")

        if hasattr(self, "_insert_payload"):
            payload = self._insert_payload
            delattr(self, "_insert_payload")
            inserted = []
            for index, item in enumerate(payload):
                row = {
                    "id": f"new-{item['model_type']}-{index}",
                    **item,
                    "is_active": False,
                }
                self.rows.append(row)
                inserted.append(row)
            self.calls.append(("insert", {"count": len(inserted)}))
            return MagicMock(data=inserted)

        if hasattr(self, "_update_payload"):
            payload = self._update_payload
            delattr(self, "_update_payload")

            if payload.get("is_active") is True:
                row_id = next((value for column, value in filters if column == "id"), None)
                if row_id == self.fail_promote_for:
                    self.calls.append(("promote_failed", {"id": row_id}))
                    return MagicMock(data=None)

            matched = self._filter_rows(filters)
            for row in matched:
                row.update(payload)
            op = "demote" if payload.get("is_active") is False else "promote"
            self.calls.append(
                (
                    op,
                    {
                        "filters": filters,
                        "matched_ids": [row["id"] for row in matched],
                    },
                )
            )
            return MagicMock(data=matched)

        matched = self._filter_rows(filters)
        self.calls.append(("select", {"filters": filters, "count": len(matched)}))
        return MagicMock(data=[dict(row) for row in matched])

    def _filter_rows(self, filters: list[tuple[str, Any]]) -> list[dict[str, Any]]:
        matched = self.rows
        for column, value in filters:
            matched = [row for row in matched if row.get(column) == value]
        return matched


def _full_active_fixture() -> list[dict[str, Any]]:
    return [
        _active_row(model_type, f"old-{model_type}")
        for model_type in config.ALL_MODEL_TYPES
    ]


def _inserted_batch(ids_prefix: str = "new") -> InsertedModelBatch:
    return InsertedModelBatch(
        ids_by_type={
            model_type: f"{ids_prefix}-{model_type}"
            for model_type in config.ALL_MODEL_TYPES
        },
        records_by_type={},
        fitted_at="2026-06-23T12:00:00.000Z",
    )


def _add_inactive_new_rows(client: MockSupabaseClient, ids_prefix: str = "new") -> None:
    for model_type in config.ALL_MODEL_TYPES:
        client.rows.append(
            _inactive_row(model_type, f"{ids_prefix}-{model_type}")
        )


def test_fetch_active_rows_and_load_snapshot() -> None:
    rows = _full_active_fixture()
    client = MockSupabaseClient(rows)

    active = fetch_active_rows(client)
    assert len(active) == 13

    snapshot = load_active_snapshot(client)
    assert set(snapshot.by_type.keys()) == set(config.ALL_MODEL_TYPES)


def test_load_active_r2_uses_column_and_null_on_derived() -> None:
    rows = [
        _active_row("streams_d0", "id-d0", r_squared=0.91),
        _active_row("saves", "id-saves", r_squared=0.88),
    ]
    for model_type in config.ALL_MODEL_TYPES:
        if model_type in {"streams_d0", "saves"}:
            continue
        if model_type in config.DERIVED_MODEL_TYPES:
            rows.append(_active_row(model_type, f"id-{model_type}", r_squared=None))
        else:
            rows.append(_active_row(model_type, f"id-{model_type}", r_squared=0.95))

    client = MockSupabaseClient(rows)
    active_r2 = load_active_r2(client)

    assert active_r2["streams_d0"] == 0.91
    assert active_r2["saves"] == 0.88
    assert len(active_r2) == len(config.REGRESSION_MODEL_TYPES)


def test_build_insert_records_produces_thirteen_rows() -> None:
    records = build_insert_records(
        regression_models=_sample_regression_models(),
        derived_models=_sample_derived_models(),
        fitted_at="2026-06-23T12:00:00.000Z",
    )

    assert len(records) == 13
    by_type = {record.model_type: record for record in records}

    assert by_type["streams_d0"].r_squared == 0.91
    assert by_type["streams_d0"].sample_size == 60
    assert by_type["streams_d3"].sample_size == 55
    assert by_type["saves"].sample_size == 57
    assert by_type["algo_bands"].r_squared is None
    assert by_type["save_rate_bands"].r_squared is None
    assert by_type["stream_curve"].r_squared is None
    assert by_type["ad_rates"].r_squared is None
    assert by_type["ad_rates"].sample_size == 30
    assert all(record.is_active is False for record in records)


def test_integrity_check_zero_active_raises_with_recovery_message() -> None:
    client = MockSupabaseClient([])

    with pytest.raises(ActiveRowIntegrityError) as exc_info:
        verify_single_active_per_model_type(client)

    message = str(exc_info.value)
    assert "streams_d0" in message
    assert "0 active rows" in message
    assert "Supabase Table Editor" in message
    assert "re-run the retrain script" in message


def test_integrity_check_duplicate_active_raises_with_recovery_message() -> None:
    rows = [
        _active_row("streams_d0", "id-a"),
        _active_row("streams_d0", "id-b"),
    ]
    client = MockSupabaseClient(rows)

    with pytest.raises(ActiveRowIntegrityError) as exc_info:
        verify_single_active_per_model_type(client)

    message = str(exc_info.value)
    assert "streams_d0" in message
    assert "2 active rows" in message
    assert "is_active=false on duplicate rows" in message


def test_integrity_check_passes_with_exactly_one_active_per_type() -> None:
    client = MockSupabaseClient(_full_active_fixture())

    counts = count_active_by_model_type(client)
    assert all(count == 1 for count in counts.values())
    verify_single_active_per_model_type(client)


def test_promote_batch_demotes_before_promotes_per_type() -> None:
    client = MockSupabaseClient(_full_active_fixture())
    _add_inactive_new_rows(client)

    promote_batch(client, _inserted_batch())

    op_sequence = [call[0] for call in client.calls if call[0] in {"demote", "promote"}]
    assert len(op_sequence) == 26
    for index in range(0, 26, 2):
        assert op_sequence[index] == "demote"
        assert op_sequence[index + 1] == "promote"

    for model_type in config.ALL_MODEL_TYPES:
        active = [
            row
            for row in client.rows
            if row["model_type"] == model_type and row["is_active"]
        ]
        assert len(active) == 1
        assert active[0]["id"] == f"new-{model_type}"


@patch("db.verify_promotion_result")
@patch("db.verify_type_active", wraps=verify_type_active)
def test_promote_batch_calls_verify_type_active_per_type(
    verify_type_active_spy: MagicMock,
    _post_check: MagicMock,
) -> None:
    client = MockSupabaseClient(_full_active_fixture())
    _add_inactive_new_rows(client)
    inserted = _inserted_batch()

    promote_batch(client, inserted)

    assert verify_type_active_spy.call_count == len(config.ALL_MODEL_TYPES)
    for model_type in config.ALL_MODEL_TYPES:
        verify_type_active_spy.assert_any_call(
            client,
            model_type,
            expected_id=inserted.ids_by_type[model_type],
        )


def test_promote_batch_runs_post_integrity_check() -> None:
    client = MockSupabaseClient(_full_active_fixture())
    _add_inactive_new_rows(client)

    with patch("db.verify_promotion_result") as post_check:
        promote_batch(client, _inserted_batch())
        post_check.assert_called_once()


def test_promote_batch_failure_includes_recovery_instructions() -> None:
    client = MockSupabaseClient(_full_active_fixture())
    _add_inactive_new_rows(client)
    client.fail_promote_for = "new-saves"

    with pytest.raises(PromotionError) as exc_info:
        promote_batch(client, _inserted_batch())

    message = str(exc_info.value)
    assert "failed at model_type 'saves'" in message
    assert "Completed types:" in message
    assert "streams_d7" in message
    assert "id=new-saves" in message
    assert "id=old-saves" in message
    assert "audit all model types" in message


def test_verify_type_active_reports_mismatch_with_recovery() -> None:
    client = MockSupabaseClient([_active_row("saves", "wrong-id")])

    with pytest.raises(ActiveRowIntegrityError) as exc_info:
        verify_type_active(client, "saves", expected_id="expected-id")

    message = str(exc_info.value)
    assert "id mismatch" in message
    assert "expected-id" in message
    assert "wrong-id" in message
    assert "Supabase Table Editor" in message


def test_build_insert_records_report(capsys: pytest.CaptureFixture[str]) -> None:
    records = build_insert_records(
        regression_models=_sample_regression_models(),
        derived_models=_sample_derived_models(),
        fitted_at="2026-06-23T12:00:00.000Z",
    )
    summary = {
        "count": len(records),
        "regression_r_squared": {
            record.model_type: record.r_squared
            for record in records
            if record.model_type in config.REGRESSION_MODEL_TYPES
        },
        "derived_r_squared_null": [
            record.model_type
            for record in records
            if record.model_type in config.DERIVED_MODEL_TYPES
            and record.r_squared is None
        ],
        "sample_sizes": {record.model_type: record.sample_size for record in records},
    }

    print("=== build_insert_records (mock batch) ===")
    print(json.dumps(summary, indent=2))
    assert summary["count"] == 13
    assert len(summary["derived_r_squared_null"]) == 4
    print("PASS: build_insert_records")
