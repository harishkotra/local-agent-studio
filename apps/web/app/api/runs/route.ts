import { NextResponse } from "next/server";
import { getRun, listRuns } from "@/lib/db";
import { startWorkflowRun } from "@/lib/runtime";
import { z } from "zod";

const runRequestSchema = z.object({
  workflowId: z.string(),
  input: z.record(z.string(), z.string()).default({}),
});

export async function GET() {
  return NextResponse.json(listRuns());
}

export async function POST(request: Request) {
  const payload = runRequestSchema.parse(await request.json());
  const run = await startWorkflowRun(payload.workflowId, payload.input);
  return NextResponse.json(run ?? getRun(payload.workflowId));
}
