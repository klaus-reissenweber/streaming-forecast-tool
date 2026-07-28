#!/usr/bin/env python3
"""
Local E2E: enqueue a queued job (service role) → claim → --write-draft → complete.

Requires retrain_jobs migration applied. Exits 2 if the table is missing.
"""

from __future__ import annotations

import json
import sys

from db import get_db_client
from jobs import claim_queued_job, complete_job, fail_job
import config
import retrain as retrain_mod


def main() -> int:
    client = get_db_client()
    try:
        client.table("retrain_jobs").select("id").limit(1).execute()
    except Exception as exc:
        print(
            "MISSING: public.retrain_jobs — apply "
            "supabase/migrations/202607280002_retrain_jobs.sql first.\n"
            f"({exc})"
        )
        return 2

    # Clear any inflight leftover from prior smokes (service role).
    client.table("retrain_jobs").delete().in_(
        "status", ["queued", "running"]
    ).execute()

    # insert().select() returns SyncQueryRequestBuilder — no .single()/.maybe_single()
    # on supabase-py 2.x; take the first row from .execute().
    inserted = (
        client.table("retrain_jobs")
        .insert(
            {
                "status": "queued",
                "triggered_email": "e2e-smoke@local",
            }
        )
        .select("id")
        .execute()
    )
    rows = inserted.data or []
    if not rows:
        print("FAIL: insert returned no row")
        return 1
    job_id = rows[0]["id"]
    print(f"enqueued job_id={job_id}")

    job = claim_queued_job(client)
    if not job or job["id"] != job_id:
        print("FAIL: claim_retrain_job did not return the enqueued row")
        return 1
    print(f"claimed status={job['status']}")

    flags = config.RetrainFlags(write_draft=True, job_id=job_id)
    retrain_mod.LAST_DRAFT_MODEL_ID = None
    code = retrain_mod.run(flags)
    draft_id = retrain_mod.LAST_DRAFT_MODEL_ID
    if code != 0 or not draft_id:
        fail_job(client, job_id, error=f"write-draft exit={code}")
        print("FAIL: write-draft")
        return 1

    complete_job(client, job_id, draft_model_id=draft_id)
    draft_resp = (
        client.table("model_coefficients")
        .select("id, status, metadata")
        .eq("id", draft_id)
        .limit(1)
        .execute()
    )
    draft_rows = draft_resp.data or []
    if not draft_rows:
        print(f"FAIL: draft model_coefficients id={draft_id} not found")
        return 1
    draft = draft_rows[0]
    meta = draft["metadata"] or {}
    print(
        json.dumps(
            {
                "job_id": job_id,
                "draft_model_id": draft_id,
                "status": draft["status"],
                "forward_bias": meta.get("forward_bias"),
                "guardrails": meta.get("guardrails"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
