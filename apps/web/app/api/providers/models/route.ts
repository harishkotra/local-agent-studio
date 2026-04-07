import { NextResponse } from "next/server";
import { providerCredentialSchema } from "@agent-studio/shared";

function trimSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function toOllamaRoots(baseUrl?: string) {
  const normalized = trimSlash(baseUrl || "http://127.0.0.1:11434/v1");
  if (normalized.endsWith("/v1")) {
    return {
      openaiRoot: normalized,
      nativeRoot: normalized.slice(0, -3),
    };
  }
  return {
    openaiRoot: `${normalized}/v1`,
    nativeRoot: normalized,
  };
}

export async function POST(request: Request) {
  const provider = providerCredentialSchema.parse(await request.json());

  if (provider.type !== "ollama") {
    return NextResponse.json({ models: [] });
  }

  const { openaiRoot, nativeRoot } = toOllamaRoots(provider.baseUrl);

  try {
    const openAiResponse = await fetch(`${openaiRoot}/models`, {
      headers: {
        "Content-Type": "application/json",
        ...provider.customHeaders,
      },
      cache: "no-store",
    });

    if (openAiResponse.ok) {
      const json = (await openAiResponse.json()) as {
        data?: Array<{ id?: string }>;
      };
      const models = (json.data ?? [])
        .map((model) => model.id)
        .filter((value): value is string => Boolean(value));
      return NextResponse.json({ models });
    }
  } catch {
    // Fall through to the Ollama-native endpoint.
  }

  try {
    const nativeResponse = await fetch(`${nativeRoot}/api/tags`, {
      headers: {
        "Content-Type": "application/json",
        ...provider.customHeaders,
      },
      cache: "no-store",
    });

    if (!nativeResponse.ok) {
      throw new Error(await nativeResponse.text());
    }

    const json = (await nativeResponse.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = (json.models ?? [])
      .map((model) => model.name)
      .filter((value): value is string => Boolean(value));
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      {
        models: [],
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch local Ollama models.",
      },
      { status: 200 },
    );
  }
}
