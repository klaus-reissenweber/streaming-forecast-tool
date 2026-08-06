"""
Fit ad_model via the TypeScript fitAdModel path (DB ad_* tables).

Called from retrain --write-draft so the draft payload's ad_model block
self-updates like the curve and tiers.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent


def _env_for_fit() -> dict[str, str]:
    env = os.environ.copy()
    # createServiceClient reads NEXT_PUBLIC_SUPABASE_URL.
    if not env.get("NEXT_PUBLIC_SUPABASE_URL") and env.get("SUPABASE_URL"):
        env["NEXT_PUBLIC_SUPABASE_URL"] = env["SUPABASE_URL"]
    return env


def fit_ad_model_payload() -> dict[str, Any]:
    """
    Run scripts/fit-ad-model.ts --emit-json and return the ad_model dict.

    Raises RuntimeError on fit failure (caller may fall back to live copy).
    """
    script = REPO_ROOT / "scripts" / "fit-ad-model.ts"
    if not script.is_file():
        raise RuntimeError(f"missing fit script: {script}")

    # Prefer local env files when present (local CLI); CI uses process env.
    env_files: list[str] = []
    for candidate in (
        REPO_ROOT / ".env.local",
        REPO_ROOT / "retrain" / ".env.local",
    ):
        if candidate.is_file():
            env_files.extend(["--env-file", str(candidate)])
    cmd = ["npx", "--yes", "tsx", *env_files, str(script), "--emit-json"]

    completed = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        env=_env_for_fit(),
        capture_output=True,
        text=True,
        check=False,
    )
    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if completed.returncode != 0:
        raise RuntimeError(
            "ad_model fit failed "
            f"(exit={completed.returncode}): {stderr or stdout or 'no output'}"
        )

    # Last non-empty line should be the JSON payload (tsx may warn on stderr).
    lines = [line for line in stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError("ad_model fit emitted no JSON")
    try:
        payload = json.loads(lines[-1])
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"ad_model fit JSON parse error: {exc}; raw={stdout[:500]!r}"
        ) from exc

    if not isinstance(payload, dict) or not payload.get("ok"):
        err = payload.get("error") if isinstance(payload, dict) else payload
        raise RuntimeError(f"ad_model fit reported failure: {err}")

    ad_model = payload.get("ad_model")
    if not isinstance(ad_model, dict) or not ad_model:
        raise RuntimeError("ad_model fit missing ad_model object")
    return {
        "ad_model": ad_model,
        "sample_sizes": payload.get("sample_sizes") or {},
        "excluded_auto_routers": payload.get("excluded_auto_routers") or [],
        "excluded_non_traffic": payload.get("excluded_non_traffic") or 0,
    }


def main() -> int:
    try:
        result = fit_ad_model_payload()
    except Exception as exc:  # noqa: BLE001 — CLI surface
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
