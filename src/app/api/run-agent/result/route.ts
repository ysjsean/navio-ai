import { NextRequest, NextResponse } from "next/server";
import { getRunResult } from "@/lib/run-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("runId") || "";

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const result = getRunResult(runId);
  if (!result) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
