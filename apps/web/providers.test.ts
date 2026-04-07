import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatModelAdapter } from "@agent-studio/orchestrator";
import type { AgentProfile, ProviderCredential } from "@agent-studio/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

function makeProvider(overrides: Partial<ProviderCredential> = {}): ProviderCredential {
  return {
    id: "p1",
    name: "Test Provider",
    type: "openai_compatible",
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key",
    customHeaders: {},
    defaultModel: "test-model",
    isDemo: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "a1",
    name: "Agent",
    description: "",
    notes: "",
    profileType: "general",
    role: "worker",
    providerId: "p1",
    model: "test-model",
    systemPrompt: "You are a test agent.",
    temperature: 0.5,
    maxTokens: 100,
    outputMode: "text",
    allowedTools: [],
    avatar: "",
    isDemo: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sseStream(parts: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const part of parts) {
          controller.enqueue(encoder.encode(part));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

const baseOptions = { temperature: 0.5, maxTokens: 100 };

// ---------------------------------------------------------------------------
// createChatModelAdapter – factory
// ---------------------------------------------------------------------------

describe("createChatModelAdapter", () => {
  it("returns an adapter for openai_compatible type", () => {
    const adapter = createChatModelAdapter(makeProvider(), makeAgent());
    expect(adapter).toBeDefined();
    expect(typeof adapter.generate).toBe("function");
  });

  it("returns an adapter for openai type", () => {
    const adapter = createChatModelAdapter(makeProvider({ type: "openai" }), makeAgent());
    expect(adapter).toBeDefined();
  });

  it("returns an adapter for ollama type", () => {
    const adapter = createChatModelAdapter(
      makeProvider({ type: "ollama", baseUrl: "http://localhost:11434/v1", apiKey: undefined }),
      makeAgent(),
    );
    expect(adapter).toBeDefined();
  });

  it("throws for an unsupported provider type", () => {
    const badProvider = makeProvider({ type: "unknown_type" as ProviderCredential["type"] });
    expect(() => createChatModelAdapter(badProvider, makeAgent())).toThrow(
      "Unsupported provider type",
    );
  });
});

// ---------------------------------------------------------------------------
// OpenAICompatibleAdapter.generate – validation errors (no network needed)
// ---------------------------------------------------------------------------

describe("OpenAICompatibleAdapter.generate – validation", () => {
  it("throws when openai_compatible provider has no baseUrl", async () => {
    const provider = makeProvider({ baseUrl: undefined });
    const adapter = createChatModelAdapter(provider, makeAgent());

    await expect(
      adapter.generate([{ role: "user", content: "hi" }], baseOptions),
    ).rejects.toThrow("missing a base URL");
  });

  it("throws when a non-ollama provider has no apiKey", async () => {
    const provider = makeProvider({ apiKey: undefined });
    const adapter = createChatModelAdapter(provider, makeAgent());

    await expect(
      adapter.generate([{ role: "user", content: "hi" }], baseOptions),
    ).rejects.toThrow("missing an API key");
  });
});

// ---------------------------------------------------------------------------
// OpenAICompatibleAdapter.generate – HTTP & SSE behaviour
// ---------------------------------------------------------------------------

describe("OpenAICompatibleAdapter.generate – HTTP and SSE", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when the HTTP response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })),
    );
    const adapter = createChatModelAdapter(makeProvider(), makeAgent());

    await expect(
      adapter.generate([{ role: "user", content: "hi" }], baseOptions),
    ).rejects.toThrow("Provider call failed (401)");
  });

  it("assembles multi-chunk SSE response into a single text result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseStream([
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const adapter = createChatModelAdapter(makeProvider(), makeAgent());

    const result = await adapter.generate([{ role: "user", content: "hi" }], baseOptions);

    expect(result.text).toBe("Hello world");
  });

  it("calls onDelta for each streamed token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseStream([
          'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"B"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const adapter = createChatModelAdapter(makeProvider(), makeAgent());
    const deltas: string[] = [];

    await adapter.generate([{ role: "user", content: "hi" }], {
      ...baseOptions,
      onDelta: (d) => deltas.push(d),
    });

    expect(deltas).toEqual(["A", "B"]);
  });

  it("ignores non-data SSE lines and chunks with empty delta content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseStream([
          ": keep-alive\n\n",
          "event: message\n",
          'data: {"choices":[{"delta":{}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"text"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const adapter = createChatModelAdapter(makeProvider(), makeAgent());

    const result = await adapter.generate([{ role: "user", content: "hi" }], baseOptions);

    expect(result.text).toBe("text");
  });

  it("returns empty text when the response stream is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseStream(["data: [DONE]\n\n"]),
      ),
    );
    const adapter = createChatModelAdapter(makeProvider(), makeAgent());

    const result = await adapter.generate([{ role: "user", content: "hi" }], baseOptions);

    expect(result.text).toBe("");
  });

  it("does not require an apiKey for ollama type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseStream([
          'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );
    const provider = makeProvider({
      type: "ollama",
      apiKey: undefined,
      baseUrl: "http://localhost:11434/v1",
    });
    const adapter = createChatModelAdapter(provider, makeAgent());

    const result = await adapter.generate([{ role: "user", content: "hi" }], baseOptions);

    expect(result.text).toBe("hello");
  });

  it("uses the hardcoded OpenAI base URL when type is openai", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseStream([
        'data: {"choices":[{"delta":{"content":"response"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);
    const provider = makeProvider({ type: "openai", baseUrl: undefined });
    const adapter = createChatModelAdapter(provider, makeAgent());

    await adapter.generate([{ role: "user", content: "hi" }], baseOptions);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.any(Object),
    );
  });

  it("sends correct request structure to the API", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);
    const agent = makeAgent({ model: "custom-model", temperature: 0.7, maxTokens: 200 });
    const adapter = createChatModelAdapter(makeProvider(), agent);

    await adapter.generate([{ role: "user", content: "test" }], {
      temperature: 0.7,
      maxTokens: 200,
    });

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.model).toBe("custom-model");
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(200);
    expect(body.stream).toBe(true);
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
  });

  it("includes custom headers in the request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);
    const provider = makeProvider({ customHeaders: { "X-Custom-Header": "my-value" } });
    const adapter = createChatModelAdapter(provider, makeAgent());

    await adapter.generate([{ role: "user", content: "hi" }], baseOptions);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["X-Custom-Header"]).toBe("my-value");
  });

  it("uses the agent's model field over the provider default", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);
    const provider = makeProvider({ defaultModel: "default-model" });
    const agent = makeAgent({ model: "agent-specific-model" });
    const adapter = createChatModelAdapter(provider, agent);

    await adapter.generate([{ role: "user", content: "hi" }], baseOptions);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.model).toBe("agent-specific-model");
  });

  it("omits the Authorization header when apiKey is absent (ollama)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      sseStream([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);
    const provider = makeProvider({
      type: "ollama",
      apiKey: undefined,
      baseUrl: "http://localhost:11434/v1",
    });
    const adapter = createChatModelAdapter(provider, makeAgent());

    await adapter.generate([{ role: "user", content: "hi" }], baseOptions);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });
});
