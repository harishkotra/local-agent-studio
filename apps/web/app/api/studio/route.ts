import { NextResponse } from "next/server";
import { exportSnapshot, importSnapshot } from "@/lib/db";
import { studioSnapshotSchema } from "@agent-studio/shared";

export async function GET() {
  return NextResponse.json(exportSnapshot());
}

export async function POST(request: Request) {
  const json = await request.json();
  const snapshot = studioSnapshotSchema.parse(json);
  importSnapshot(snapshot);
  return NextResponse.json({ ok: true });
}
