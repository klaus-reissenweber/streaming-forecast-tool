import { NextResponse } from "next/server";
import { requireAllowedUser } from "@/lib/auth/require-allowed-user";
import { loadRetrainJobById } from "@/lib/load-retrain-job";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Polling endpoint for archive retrain job chip. */
export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireAllowedUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { id } = await params;
  const job = await loadRetrainJobById(id);
  if (!job) {
    return NextResponse.json(null, { status: 404 });
  }
  return NextResponse.json(job);
}
