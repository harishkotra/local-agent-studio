import { describe, expect, it, vi } from "vitest";
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
