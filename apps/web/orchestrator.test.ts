import { afterEach, describe, expect, it, vi } from "vitest";
import { executeWorkflow } from "@agent-studio/orchestrator";
import type {
  AgentProfile,
  ProviderCredential,
  WorkflowDefinition,
} from "@agent-studio/shared";

function streamResponse(parts: string[]) {
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
  );
}

const now = new Date().toISOString();

const provider: ProviderCredential = {
  id: "provider",
  name: "Compat",
  type: "openai_compatible",
  baseUrl: "https://example.com/v1",
  apiKey: "test-key",
  customHeaders: {},
  defaultModel: "demo-model",
  isDemo: false,
  createdAt: now,
  updatedAt: now,
};

const agents: AgentProfile[] = [
  {
    id: "agent-a",
    name: "Worker A",
    description: "",
    notes: "",
    profileType: "analysis",
    role: "worker",
    providerId: "provider",
    model: "demo-model",
    systemPrompt: "You are worker A.",
    temperature: 0.2,
    maxTokens: 300,
    outputMode: "text",
    allowedTools: [],
    avatar: "",
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "agent-b",
    name: "Worker B",
    description: "",
    notes: "",
    profileType: "implementation",
    role: "worker",
    providerId: "provider",
    model: "demo-model",
    systemPrompt: "You are worker B.",
    temperature: 0.2,
    maxTokens: 300,
    outputMode: "text",
    allowedTools: [],
    avatar: "",
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  },
];

describe("executeWorkflow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("executes a simple branched DAG and emits outputs", async () => {
    const workflow: WorkflowDefinition = {
      id: "wf-1",
      name: "Branch test",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: "input",
          type: "input",
          label: "Input",
          description: "",
          position: { x: 0, y: 0 },
          data: { text: "Task: {{goal}}", variables: ["goal"] },
        },
        {
          id: "agent-1",
          type: "agent",
          label: "A",
          description: "",
          position: { x: 100, y: 0 },
          data: { agentProfileId: "agent-a", prompt: "Analyze it." },
        },
        {
          id: "agent-2",
          type: "agent",
          label: "B",
          description: "",
          position: { x: 100, y: 100 },
          data: { agentProfileId: "agent-b", prompt: "Implement it." },
        },
        {
          id: "out",
          type: "output",
          label: "Output",
          description: "",
          position: { x: 200, y: 0 },
          data: { template: "Final synthesis" },
        },
      ],
      edges: [
        { id: "e1", source: "input", target: "agent-1" },
        { id: "e2", source: "input", target: "agent-2" },
        { id: "e3", source: "agent-1", target: "out" },
        { id: "e4", source: "agent-2", target: "out" },
      ],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        streamResponse([
          'data: {"choices":[{"delta":{"content":"research"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      )
      .mockResolvedValueOnce(
        streamResponse([
          'data: {"choices":[{"delta":{"content":"implementation"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      );

    vi.stubGlobal("fetch", fetchMock);

    const events: string[] = [];
    const result = await executeWorkflow({
      workflow,
      agents,
      providers: [provider],
      runId: "run-1",
      input: { goal: "ship an MVP" },
      onEvent: (event) => {
        events.push(event.type);
      },
    });

    expect(result.status).toBe("completed");
    expect(String(result.output)).toContain("research");
    expect(String(result.output)).toContain("implementation");
    expect(events).toContain("stream_delta");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by the tests below
// ---------------------------------------------------------------------------

function makeSimpleAgentWorkflow(agentId: string): WorkflowDefinition {
  return {
    id: "wf-agent",
    name: "Simple Agent",
    version: 1,
    description: "",
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: "in",
        type: "input",
        label: "Input",
        description: "",
        position: { x: 0, y: 0 },
        data: { text: "task", variables: [] },
      },
      {
        id: "ag",
        type: "agent",
        label: "Agent",
        description: "",
        position: { x: 100, y: 0 },
        data: { agentProfileId: agentId, prompt: "do it" },
      },
    ],
    edges: [{ id: "e1", source: "in", target: "ag" }],
  };
}

function makeInputOutputWorkflow(
  text: string,
  variables: string[],
  template: string,
): WorkflowDefinition {
  return {
    id: "wf-io",
    name: "Input Output",
    version: 1,
    description: "",
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: "in",
        type: "input",
        label: "Input",
        description: "",
        position: { x: 0, y: 0 },
        data: { text, variables },
      },
      {
        id: "out",
        type: "output",
        label: "Output",
        description: "",
        position: { x: 100, y: 0 },
        data: { template },
      },
    ],
    edges: [{ id: "e1", source: "in", target: "out" }],
  };
}

// ---------------------------------------------------------------------------
// DAG validation
// ---------------------------------------------------------------------------

describe("executeWorkflow – DAG validation", () => {
  it("throws when the workflow graph contains a cycle", async () => {
    const workflow: WorkflowDefinition = {
      id: "wf-cycle",
      name: "Cyclic",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: "a",
          type: "input",
          label: "A",
          description: "",
          position: { x: 0, y: 0 },
          data: { text: "", variables: [] },
        },
        {
          id: "b",
          type: "agent",
          label: "B",
          description: "",
          position: { x: 100, y: 0 },
          data: { agentProfileId: "agent-a", prompt: "" },
        },
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "a" },
      ],
    };

    await expect(
      executeWorkflow({
        workflow,
        agents,
        providers: [provider],
        runId: "run-cycle",
        input: {},
        onEvent: () => {},
      }),
    ).rejects.toThrow("Workflow must be a DAG");
  });

  it("throws when the workflow has no start node", async () => {
    const workflow: WorkflowDefinition = {
      id: "wf-empty",
      name: "Empty",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [],
      edges: [],
    };

    await expect(
      executeWorkflow({
        workflow,
        agents,
        providers: [provider],
        runId: "run-empty",
        input: {},
        onEvent: () => {},
      }),
    ).rejects.toThrow("Workflow has no start node");
  });
});

