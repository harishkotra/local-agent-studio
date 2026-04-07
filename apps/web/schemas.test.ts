import { describe, expect, it } from "vitest";
import {
  agentProfileSchema,
  providerCredentialSchema,
  runEventSchema,
  runRecordSchema,
  studioSnapshotSchema,
  workflowDefinitionSchema,
  workflowNodeSchema,
  sampleAgents,
  sampleProviders,
  sampleWorkflow,
} from "@agent-studio/shared";

const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// providerCredentialSchema
// ---------------------------------------------------------------------------

describe("providerCredentialSchema", () => {
  const base = {
    id: "p1",
    name: "Test Provider",
    type: "openai_compatible" as const,
    baseUrl: "https://api.example.com/v1",
    apiKey: "key",
    customHeaders: {},
    defaultModel: "model",
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };

  it("parses a fully-specified valid provider", () => {
    expect(providerCredentialSchema.safeParse(base).success).toBe(true);
  });

  it("accepts all three provider types", () => {
    for (const type of ["openai", "openai_compatible", "ollama"] as const) {
      expect(
        providerCredentialSchema.safeParse({ ...base, type }).success,
        `type '${type}' should be valid`,
      ).toBe(true);
    }
  });

  it("allows baseUrl to be omitted", () => {
    const { baseUrl: _omit, ...noUrl } = base;
    expect(providerCredentialSchema.safeParse(noUrl).success).toBe(true);
  });

  it("rejects a non-URL value for baseUrl", () => {
    expect(
      providerCredentialSchema.safeParse({ ...base, baseUrl: "not-a-url" }).success,
    ).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(providerCredentialSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("rejects an unknown provider type", () => {
    expect(
      providerCredentialSchema.safeParse({ ...base, type: "unknown_type" }).success,
    ).toBe(false);
  });

  it("rejects an empty defaultModel", () => {
    expect(
      providerCredentialSchema.safeParse({ ...base, defaultModel: "" }).success,
    ).toBe(false);
  });

  it("defaults isDemo to false when omitted", () => {
    const { isDemo: _omit, ...noDemo } = base;
    const result = providerCredentialSchema.safeParse(noDemo);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDemo).toBe(false);
    }
  });

  it("defaults customHeaders to {} when omitted", () => {
    const { customHeaders: _omit, ...noHeaders } = base;
    const result = providerCredentialSchema.safeParse(noHeaders);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.customHeaders).toEqual({});
    }
  });
});

// ---------------------------------------------------------------------------
// agentProfileSchema
// ---------------------------------------------------------------------------

