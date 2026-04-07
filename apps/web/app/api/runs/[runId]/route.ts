import { NextResponse } from "next/server";
import { getRun, listRunEvents } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({
    run,
    events: listRunEvents(runId),
  });
}
