import { NextResponse } from "next/server";
import { listProviders, upsertProvider } from "@/lib/db";
import { providerCredentialSchema } from "@agent-studio/shared";

export async function GET() {
  return NextResponse.json(listProviders());
}

export async function POST(request: Request) {
  const payload = providerCredentialSchema.parse(await request.json());
  return NextResponse.json(upsertProvider(payload));
}
