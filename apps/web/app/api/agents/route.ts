import { NextResponse } from "next/server";
import { upsertAgent, listAgents } from "@/lib/db";
import { agentProfileSchema } from "@agent-studio/shared";

export async function GET() {
  return NextResponse.json(listAgents());
}

export async function POST(request: Request) {
  const payload = agentProfileSchema.parse(await request.json());
  return NextResponse.json(upsertAgent(payload));
}
