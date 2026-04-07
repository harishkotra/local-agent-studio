import { z } from "zod";

export const providerTypeSchema = z.enum([
  "ollama",
  "openai",
  "openai_compatible",
]);

export const providerCredentialSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: providerTypeSchema,
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProviderCredential = z.infer<typeof providerCredentialSchema>;

export const agentRoleSchema = z.enum(["coordinator", "worker"]);

export const outputModeSchema = z.enum(["text", "json"]);

export const agentProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  role: agentRoleSchema,
  providerId: z.string(),
  model: z.string().min(1),
  systemPrompt: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.4),
  maxTokens: z.number().int().positive().default(1200),
  outputMode: outputModeSchema.default("text"),
  allowedTools: z.array(z.string()).default([]),
  avatar: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentProfile = z.infer<typeof agentProfileSchema>;

export const workflowNodeTypeSchema = z.enum([
  "input",
  "agent",
  "router",
  "http_tool",
  "output",
]);

export const flowPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const nodeBaseSchema = z.object({
  id: z.string(),
  type: workflowNodeTypeSchema,
  label: z.string(),
  description: z.string().default(""),
  position: flowPositionSchema,
});

export const inputNodeSchema = nodeBaseSchema.extend({
  type: z.literal("input"),
  data: z.object({
    text: z.string().default(""),
    variables: z.array(z.string()).default([]),
  }),
});

export const agentNodeSchema = nodeBaseSchema.extend({
  type: z.literal("agent"),
  data: z.object({
    agentProfileId: z.string(),
    prompt: z.string().default(""),
  }),
});

export const routerNodeSchema = nodeBaseSchema.extend({
  type: z.literal("router"),
  data: z.object({
    instructions: z.string().default("Return JSON with {\"route\":\"...\",\"reason\":\"...\"}."),
    defaultRoute: z.string().default("default"),
  }),
});

export const httpToolNodeSchema = nodeBaseSchema.extend({
  type: z.literal("http_tool"),
  data: z.object({
    url: z.string().url(),
    method: z.enum(["GET", "POST"]).default("GET"),
    headers: z.record(z.string()).default({}),
    bodyTemplate: z.string().default(""),
  }),
});

export const outputNodeSchema = nodeBaseSchema.extend({
  type: z.literal("output"),
  data: z.object({
    template: z.string().default(""),
  }),
});

export const workflowNodeSchema = z.discriminatedUnion("type", [
  inputNodeSchema,
  agentNodeSchema,
  routerNodeSchema,
  httpToolNodeSchema,
  outputNodeSchema,
]);

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;

export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});

export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export const workflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().default(""),
  nodes: z.array(workflowNodeSchema),
  edges: z.array(workflowEdgeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;

export const nodeRunStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "completed",
  "failed",
  "skipped",
]);

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
]);

export const runEventSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    runId: z.string(),
    nodeId: z.string().optional(),
    type: z.literal("queued"),
    message: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    id: z.string(),
    runId: z.string(),
    nodeId: z.string().optional(),
    type: z.literal("started"),
    message: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    id: z.string(),
    runId: z.string(),
    nodeId: z.string().optional(),
    type: z.literal("stream_delta"),
    message: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    id: z.string(),
    runId: z.string(),
    nodeId: z.string().optional(),
    type: z.literal("completed"),
    message: z.string(),
    timestamp: z.string(),
    output: z.unknown().optional(),
  }),
  z.object({
    id: z.string(),
    runId: z.string(),
    nodeId: z.string().optional(),
    type: z.literal("failed"),
    message: z.string(),
    timestamp: z.string(),
  }),
]);

export type RunEvent = z.infer<typeof runEventSchema>;

export const runNodeSchema = z.object({
  nodeId: z.string(),
  status: nodeRunStatusSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type RunNodeState = z.infer<typeof runNodeSchema>;

export const runRecordSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  status: runStatusSchema,
  input: z.record(z.string(), z.string()).default({}),
  output: z.unknown().optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  nodes: z.array(runNodeSchema).default([]),
});

export type RunRecord = z.infer<typeof runRecordSchema>;

export const studioSnapshotSchema = z.object({
  providers: z.array(providerCredentialSchema),
  agents: z.array(agentProfileSchema),
  workflows: z.array(workflowDefinitionSchema),
});

export type StudioSnapshot = z.infer<typeof studioSnapshotSchema>;