describe("agentProfileSchema", () => {
  const base = {
    id: "a1",
    name: "Agent",
    description: "",
    notes: "",
    profileType: "general",
    role: "worker" as const,
    providerId: "p1",
    model: "model",
    systemPrompt: "",
    temperature: 0.5,
    maxTokens: 100,
    outputMode: "text" as const,
    allowedTools: [],
    avatar: "",
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };

  it("parses a valid agent profile", () => {
    expect(agentProfileSchema.safeParse(base).success).toBe(true);
  });

  it("accepts coordinator role", () => {
    expect(agentProfileSchema.safeParse({ ...base, role: "coordinator" }).success).toBe(true);
  });

  it("accepts json outputMode", () => {
    expect(agentProfileSchema.safeParse({ ...base, outputMode: "json" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(agentProfileSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("rejects an empty model", () => {
    expect(agentProfileSchema.safeParse({ ...base, model: "" }).success).toBe(false);
  });

  it("rejects temperature below 0", () => {
    expect(agentProfileSchema.safeParse({ ...base, temperature: -0.1 }).success).toBe(false);
  });

  it("rejects temperature above 2", () => {
    expect(agentProfileSchema.safeParse({ ...base, temperature: 2.1 }).success).toBe(false);
  });

  it("accepts temperature boundary values 0 and 2", () => {
    expect(agentProfileSchema.safeParse({ ...base, temperature: 0 }).success).toBe(true);
    expect(agentProfileSchema.safeParse({ ...base, temperature: 2 }).success).toBe(true);
  });

  it("rejects non-positive maxTokens", () => {
    expect(agentProfileSchema.safeParse({ ...base, maxTokens: 0 }).success).toBe(false);
  });

  it("rejects fractional maxTokens", () => {
    expect(agentProfileSchema.safeParse({ ...base, maxTokens: 1.5 }).success).toBe(false);
  });

  it("rejects an invalid role", () => {
    expect(agentProfileSchema.safeParse({ ...base, role: "admin" }).success).toBe(false);
  });

  it("rejects an invalid outputMode", () => {
    expect(agentProfileSchema.safeParse({ ...base, outputMode: "xml" }).success).toBe(false);
  });

  it("defaults temperature to 0.4 when omitted", () => {
    const { temperature: _omit, ...noTemp } = base;
    const result = agentProfileSchema.safeParse(noTemp);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.temperature).toBe(0.4);
    }
  });

  it("defaults maxTokens to 1200 when omitted", () => {
    const { maxTokens: _omit, ...noTokens } = base;
    const result = agentProfileSchema.safeParse(noTokens);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxTokens).toBe(1200);
    }
  });
});

// ---------------------------------------------------------------------------
// workflowNodeSchema
// ---------------------------------------------------------------------------

describe("workflowNodeSchema", () => {
  const nodeBase = {
    id: "n1",
    label: "Node",
    description: "",
    position: { x: 0, y: 0 },
  };

  it("parses an input node", () => {
    expect(
      workflowNodeSchema.safeParse({
        ...nodeBase,
        type: "input",
        data: { text: "Hello {{name}}", variables: ["name"] },
      }).success,
    ).toBe(true);
  });

  it("parses an agent node", () => {
    expect(
      workflowNodeSchema.safeParse({
        ...nodeBase,
        type: "agent",
        data: { agentProfileId: "agent-1", prompt: "Do something" },
      }).success,
    ).toBe(true);
  });

  it("parses a router node", () => {
    expect(
      workflowNodeSchema.safeParse({
        ...nodeBase,
        type: "router",
        data: { instructions: "Route based on intent", defaultRoute: "default" },
      }).success,
    ).toBe(true);
  });

  it("parses an http_tool node", () => {
    expect(
      workflowNodeSchema.safeParse({
        ...nodeBase,
        type: "http_tool",
        data: {
          url: "https://api.example.com/data",
          method: "GET",
          headers: {},
          bodyTemplate: "",
        },
      }).success,
    ).toBe(true);
  });

  it("parses an output node", () => {
    expect(
      workflowNodeSchema.safeParse({
        ...nodeBase,
        type: "output",
        data: { template: "Summary" },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown node type", () => {
    expect(
      workflowNodeSchema.safeParse({ ...nodeBase, type: "unknown", data: {} }).success,
    ).toBe(false);
  });

  it("rejects an http_tool node with an invalid URL", () => {
    expect(
      workflowNodeSchema.safeParse({
        ...nodeBase,
        type: "http_tool",
        data: { url: "not-a-url", method: "GET", headers: {}, bodyTemplate: "" },
      }).success,
    ).toBe(false);
  });

  it("rejects an http_tool node with an unsupported HTTP method", () => {
    expect(
      workflowNodeSchema.safeParse({
        ...nodeBase,
        type: "http_tool",
        data: {
          url: "https://api.example.com",
          method: "DELETE",
          headers: {},
          bodyTemplate: "",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts POST as an http_tool method", () => {
    expect(
      workflowNodeSchema.safeParse({
        ...nodeBase,
        type: "http_tool",
        data: {
          url: "https://api.example.com/submit",
          method: "POST",
          headers: {},
          bodyTemplate: '{"key":"value"}',
        },
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// workflowDefinitionSchema
// ---------------------------------------------------------------------------

describe("workflowDefinitionSchema", () => {
  it("parses the sample workflow", () => {
    expect(workflowDefinitionSchema.safeParse(sampleWorkflow).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      workflowDefinitionSchema.safeParse({ ...sampleWorkflow, name: "" }).success,
    ).toBe(false);
  });

  it("rejects a zero version", () => {
    expect(
      workflowDefinitionSchema.safeParse({ ...sampleWorkflow, version: 0 }).success,
    ).toBe(false);
  });

  it("rejects a non-integer version", () => {
    expect(
      workflowDefinitionSchema.safeParse({ ...sampleWorkflow, version: 1.5 }).success,
    ).toBe(false);
  });

  it("parses a minimal workflow with no nodes or edges", () => {
    expect(
      workflowDefinitionSchema.safeParse({
        id: "wf-min",
        name: "Minimal",
        version: 1,
        description: "",
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now,
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runEventSchema
// ---------------------------------------------------------------------------

describe("runEventSchema", () => {
  const baseEvent = { id: "e1", runId: "r1", timestamp: now };

  it("parses a queued event", () => {
    expect(
      runEventSchema.safeParse({ ...baseEvent, type: "queued", message: "Node queued" }).success,
    ).toBe(true);
  });

  it("parses a started event", () => {
    expect(
      runEventSchema.safeParse({ ...baseEvent, type: "started", message: "Node started" }).success,
    ).toBe(true);
  });

  it("parses a stream_delta event", () => {
    expect(
      runEventSchema.safeParse({ ...baseEvent, type: "stream_delta", message: "token" }).success,
    ).toBe(true);
  });

  it("parses a completed event with optional output", () => {
    expect(
      runEventSchema.safeParse({
        ...baseEvent,
        type: "completed",
        message: "done",
        output: { result: "final" },
      }).success,
    ).toBe(true);
  });

  it("parses a failed event", () => {
    expect(
      runEventSchema.safeParse({ ...baseEvent, type: "failed", message: "Error occurred" })
        .success,
    ).toBe(true);
  });

  it("allows optional nodeId", () => {
    expect(
      runEventSchema.safeParse({
        ...baseEvent,
        nodeId: "node-1",
        type: "started",
        message: "started",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(
      runEventSchema.safeParse({ ...baseEvent, type: "unknown", message: "?" }).success,
    ).toBe(false);
  });

  it("parses a completed event that includes a message", () => {
    expect(
      runEventSchema.safeParse({ ...baseEvent, type: "completed", message: "Node finished" })
        .success,
    ).toBe(true);
  });

  it("rejects a completed event missing message", () => {
    expect(
      runEventSchema.safeParse({ ...baseEvent, type: "completed" }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runRecordSchema
// ---------------------------------------------------------------------------

describe("runRecordSchema", () => {
  const base = {
    id: "run-1",
    workflowId: "wf-1",
    workflowName: "My Workflow",
    status: "completed" as const,
    input: { goal: "ship it" },
    startedAt: now,
    completedAt: now,
    nodes: [],
  };

  it("parses a valid run record", () => {
    expect(runRecordSchema.safeParse(base).success).toBe(true);
  });

  it("accepts all status values", () => {
    for (const status of ["queued", "running", "completed", "failed"] as const) {
      expect(runRecordSchema.safeParse({ ...base, status }).success, status).toBe(true);
    }
  });

  it("rejects an invalid status", () => {
    expect(runRecordSchema.safeParse({ ...base, status: "pending" }).success).toBe(false);
  });

  it("allows output to be omitted", () => {
    const { output: _omit, ...noOutput } = { ...base, output: undefined };
    expect(runRecordSchema.safeParse(noOutput).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// studioSnapshotSchema
// ---------------------------------------------------------------------------

describe("studioSnapshotSchema", () => {
  it("parses a snapshot built from the sample data", () => {
    expect(
      studioSnapshotSchema.safeParse({
        providers: sampleProviders,
        agents: sampleAgents,
        workflows: [sampleWorkflow],
      }).success,
    ).toBe(true);
  });

  it("parses a snapshot with empty arrays", () => {
    expect(
      studioSnapshotSchema.safeParse({ providers: [], agents: [], workflows: [] }).success,
    ).toBe(true);
  });

  it("rejects a snapshot with an invalid nested provider", () => {
    expect(
      studioSnapshotSchema.safeParse({
        providers: [{ id: "p1" }],
        agents: [],
        workflows: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a snapshot with an invalid nested agent", () => {
    expect(
      studioSnapshotSchema.safeParse({
        providers: [],
        agents: [{ id: "a1", temperature: 99 }],
        workflows: [],
      }).success,
    ).toBe(false);
  });
});
