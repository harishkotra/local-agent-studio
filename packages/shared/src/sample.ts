import type {
  AgentProfile,
  ProviderCredential,
  WorkflowDefinition,
} from "./schemas";

const now = new Date().toISOString();

export const sampleProviders: ProviderCredential[] = [
  {
    id: "provider-ollama",
    name: "Local Ollama",
    type: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    customHeaders: {},
    defaultModel: "qwen2.5:7b-instruct",
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "provider-openai",
    name: "OpenAI",
    type: "openai",
    customHeaders: {},
    defaultModel: "gpt-4.1-mini",
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "provider-featherless",
    name: "Featherless",
    type: "openai_compatible",
    baseUrl: "https://api.featherless.ai/v1",
    customHeaders: {},
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  },
];

export const sampleAgents: AgentProfile[] = [
  {
    id: "agent-ceo",
    name: "CEO",
    description: "Coordinates workers and synthesizes the final answer.",
    profileType: "orchestrator",
    role: "coordinator",
    providerId: "provider-ollama",
    model: "qwen2.5:7b-instruct",
    systemPrompt:
      "You coordinate workers. Delegate clearly, compare findings, then produce a concise synthesis.",
    temperature: 0.3,
    maxTokens: 1200,
    outputMode: "text",
    allowedTools: ["delegation"],
    avatar: "🧠",
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "agent-researcher",
    name: "Researcher",
    description: "Breaks down the topic into findings and supporting facts.",
    profileType: "research",
    role: "worker",
    providerId: "provider-ollama",
    model: "qwen2.5:7b-instruct",
    systemPrompt: "You are a research worker. Return crisp findings and open questions.",
    temperature: 0.5,
    maxTokens: 900,
    outputMode: "text",
    allowedTools: ["http"],
    avatar: "🔎",
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "agent-developer",
    name: "Developer",
    description: "Turns the brief into a concrete implementation strategy.",
    profileType: "engineering",
    role: "worker",
    providerId: "provider-ollama",
    model: "qwen2.5:7b-instruct",
    systemPrompt:
      "You are a senior software engineer. Focus on implementation details, tradeoffs, and execution steps.",
    temperature: 0.4,
    maxTokens: 900,
    outputMode: "text",
    allowedTools: [],
    avatar: "🛠️",
    isDemo: true,
    createdAt: now,
    updatedAt: now,
  },
];

export const sampleWorkflow: WorkflowDefinition = {
  id: "workflow-mvp-demo",
  name: "MVP Orchestration Demo",
  version: 1,
  description: "Coordinator delegates to two workers, then synthesizes a final response.",
  createdAt: now,
  updatedAt: now,
  nodes: [
    {
      id: "node-input",
      type: "input",
      label: "Task Brief",
      description: "Initial prompt supplied by the operator.",
      position: { x: 120, y: 280 },
      data: {
        text: "Design an MVP for an OSS local-first agent orchestration platform.",
        variables: ["user_goal"],
      },
    },
    {
      id: "node-ceo",
      type: "agent",
      label: "CEO",
      description: "Coordinator",
      position: { x: 520, y: 120 },
      data: {
        agentProfileId: "agent-ceo",
        prompt:
          "Read the brief and instruct the workers what to focus on. Include a clear synthesis framing for the final answer.",
      },
    },
    {
      id: "node-researcher",
      type: "agent",
      label: "Researcher",
      description: "Worker",
      position: { x: 340, y: 420 },
      data: {
        agentProfileId: "agent-researcher",
        prompt:
          "Identify the most important product requirements, OSS constraints, and differentiation opportunities.",
      },
    },
    {
      id: "node-developer",
      type: "agent",
      label: "Developer",
      description: "Worker",
      position: { x: 760, y: 420 },
      data: {
        agentProfileId: "agent-developer",
        prompt:
          "Convert the coordinator brief into architecture, runtime, and implementation steps for a local-first MVP.",
      },
    },
    {
      id: "node-output",
      type: "output",
      label: "Output",
      description: "Final deliverable",
      position: { x: 1080, y: 280 },
      data: {
        template:
          "Combine upstream outputs into a concise final delivery with summary, architecture, and next steps.",
      },
    },
  ],
  edges: [
    { id: "edge-a", source: "node-input", target: "node-ceo" },
    { id: "edge-b", source: "node-ceo", target: "node-researcher" },
    { id: "edge-c", source: "node-ceo", target: "node-developer" },
    { id: "edge-d", source: "node-researcher", target: "node-output" },
    { id: "edge-e", source: "node-developer", target: "node-output" },
  ],
};
