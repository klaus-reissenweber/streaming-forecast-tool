"""Parity tests: Python dataset.py vs lib/compute-week1-actuals.ts."""

from __future__ import annotations

import json

import config
from dataset import ELDERBROOK_D1_D7, compute_week1_actuals


def test_elderbrook_week1_parity() -> None:
    """Golden fixture must match TypeScript computeWeek1Actuals output."""
    wk1 = compute_week1_actuals(list(ELDERBROOK_D1_D7))

    assert wk1.streams == config.ELDERBROOK_EXPECTED_WK1_STREAMS
    assert wk1.saves == config.ELDERBROOK_EXPECTED_WK1_SAVES
    assert wk1.days_with_streams == 7
    assert wk1.days_with_saves == 7
    assert wk1.is_complete is True


def test_elderbrook_week1_parity_report(capsys) -> None:
    """Print parity summary for operator review (same pattern as validate-archive-elderbrook.ts)."""
    wk1 = compute_week1_actuals(list(ELDERBROOK_D1_D7))
    summary = {
        "fixture": "Elderbrook D1-D7",
        "release_id": config.ELDERBROOK_RELEASE_ID,
        "streams": wk1.streams,
        "expected_streams": config.ELDERBROOK_EXPECTED_WK1_STREAMS,
        "saves": wk1.saves,
        "expected_saves": config.ELDERBROOK_EXPECTED_WK1_SAVES,
        "days_with_streams": wk1.days_with_streams,
        "days_with_saves": wk1.days_with_saves,
        "is_complete": wk1.is_complete,
        "parity": (
            wk1.streams == config.ELDERBROOK_EXPECTED_WK1_STREAMS
            and wk1.saves == config.ELDERBROOK_EXPECTED_WK1_SAVES
        ),
    }
    print("=== compute_week1_actuals (Elderbrook D1-D7) ===")
    print(json.dumps(summary, indent=2))
    assert summary["parity"] is True
    print("PASS: Elderbrook parity")
