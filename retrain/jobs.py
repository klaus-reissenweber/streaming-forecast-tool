"""retrain_jobs claim / complete / fail helpers (service-role)."""

from __future__ import annotations

from typing import Any

from db import DbError, utc_now_iso
from supabase import Client


def claim_queued_job(client: Client) -> dict[str, Any] | None:
    """Claim oldest queued job via claim_retrain_job() RPC. None if empty."""
    response = client.rpc("claim_retrain_job").execute()
    rows = response.data or []
    if not rows:
        return None
    return dict(rows[0])


def complete_job(
    client: Client,
    job_id: str,
    *,
    draft_model_id: str,
    report_json: dict[str, Any] | None = None,
) -> None:
    response = (
        client.table("retrain_jobs")
        .update(
            {
                "status": "completed",
                "completed_at": utc_now_iso(),
                "draft_model_id": draft_model_id,
                "error": None,
                "report_json": report_json,
            }
        )
        .eq("id", job_id)
        .eq("status", "running")
        .select("id")
        .execute()
    )
    if not response.data:
        raise DbError(f"complete_job matched no running row for id={job_id}")


def fail_job(
    client: Client,
    job_id: str,
    *,
    error: str,
    report_json: dict[str, Any] | None = None,
) -> None:
    response = (
        client.table("retrain_jobs")
        .update(
            {
                "status": "failed",
                "completed_at": utc_now_iso(),
                "error": error[:4000],
                "report_json": report_json,
            }
        )
        .eq("id", job_id)
        .eq("status", "running")
        .select("id")
        .execute()
    )
    if not response.data:
        raise DbError(f"fail_job matched no running row for id={job_id}")
