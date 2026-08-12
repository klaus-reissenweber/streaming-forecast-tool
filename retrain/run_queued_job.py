#!/usr/bin/env python3
"""
Claim one queued retrain_jobs row and run --write-draft.

Used by .github/workflows/retrain.yml. Exit 0 when no job is queued.
"""

from __future__ import annotations

import json
import sys
import traceback

import config
import retrain as retrain_mod
from db import get_db_client
from jobs import (
    claim_queued_job,
    complete_job,
    fail_job,
    reap_stale_running_jobs,
)


def main() -> int:
    client = get_db_client()
    # Always run before claim / empty-queue exit so a dead worker cannot
    # permanently block new enqueues (actions.ts rejects if any running).
    reap_stale_running_jobs(client)
    job = claim_queued_job(client)
    if job is None:
        print("No queued retrain job — exiting.")
        return 0

    job_id = str(job["id"])
    print(f"Claimed retrain job id={job_id} (status=running)")

    flags = config.RetrainFlags(
        write_draft=True,
        job_id=job_id,
        skip_constants_sync=True,
    )
    retrain_mod.LAST_DRAFT_MODEL_ID = None

    try:
        exit_code = retrain_mod.run(flags)
        draft_id = retrain_mod.LAST_DRAFT_MODEL_ID
        if exit_code != 0 or not draft_id:
            fail_job(
                client,
                job_id,
                error=(
                    f"write-draft failed (exit={exit_code}, draft_id={draft_id})"
                ),
                report_json={"exit_code": exit_code},
            )
            print(f"Job {job_id} marked failed")
            return 1

        complete_job(
            client,
            job_id,
            draft_model_id=draft_id,
            report_json={
                "draft_model_id": draft_id,
                "exit_code": 0,
            },
        )
        print(
            json.dumps(
                {
                    "job_id": job_id,
                    "draft_model_id": draft_id,
                    "status": "completed",
                }
            )
        )
        return 0
    except Exception as exc:
        traceback.print_exc()
        try:
            fail_job(
                client,
                job_id,
                error=f"{type(exc).__name__}: {exc}",
            )
        except Exception:
            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