// ---------------------------------------------------------------------------
// Node failures
// ---------------------------------------------------------------------------

describe("executeWorkflow – node failures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks the run as failed when an agent profile cannot be found", async () => {
    const result = await executeWorkflow({
      workflow: makeSimpleAgentWorkflow("nonexistent-agent"),
      agents: [],
      providers: [provider],
      runId: "run-no-agent",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("failed");
    const failedNode = result.nodes.find((n) => n.nodeId === "ag");
    expect(failedNode?.status).toBe("failed");
    expect(failedNode?.error).toContain("Unknown agent profile");
  });

  it("marks the run as failed when a provider cannot be found", async () => {
    const result = await executeWorkflow({
      workflow: makeSimpleAgentWorkflow("agent-a"),
      agents,
      providers: [],
      runId: "run-no-provider",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("failed");
    const failedNode = result.nodes.find((n) => n.nodeId === "ag");
    expect(failedNode?.status).toBe("failed");
    expect(failedNode?.error).toContain("Unknown provider");
  });

  it("marks the run as failed when fetch throws during agent execution", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await executeWorkflow({
      workflow: makeSimpleAgentWorkflow("agent-a"),
      agents,
      providers: [provider],
      runId: "run-fetch-error",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("failed");
    const failedNode = result.nodes.find((n) => n.nodeId === "ag");
    expect(failedNode?.status).toBe("failed");
    expect(failedNode?.error).toContain("Network error");
  });

  it("marks the run as failed when http_tool receives a non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })),
    );

    const workflow: WorkflowDefinition = {
      id: "wf-http-err",
      name: "HTTP Error",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: "in",
          type: "input",
          label: "Input",
          description: "",
          position: { x: 0, y: 0 },
          data: { text: "", variables: [] },
        },
        {
          id: "tool",
          type: "http_tool",
          label: "Tool",
          description: "",
          position: { x: 100, y: 0 },
          data: {
            url: "https://api.example.com/data",
            method: "GET",
            headers: {},
            bodyTemplate: "",
          },
        },
      ],
      edges: [{ id: "e1", source: "in", target: "tool" }],
    };

    const result = await executeWorkflow({
      workflow,
      agents: [],
      providers: [],
      runId: "run-http-err",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("failed");
    const toolNode = result.nodes.find((n) => n.nodeId === "tool");
    expect(toolNode?.status).toBe("failed");
    expect(toolNode?.error).toContain("HTTP tool failed (404)");
  });

  it("emits a failed event for a failing node", async () => {
    const events: string[] = [];

    await executeWorkflow({
      workflow: makeSimpleAgentWorkflow("nonexistent-agent"),
      agents: [],
      providers: [provider],
      runId: "run-event-failed",
      input: {},
      onEvent: (e) => events.push(e.type),
    });

    expect(events).toContain("failed");
  });
});

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

describe("executeWorkflow – node types", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("executes a linear input→agent→output workflow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          'data: {"choices":[{"delta":{"content":"linear-result"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );

    const workflow: WorkflowDefinition = {
      id: "wf-linear",
      name: "Linear",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: "in",
          type: "input",
          label: "Input",
          description: "",
          position: { x: 0, y: 0 },
          data: { text: "run task", variables: [] },
        },
        {
          id: "ag",
          type: "agent",
          label: "Agent",
          description: "",
          position: { x: 100, y: 0 },
          data: { agentProfileId: "agent-a", prompt: "Do it" },
        },
        {
          id: "out",
          type: "output",
          label: "Output",
          description: "",
          position: { x: 200, y: 0 },
          data: { template: "" },
        },
      ],
      edges: [
        { id: "e1", source: "in", target: "ag" },
        { id: "e2", source: "ag", target: "out" },
      ],
    };

    const result = await executeWorkflow({
      workflow,
      agents,
      providers: [provider],
      runId: "run-linear",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    expect(String(result.output)).toContain("linear-result");
  });

  it("interpolates template variables in the input node", async () => {
    const result = await executeWorkflow({
      workflow: makeInputOutputWorkflow(
        "Hello {{name}}, task: {{task}}",
        ["name", "task"],
        "",
      ),
      agents: [],
      providers: [],
      runId: "run-interp",
      input: { name: "Alice", task: "build MVP" },
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    expect(String(result.output)).toContain("Hello Alice");
    expect(String(result.output)).toContain("build MVP");
  });

  it("replaces undefined template variables with an empty string", async () => {
    const result = await executeWorkflow({
      workflow: makeInputOutputWorkflow("Val: {{missing}}", ["missing"], ""),
      agents: [],
      providers: [],
      runId: "run-interp-miss",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    expect(String(result.output)).toContain("Val: ");
    expect(String(result.output)).not.toContain("{{missing}}");
  });

  it("output node without template renders only upstream content", async () => {
    const result = await executeWorkflow({
      workflow: makeInputOutputWorkflow("raw content", [], ""),
      agents: [],
      providers: [],
      runId: "run-no-tpl",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    expect(String(result.output)).toBe("## in\nraw content");
  });

  it("output node with template prepends it to the upstream content", async () => {
    const result = await executeWorkflow({
      workflow: makeInputOutputWorkflow("content", [], "Summary:"),
      agents: [],
      providers: [],
      runId: "run-with-tpl",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    expect(String(result.output)).toMatch(/^Summary:/);
    expect(String(result.output)).toContain("content");
  });

  it("executes an http_tool GET node and includes its response in the output", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("tool-data", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const workflow: WorkflowDefinition = {
      id: "wf-http-get",
      name: "HTTP GET",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: "in",
          type: "input",
          label: "Input",
          description: "",
          position: { x: 0, y: 0 },
          data: { text: "go", variables: [] },
        },
        {
          id: "tool",
          type: "http_tool",
          label: "Tool",
          description: "",
          position: { x: 100, y: 0 },
          data: {
            url: "https://api.example.com/data",
            method: "GET",
            headers: {},
            bodyTemplate: "",
          },
        },
        {
          id: "out",
          type: "output",
          label: "Output",
          description: "",
          position: { x: 200, y: 0 },
          data: { template: "" },
        },
      ],
      edges: [
        { id: "e1", source: "in", target: "tool" },
        { id: "e2", source: "tool", target: "out" },
      ],
    };

    const result = await executeWorkflow({
      workflow,
      agents: [],
      providers: [],
      runId: "run-http-get",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    expect(String(result.output)).toContain("tool-data");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/data",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("executes an http_tool POST node with an interpolated body template", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("posted", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const workflow: WorkflowDefinition = {
      id: "wf-http-post",
      name: "HTTP POST",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: "in",
          type: "input",
          label: "Input",
          description: "",
          position: { x: 0, y: 0 },
          data: { text: "hello world", variables: [] },
        },
        {
          id: "tool",
          type: "http_tool",
          label: "Tool",
          description: "",
          position: { x: 100, y: 0 },
          data: {
            url: "https://api.example.com/submit",
            method: "POST",
            headers: {},
            bodyTemplate: '{"data":"{{in}}"}',
          },
        },
        {
          id: "out",
          type: "output",
          label: "Output",
          description: "",
          position: { x: 200, y: 0 },
          data: { template: "" },
        },
      ],
      edges: [
        { id: "e1", source: "in", target: "tool" },
        { id: "e2", source: "tool", target: "out" },
      ],
    };

    const result = await executeWorkflow({
      workflow,
      agents: [],
      providers: [],
      runId: "run-http-post",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/submit");
    expect(options.method).toBe("POST");
    expect(options.body).toBe('{"data":"hello world"}');
  });

  it("routes to the matching branch when router upstream is valid JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":{"content":"path-a-result"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);

    const workflow: WorkflowDefinition = {
      id: "wf-router-json",
      name: "Router JSON",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: "in",
          type: "input",
          label: "Input",
          description: "",
          position: { x: 0, y: 0 },
          data: { text: '{"route":"path-a"}', variables: [] },
        },
        {
          id: "router",
          type: "router",
          label: "Router",
          description: "",
          position: { x: 100, y: 0 },
          data: { instructions: "Route by JSON", defaultRoute: "path-b" },
        },
        {
          id: "agent-a",
          type: "agent",
          label: "Agent A",
          description: "",
          position: { x: 200, y: 0 },
          data: { agentProfileId: "agent-a", prompt: "Path A work" },
        },
        {
          id: "agent-b",
          type: "agent",
          label: "Agent B",
          description: "",
          position: { x: 200, y: 100 },
          data: { agentProfileId: "agent-b", prompt: "Path B work" },
        },
      ],
      edges: [
        { id: "e1", source: "in", target: "router" },
        { id: "e2", source: "router", target: "agent-a", label: "path-a" },
        { id: "e3", source: "router", target: "agent-b", label: "path-b" },
      ],
    };

    const result = await executeWorkflow({
      workflow,
      agents,
      providers: [provider],
      runId: "run-router-json",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.nodes.find((n) => n.nodeId === "agent-a")?.status).toBe("completed");
    expect(result.nodes.find((n) => n.nodeId === "agent-b")?.status).toBe("idle");
  });

  it("falls back to the default route when router upstream is not valid JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      streamResponse([
        'data: {"choices":[{"delta":{"content":"path-b-result"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", mockFetch);

    const workflow: WorkflowDefinition = {
      id: "wf-router-default",
      name: "Router Default",
      version: 1,
      description: "",
      createdAt: now,
      updatedAt: now,
      nodes: [
        {
          id: "in",
          type: "input",
          label: "Input",
          description: "",
          position: { x: 0, y: 0 },
          data: { text: "not valid json at all", variables: [] },
        },
        {
          id: "router",
          type: "router",
          label: "Router",
          description: "",
          position: { x: 100, y: 0 },
          data: { instructions: "Route it", defaultRoute: "path-b" },
        },
        {
          id: "agent-a",
          type: "agent",
          label: "Agent A",
          description: "",
          position: { x: 200, y: 0 },
          data: { agentProfileId: "agent-a", prompt: "Path A work" },
        },
        {
          id: "agent-b",
          type: "agent",
          label: "Agent B",
          description: "",
          position: { x: 200, y: 100 },
          data: { agentProfileId: "agent-b", prompt: "Path B work" },
        },
      ],
      edges: [
        { id: "e1", source: "in", target: "router" },
        { id: "e2", source: "router", target: "agent-a", label: "path-a" },
        { id: "e3", source: "router", target: "agent-b", label: "path-b" },
      ],
    };

    const result = await executeWorkflow({
      workflow,
      agents,
      providers: [provider],
      runId: "run-router-default",
      input: {},
      onEvent: () => {},
    });

    expect(result.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.nodes.find((n) => n.nodeId === "agent-b")?.status).toBe("completed");
    expect(result.nodes.find((n) => n.nodeId === "agent-a")?.status).toBe("idle");
  });

  it("emits queued, started, completed, and stream_delta events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        streamResponse([
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    );

    const events: string[] = [];

    await executeWorkflow({
      workflow: makeSimpleAgentWorkflow("agent-a"),
      agents,
      providers: [provider],
      runId: "run-events",
      input: {},
      onEvent: (e) => events.push(e.type),
    });

    expect(events).toContain("queued");
    expect(events).toContain("started");
    expect(events).toContain("completed");
    expect(events).toContain("stream_delta");
  });
});
