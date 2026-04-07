import { NextResponse } from "next/server";
import { listWorkflows, upsertWorkflow } from "@/lib/db";
import { workflowDefinitionSchema } from "@agent-studio/shared";

export async function GET() {
  return NextResponse.json(listWorkflows());
}

export async function POST(request: Request) {
  const payload = workflowDefinitionSchema.parse(await request.json());
  return NextResponse.json(upsertWorkflow(payload));
}
