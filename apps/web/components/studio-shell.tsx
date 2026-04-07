"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addEdge,
  Background,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  AgentProfile,
  ProviderCredential,
  RunEvent,
  RunRecord,
  StudioSnapshot,
  WorkflowDefinition,
  WorkflowNode,
} from "@agent-studio/shared";
import { sampleWorkflow } from "@agent-studio/shared";
import {
  Bot,
  Download,
  Lock,
  LockOpen,
  Moon,
  Pencil,
  Play,
  Plus,
  Save,
  Server,
  Sparkles,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { AgentNode } from "./agent-node";
import { cn } from "@/lib/utils";

type ThemeMode = "dark" | "light";

type StudioNodeData = {
  label: string;
  description: string;
  kind: WorkflowNode["type"];
  status?: "idle" | "queued" | "running" | "completed" | "failed" | "skipped";
  agent?: AgentProfile;
  provider?: ProviderCredential;
  subtitle?: string;
  tools?: string[];
  theme?: ThemeMode;
};

type StudioFlowNode = Node<StudioNodeData>;

const nodeTypes = {
  studio: AgentNode,
};

function asFlowNode(
  node: WorkflowNode,
  agents: AgentProfile[],
  providers: ProviderCredential[],
  statuses: Record<string, StudioNodeData["status"]>,
  theme: ThemeMode,
): StudioFlowNode {
  const agent =
    node.type === "agent"
      ? agents.find((item) => item.id === node.data.agentProfileId)
      : undefined;
  const provider = agent
    ? providers.find((item) => item.id === agent.providerId)
    : undefined;

  return {
    id: node.id,
    position: node.position,
    type: "studio",
    data: {
      label: node.label,
      description: node.description,
      kind: node.type,
      status: statuses[node.id] ?? "idle",
      agent,
      provider,
      subtitle: agent
        ? `${agent.model} · ${provider?.name ?? "provider"} · ${agent.profileType}`
        : node.type,
      tools:
        node.type === "agent"
          ? agent?.allowedTools
          : node.type === "http_tool"
            ? ["http", "fetch"]
            : [],
      theme,
    },
  };
}

function workflowToFlow(
  workflow: WorkflowDefinition,
  agents: AgentProfile[],
  providers: ProviderCredential[],
  statuses: Record<string, StudioNodeData["status"]>,
  theme: ThemeMode,
) {
  const nodes = workflow.nodes.map((node) =>
    asFlowNode(node, agents, providers, statuses, theme),
  );
  const edges: Edge[] = workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: statuses[edge.source] === "running",
    type: "smoothstep",
    style: {
      stroke:
        statuses[edge.source] === "running"
          ? "#7c7cff"
          : theme === "dark"
            ? "rgba(255,255,255,0.12)"
            : "rgba(71,85,105,0.3)",
      strokeWidth: statuses[edge.source] === "running" ? 2.5 : 1.8,
    },
  }));

  return { nodes, edges };
}

function flowToWorkflow(
  base: WorkflowDefinition,
  nodes: StudioFlowNode[],
  edges: Edge[],
): WorkflowDefinition {
  const baseNodes = new Map(base.nodes.map((node) => [node.id, node]));
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    nodes: nodes.map((node) => {
      const original = baseNodes.get(node.id);
      if (!original) {
        return {
          id: node.id,
          type: "output",
          label: node.data.label,
          description: node.data.description,
          position: node.position,
          data: { template: "" },
        };
      }
      return {
        ...original,
        label: node.data.label,
        description: node.data.description,
        position: node.position,
      };
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: typeof edge.label === "string" ? edge.label : undefined,
    })),
  };
}

function maskKey(value?: string) {
  if (!value) {
    return "not set";
  }
  if (value.length <= 6) {
    return "••••••";
  }
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

function headersToText(headers: Record<string, string>) {
  return Object.keys(headers).length ? JSON.stringify(headers, null, 2) : "{}";
}

function parseHeadersText(value: string) {
  if (!value.trim()) {
    return {};
  }
  const parsed = JSON.parse(value) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(parsed).map(([key, item]) => [key, String(item)]),
  );
}

function panelClass(theme: ThemeMode) {
  return theme === "dark"
    ? "border-white/8 bg-white/[0.03] text-white"
    : "border-slate-200 bg-white/85 text-slate-900";
}

function cardClass(theme: ThemeMode, selected = false) {
  if (selected) {
    return theme === "dark"
      ? "border-indigo-400/40 bg-indigo-500/10"
      : "border-indigo-300 bg-indigo-50";
  }
  return theme === "dark"
    ? "border-white/8 bg-black/20 hover:border-white/16"
    : "border-slate-200 bg-slate-50 hover:border-slate-300";
}

function inputClass(theme: ThemeMode) {
  return theme === "dark"
    ? "border-white/10 bg-black/25 text-white"
    : "border-slate-200 bg-white text-slate-900";
}

function mutedClass(theme: ThemeMode) {
  return theme === "dark" ? "text-white/35" : "text-slate-500";
}

function subtleClass(theme: ThemeMode) {
  return theme === "dark" ? "text-white/30" : "text-slate-500";
}

export function StudioShell() {
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [providerHeadersText, setProviderHeadersText] = useState("{}");
  const [providerHeadersError, setProviderHeadersError] = useState("");
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [gridLocked, setGridLocked] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState("");
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, StudioNodeData["status"]>>(
    {},
  );
  const [isPending, startTransition] = useTransition();
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const loadStudioRef = useRef<() => Promise<void>>(async () => undefined);

  const workflow =
    snapshot?.workflows.find((item) => item.id === selectedWorkflowId) ??
    snapshot?.workflows[0] ??
    sampleWorkflow;

  const selectedAgent = useMemo(
    () => snapshot?.agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [snapshot, selectedAgentId],
  );

  const selectedProvider = useMemo(
    () =>
      snapshot?.providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [snapshot, selectedProviderId],
  );

  const selectedNode = useMemo(
    () => workflow?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [workflow, selectedNodeId],
  );

  const selectedFlowNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  loadStudioRef.current = async () => {
    const [studioResponse, runsResponse] = await Promise.all([
      fetch("/api/studio"),
      fetch("/api/runs"),
    ]);
    const studioJson = (await studioResponse.json()) as StudioSnapshot;
    const runsJson = (await runsResponse.json()) as RunRecord[];
    setSnapshot(studioJson);
    setRuns(runsJson);
    setSelectedWorkflowId((current) => current || studioJson.workflows[0]?.id || "");
    setSelectedAgentId((current) => current || studioJson.agents[0]?.id || "");
    setSelectedProviderId((current) => current || studioJson.providers[0]?.id || "");
  };

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("agent-studio-theme");
    const savedGrid = window.localStorage.getItem("agent-studio-grid-locked");
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }
    if (savedGrid === "true" || savedGrid === "false") {
      setGridLocked(savedGrid === "true");
    }
    void loadStudioRef.current();
  }, []);

  useEffect(() => {
    window.localStorage.setItem("agent-studio-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("agent-studio-grid-locked", String(gridLocked));
  }, [gridLocked]);

  useEffect(() => {
    if (!workflow || !snapshot) {
      return;
    }
    const flow = workflowToFlow(
      workflow,
      snapshot.agents,
      snapshot.providers,
      nodeStatuses,
      theme,
    );
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSelectedNodeId((current) => current || flow.nodes[0]?.id || "");
  }, [workflow, snapshot, nodeStatuses, theme, setEdges, setNodes]);

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    if (!snapshot.agents.find((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(snapshot.agents[0]?.id ?? "");
    }
    if (!snapshot.providers.find((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(snapshot.providers[0]?.id ?? "");
    }
  }, [snapshot, selectedAgentId, selectedProviderId]);

  useEffect(() => {
    if (!selectedProvider) {
      setProviderHeadersText("{}");
      setProviderHeadersError("");
      return;
    }
    setProviderHeadersText(headersToText(selectedProvider.customHeaders));
    setProviderHeadersError("");
  }, [selectedProvider]);

  useEffect(() => {
    async function loadOllamaModels() {
      if (!selectedAgent || !snapshot) {
        setOllamaModels([]);
        setOllamaModelsError("");
        return;
      }

      const provider = snapshot.providers.find(
        (item) => item.id === selectedAgent.providerId,
      );
      if (!provider || provider.type !== "ollama") {
        setOllamaModels([]);
        setOllamaModelsError("");
        return;
      }

      setOllamaModelsLoading(true);
      setOllamaModelsError("");
      try {
        const response = await fetch("/api/providers/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(provider),
        });
        const json = (await response.json()) as {
          models?: string[];
          error?: string;
        };
        setOllamaModels(json.models ?? []);
        setOllamaModelsError(json.error ?? "");
      } catch (error) {
        setOllamaModels([]);
        setOllamaModelsError(
          error instanceof Error ? error.message : "Unable to load local models.",
        );
      } finally {
        setOllamaModelsLoading(false);
      }
    }

    void loadOllamaModels();
  }, [selectedAgent, snapshot]);

  const onConnect = useMemo<OnConnect>(
    () => (connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: crypto.randomUUID(),
            type: "smoothstep",
            animated: false,
            style: {
              stroke: theme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(71,85,105,0.3)",
              strokeWidth: 1.8,
            },
          },
          current,
        ),
      ),
    [setEdges, theme],
  );

  function updateSnapshot(mutator: (current: StudioSnapshot) => StudioSnapshot) {
    setSnapshot((current) => (current ? mutator(current) : current));
  }

  function updateSelectedNode(mutator: (node: WorkflowNode) => WorkflowNode) {
    if (!workflow || !selectedNode) {
      return;
    }
    const nextWorkflow: WorkflowDefinition = {
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.id === selectedNode.id ? mutator(node) : node,
      ),
      updatedAt: new Date().toISOString(),
    };
    updateSnapshot((current) => ({
      ...current,
      workflows: current.workflows.map((item) =>
        item.id === workflow.id ? nextWorkflow : item,
      ),
    }));
  }

  function updateSelectedAgent(mutator: (agent: AgentProfile) => AgentProfile) {
    if (!selectedAgent) {
      return;
    }
    updateSnapshot((current) => ({
      ...current,
      agents: current.agents.map((agent) =>
        agent.id === selectedAgent.id
          ? mutator({
              ...agent,
              updatedAt: new Date().toISOString(),
            })
          : agent,
      ),
    }));
  }

  function updateSelectedProvider(
    mutator: (provider: ProviderCredential) => ProviderCredential,
  ) {
    if (!selectedProvider) {
      return;
    }
    updateSnapshot((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === selectedProvider.id
          ? mutator({
              ...provider,
              updatedAt: new Date().toISOString(),
            })
          : provider,
      ),
    }));
  }

  async function saveWorkflow() {
    if (!workflow) {
      return;
    }
    const next = flowToWorkflow(workflow, nodes, edges);
    const response = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const saved = (await response.json()) as WorkflowDefinition;
    updateSnapshot((current) => ({
      ...current,
      workflows: current.workflows.map((item) => (item.id === saved.id ? saved : item)),
    }));
  }

  async function saveSelectedAgent() {
    if (!selectedAgent) {
      return;
    }
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selectedAgent),
    });
    const saved = (await response.json()) as AgentProfile;
    updateSnapshot((current) => ({
      ...current,
      agents: current.agents.map((agent) => (agent.id === saved.id ? saved : agent)),
    }));
  }

  async function saveSelectedProvider() {
    if (!selectedProvider) {
      return false;
    }
    try {
      const customHeaders = parseHeadersText(providerHeadersText);
      const payload: ProviderCredential = {
        ...selectedProvider,
        customHeaders,
        updatedAt: new Date().toISOString(),
      };
      setProviderHeadersError("");
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const saved = (await response.json()) as ProviderCredential;
      updateSnapshot((current) => ({
        ...current,
        providers: current.providers.map((provider) =>
          provider.id === saved.id ? saved : provider,
        ),
      }));
      return true;
    } catch (error) {
      setProviderHeadersError(
        error instanceof Error ? error.message : "Headers must be valid JSON.",
      );
      return false;
    }
  }

  function addNode(type: WorkflowNode["type"]) {
    if (!workflow) {
      return;
    }
    const id = crypto.randomUUID();
    let nextNode: WorkflowNode;

    switch (type) {
      case "input":
        nextNode = {
          id,
          type: "input",
          label: "Input",
          description: "Workflow entry point",
          position: { x: 120, y: 120 },
          data: { text: "Describe the task", variables: ["user_goal"] },
        };
        break;
      case "agent":
        nextNode = {
          id,
          type: "agent",
          label: "Agent",
          description: "Worker node",
          position: { x: 420, y: 120 },
          data: {
            agentProfileId: selectedAgentId || snapshot?.agents[0]?.id || "",
            prompt: "Complete the assigned task.",
          },
        };
        break;
      case "router":
        nextNode = {
          id,
          type: "router",
          label: "Router",
          description: "Route by JSON output",
          position: { x: 720, y: 120 },
          data: {
            instructions: "Return JSON with a route field.",
            defaultRoute: "default",
          },
        };
        break;
      case "http_tool":
        nextNode = {
          id,
          type: "http_tool",
          label: "HTTP Tool",
          description: "Call an external HTTP endpoint",
          position: { x: 820, y: 380 },
          data: {
            url: "https://example.com",
            method: "GET",
            headers: {},
            bodyTemplate: "",
          },
        };
        break;
      case "output":
        nextNode = {
          id,
          type: "output",
          label: "Output",
          description: "Final output",
          position: { x: 1120, y: 120 },
          data: {
            template: "Combine upstream outputs.",
          },
        };
        break;
    }

    updateSnapshot((current) => ({
      ...current,
      workflows: current.workflows.map((item) =>
        item.id === workflow.id
          ? {
              ...item,
              nodes: [...item.nodes, nextNode],
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
    setSelectedNodeId(id);
  }

  async function createAgent() {
    const provider = snapshot?.providers[0];
    if (!provider) {
      return;
    }
    const now = new Date().toISOString();
    const agent: AgentProfile = {
      id: crypto.randomUUID(),
      name: `Custom Profile ${snapshot.agents.length + 1}`,
      description: "User-defined agent profile",
      notes: "",
      profileType: "custom",
      role: "worker",
      providerId: provider.id,
      model: provider.defaultModel,
      systemPrompt: "You are a user-defined agent profile.",
      temperature: 0.4,
      maxTokens: 800,
      outputMode: "text",
      allowedTools: [],
      avatar: "🤖",
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    };
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agent),
    });
    const saved = (await response.json()) as AgentProfile;
    updateSnapshot((current) => ({
      ...current,
      agents: [...current.agents, saved],
    }));
    setSelectedAgentId(saved.id);
  }

  async function createProvider() {
    const now = new Date().toISOString();
    const provider: ProviderCredential = {
      id: crypto.randomUUID(),
      name: `Custom Provider ${(snapshot?.providers.length ?? 0) + 1}`,
      type: "openai_compatible",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      customHeaders: {},
      defaultModel: "model-name",
      isDemo: false,
      createdAt: now,
      updatedAt: now,
    };
    const response = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider),
    });
    const saved = (await response.json()) as ProviderCredential;
    updateSnapshot((current) => ({
      ...current,
      providers: [...current.providers, saved],
    }));
    setSelectedProviderId(saved.id);
    setProviderModalOpen(true);
  }

  async function exportStudio() {
    const response = await fetch("/api/studio");
    const json = await response.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "agent-studio-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importStudio(file: File) {
    const text = await file.text();
    await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text,
    });
    await loadStudioRef.current();
  }

  async function startRun() {
    if (!workflow) {
      return;
    }

    startTransition(async () => {
      setEvents([]);
      setNodeStatuses({});
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: workflow.id,
          input: {
            user_goal:
              "Build an MVP plan for a local-first OSS agent orchestration platform.",
          },
        }),
      });
      const run = (await response.json()) as RunRecord;
      setSelectedRun(run);
      setRuns((current) => [run, ...current]);

      const eventSource = new EventSource(`/api/runs/${run.id}/events`);
      eventSource.onmessage = (message) => {
        const event = JSON.parse(message.data) as RunEvent | { type: "ready" };
        if ("runId" in event) {
          setEvents((current) => [...current, event]);
          if (event.nodeId) {
            const nodeId = event.nodeId;
            setNodeStatuses((current) => ({
              ...current,
              [nodeId]:
                event.type === "queued"
                  ? "queued"
                  : event.type === "started"
                    ? "running"
                    : event.type === "completed"
                      ? "completed"
                      : event.type === "failed"
                        ? "failed"
                        : current[nodeId] ?? "running",
            }));
          }
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
        void loadStudioRef.current();
      };
    });
  }

  return (
    <ReactFlowProvider>
      <div
        className={cn(
          "min-h-screen",
          theme === "dark"
            ? "bg-[radial-gradient(circle_at_top,_rgba(85,99,255,0.18),_transparent_30%),linear-gradient(180deg,_#0b0b14_0%,_#090910_100%)] text-white"
            : "bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#eef3ff_100%)] text-slate-900",
        )}
      >
        <div className="mx-auto flex min-h-screen max-w-[1680px] gap-4 p-4">
          <aside className="flex w-[390px] shrink-0 flex-col gap-4">
            <section className={cn("rounded-[24px] border p-4 backdrop-blur-xl", panelClass(theme))}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={cn("text-xs uppercase tracking-[0.3em]", subtleClass(theme))}>
                    Profiles
                  </div>
                  <div className="mt-1 text-2xl font-medium">{snapshot?.agents.length ?? 0}</div>
                  <div className={cn("mt-1 text-sm", mutedClass(theme))}>
                    Each agent profile can use its own provider and model.
                  </div>
                </div>
                <button
                  onClick={createAgent}
                  className="rounded-full border border-indigo-400/25 bg-indigo-500/10 p-2 text-indigo-100"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {snapshot?.agents.map((agent) => {
                  const provider = snapshot.providers.find(
                    (item) => item.id === agent.providerId,
                  );
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={cn("rounded-2xl border p-3 text-left transition", cardClass(theme, selectedAgentId === agent.id))}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-slate-950">
                          {agent.avatar || "🤖"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium">{agent.name}</div>
                            {agent.isDemo ? (
                              <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                                demo
                              </span>
                            ) : null}
                          </div>
                          <div className={cn("truncate text-xs", mutedClass(theme))}>
                            {agent.profileType} · {agent.model} · {provider?.name}
                          </div>
                          {agent.notes ? (
                            <div className={cn("mt-1 line-clamp-2 text-xs", mutedClass(theme))}>
                              {agent.notes}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedAgent ? (
                <div className={cn("mt-4 rounded-2xl border p-4", theme === "dark" ? "border-white/8 bg-black/20" : "border-slate-200 bg-slate-50")}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className={cn("text-xs uppercase tracking-[0.26em]", subtleClass(theme))}>
                      Edit Profile
                    </div>
                    <button
                      onClick={saveSelectedAgent}
                      className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-indigo-100"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Name
                      </label>
                      <input
                        value={selectedAgent.name}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({ ...agent, name: event.target.value }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Profile Type
                      </label>
                      <input
                        value={selectedAgent.profileType}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({
                            ...agent,
                            profileType: event.target.value,
                          }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Role
                      </label>
                      <select
                        value={selectedAgent.role}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({
                            ...agent,
                            role: event.target.value as AgentProfile["role"],
                          }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      >
                        <option value="worker">worker</option>
                        <option value="coordinator">coordinator</option>
                      </select>
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Provider
                      </label>
                      <select
                        value={selectedAgent.providerId}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => {
                            const provider = snapshot?.providers.find(
                              (item) => item.id === event.target.value,
                            );
                            return {
                              ...agent,
                              providerId: event.target.value,
                              model: provider ? provider.defaultModel : agent.model,
                            };
                          })
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      >
                        {snapshot?.providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Model
                      </label>
                      {snapshot?.providers.find(
                        (provider) => provider.id === selectedAgent.providerId,
                      )?.type === "ollama" ? (
                        <>
                          <select
                            value={selectedAgent.model}
                            onChange={(event) =>
                              updateSelectedAgent((agent) => ({
                                ...agent,
                                model: event.target.value,
                              }))
                            }
                            className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                          >
                            {(ollamaModels.length > 0
                              ? ollamaModels
                              : [selectedAgent.model || "loading-models"]).map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                          <div className={cn("mt-2 text-xs", mutedClass(theme))}>
                            {ollamaModelsLoading
                              ? "Loading locally available Ollama models..."
                              : ollamaModelsError || "Model list is sourced from your local Ollama instance."}
                          </div>
                        </>
                      ) : (
                        <input
                          value={selectedAgent.model}
                          onChange={(event) =>
                            updateSelectedAgent((agent) => ({
                              ...agent,
                              model: event.target.value,
                            }))
                          }
                          className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                        />
                      )}
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Avatar
                      </label>
                      <input
                        value={selectedAgent.avatar}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({ ...agent, avatar: event.target.value }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Description
                      </label>
                      <textarea
                        rows={2}
                        value={selectedAgent.description}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({
                            ...agent,
                            description: event.target.value,
                          }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Notes
                      </label>
                      <textarea
                        rows={3}
                        value={selectedAgent.notes}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({ ...agent, notes: event.target.value }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        System Prompt
                      </label>
                      <textarea
                        rows={5}
                        value={selectedAgent.systemPrompt}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({
                            ...agent,
                            systemPrompt: event.target.value,
                          }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Temperature
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        value={selectedAgent.temperature}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({
                            ...agent,
                            temperature: Number(event.target.value) || 0,
                          }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Max Tokens
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={selectedAgent.maxTokens}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({
                            ...agent,
                            maxTokens: Number(event.target.value) || 1,
                          }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Output Mode
                      </label>
                      <select
                        value={selectedAgent.outputMode}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({
                            ...agent,
                            outputMode: event.target.value as AgentProfile["outputMode"],
                          }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      >
                        <option value="text">text</option>
                        <option value="json">json</option>
                      </select>
                    </div>
                    <div>
                      <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                        Allowed Tools
                      </label>
                      <input
                        value={selectedAgent.allowedTools.join(", ")}
                        onChange={(event) =>
                          updateSelectedAgent((agent) => ({
                            ...agent,
                            allowedTools: event.target.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          }))
                        }
                        className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            <section className={cn("rounded-[24px] border p-4 backdrop-blur-xl", panelClass(theme))}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={cn("text-xs uppercase tracking-[0.3em]", subtleClass(theme))}>
                    Providers
                  </div>
                  <div className={cn("mt-1 text-sm", mutedClass(theme))}>
                    Click a provider card to edit it in a popup.
                  </div>
                </div>
                <button
                  onClick={createProvider}
                  className={cn(
                    "rounded-full border p-2",
                    theme === "dark"
                      ? "border-white/8 bg-white/[0.04] text-white/70"
                      : "border-slate-200 bg-white text-slate-700",
                  )}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 grid gap-3">
                {snapshot?.providers.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProviderId(provider.id);
                      setProviderModalOpen(true);
                    }}
                    className={cn("rounded-2xl border p-3 text-left transition", cardClass(theme, selectedProviderId === provider.id))}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Server className="h-4 w-4 text-cyan-300" />
                      {provider.name}
                      {provider.isDemo ? (
                        <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                          demo
                        </span>
                      ) : null}
                    </div>
                    <div className={cn("mt-1 text-xs", mutedClass(theme))}>
                      {provider.type} · {provider.defaultModel}
                    </div>
                    <div className={cn("mt-1 truncate text-xs", theme === "dark" ? "text-white/25" : "text-slate-400")}>
                      {provider.baseUrl || "OpenAI default endpoint"}
                    </div>
                    <div className={cn("mt-2 flex items-center gap-2 text-xs", mutedClass(theme))}>
                      <Pencil className="h-3.5 w-3.5" />
                      Click to edit
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className={cn("rounded-[24px] border p-4 backdrop-blur-xl", panelClass(theme))}>
              <div className="flex items-center justify-between">
                <div className={cn("text-xs uppercase tracking-[0.3em]", subtleClass(theme))}>
                  Runs
                </div>
                <div className={cn("rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.28em]", theme === "dark" ? "border-white/8 text-white/30" : "border-slate-200 text-slate-500")}>
                  History
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {runs.slice(0, 6).map((run) => (
                  <button
                    key={run.id}
                    onClick={async () => {
                      const response = await fetch(`/api/runs/${run.id}`);
                      const json = (await response.json()) as {
                        run: RunRecord;
                        events: RunEvent[];
                      };
                      setSelectedRun(json.run);
                      setEvents(json.events);
                      setNodeStatuses(
                        Object.fromEntries(
                          json.run.nodes.map((node) => [node.nodeId, node.status]),
                        ),
                      );
                    }}
                    className={cn("w-full rounded-2xl border p-3 text-left transition", cardClass(theme))}
                  >
                    <div className="truncate text-sm font-medium">{run.workflowName}</div>
                    <div className={cn("mt-1 text-xs", mutedClass(theme))}>{run.status}</div>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col gap-4">
            <header className={cn("flex items-center justify-between rounded-[28px] border px-5 py-4 backdrop-blur-xl", panelClass(theme))}>
              <div>
                <div className={cn("text-xs uppercase tracking-[0.32em]", subtleClass(theme))}>
                  Agent Studio
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <select
                    value={selectedWorkflowId}
                    onChange={(event) => setSelectedWorkflowId(event.target.value)}
                    className={cn("rounded-full border px-4 py-2 text-sm outline-none", inputClass(theme))}
                  >
                    {snapshot?.workflows.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <span className={cn("text-sm", mutedClass(theme))}>
                    Any provider, any model, per-agent configuration.
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setGridLocked((current) => !current)}
                  className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm", inputClass(theme))}
                >
                  {gridLocked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                  {gridLocked ? "Grid Locked" : "Grid Free"}
                </button>
                <button
                  onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                  className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm", inputClass(theme))}
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </button>
                <button
                  onClick={() => addNode("agent")}
                  className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm", inputClass(theme))}
                >
                  <Bot className="h-4 w-4" />
                  Add Agent
                </button>
                <button
                  onClick={saveWorkflow}
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-100"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  onClick={startRun}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
                >
                  <Play className="h-4 w-4" />
                  Run
                </button>
                <button
                  onClick={exportStudio}
                  className={cn("rounded-full border p-2", inputClass(theme))}
                >
                  <Download className="h-4 w-4" />
                </button>
                <label className={cn("cursor-pointer rounded-full border p-2", inputClass(theme))}>
                  <Upload className="h-4 w-4" />
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void importStudio(file);
                      }
                    }}
                  />
                </label>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[1fr_360px] gap-4">
              <section className={cn("relative min-h-[760px] overflow-hidden rounded-[30px] border shadow-[0_40px_80px_rgba(0,0,0,0.18)]", theme === "dark" ? "border-white/8 bg-[#090912]/95" : "border-slate-200 bg-white/90")}>
                <div className="absolute left-4 top-4 z-10 flex gap-2">
                  {(["input", "router", "http_tool", "output"] as WorkflowNode["type"][]).map(
                    (type) => (
                      <button
                        key={type}
                        onClick={() => addNode(type)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.22em]",
                          inputClass(theme),
                        )}
                      >
                        {type}
                      </button>
                    ),
                  )}
                </div>
                <div className={cn("absolute right-4 top-4 z-10 rounded-full border px-3 py-1.5 text-xs", inputClass(theme))}>
                  Drag from the `out` handle into the `in` handle. Grid snap is {gridLocked ? "on" : "off"}.
                </div>

                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  snapToGrid={gridLocked}
                  snapGrid={[24, 24]}
                  connectionMode={ConnectionMode.Loose}
                  connectionRadius={36}
                  connectionLineType={ConnectionLineType.SmoothStep}
                  connectionLineStyle={{
                    stroke: theme === "dark" ? "#7c7cff" : "#4f46e5",
                    strokeWidth: 2.5,
                  }}
                  fitView
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  defaultEdgeOptions={{
                    type: "smoothstep",
                    style: {
                      stroke:
                        theme === "dark"
                          ? "rgba(255,255,255,0.12)"
                          : "rgba(71,85,105,0.3)",
                      strokeWidth: 1.8,
                    },
                  }}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background
                    color={
                      theme === "dark"
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(71,85,105,0.14)"
                    }
                    gap={24}
                    size={gridLocked ? 1.2 : 0.8}
                  />
                  <MiniMap
                    pannable
                    zoomable
                    nodeColor={() => "#5864ff"}
                    maskColor={
                      theme === "dark"
                        ? "rgba(8, 8, 15, 0.78)"
                        : "rgba(241,245,249,0.82)"
                    }
                    className={cn(
                      "!bottom-4 !left-4 !h-28 !w-44 !rounded-2xl !border",
                      theme === "dark"
                        ? "!border-white/8 !bg-black/45"
                        : "!border-slate-200 !bg-white/80",
                    )}
                  />
                  <Controls
                    className={
                      theme === "dark"
                        ? "[&>button]:!border-white/8 [&>button]:!bg-black/45 [&>button]:!text-white/70"
                        : "[&>button]:!border-slate-200 [&>button]:!bg-white/90 [&>button]:!text-slate-700"
                    }
                    showInteractive={false}
                  />
                </ReactFlow>
              </section>

              <aside className="flex min-h-[760px] flex-col gap-4">
                <section className={cn("rounded-[28px] border p-5 backdrop-blur-xl", panelClass(theme))}>
                  <div className={cn("flex items-center gap-2 text-xs uppercase tracking-[0.32em]", subtleClass(theme))}>
                    <Sparkles className="h-4 w-4" />
                    Inspector
                  </div>

                  {selectedNode && selectedFlowNode ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                          Name
                        </label>
                        <input
                          value={selectedFlowNode.data.label}
                          onChange={(event) => {
                            setNodes((current) =>
                              current.map((node) =>
                                node.id === selectedNodeId
                                  ? { ...node, data: { ...node.data, label: event.target.value } }
                                  : node,
                              ),
                            );
                            updateSelectedNode((node) => ({
                              ...node,
                              label: event.target.value,
                            }));
                          }}
                          className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                        />
                      </div>

                      <div>
                        <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                          Description
                        </label>
                        <textarea
                          rows={3}
                          value={selectedFlowNode.data.description}
                          onChange={(event) => {
                            setNodes((current) =>
                              current.map((node) =>
                                node.id === selectedNodeId
                                  ? {
                                      ...node,
                                      data: { ...node.data, description: event.target.value },
                                    }
                                  : node,
                              ),
                            );
                            updateSelectedNode((node) => ({
                              ...node,
                              description: event.target.value,
                            }));
                          }}
                          className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                        />
                      </div>

                      {selectedNode.type === "agent" ? (
                        <>
                          <div>
                            <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                              Agent Profile
                            </label>
                            <select
                              value={selectedNode.data.agentProfileId}
                              onChange={(event) =>
                                updateSelectedNode((node) =>
                                  node.type === "agent"
                                    ? {
                                        ...node,
                                        data: { ...node.data, agentProfileId: event.target.value },
                                      }
                                    : node,
                                )
                              }
                              className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                            >
                              {snapshot?.agents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                  {agent.name} · {agent.profileType}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                              Prompt
                            </label>
                            <textarea
                              rows={6}
                              value={selectedNode.data.prompt}
                              onChange={(event) =>
                                updateSelectedNode((node) =>
                                  node.type === "agent"
                                    ? { ...node, data: { ...node.data, prompt: event.target.value } }
                                    : node,
                                )
                              }
                              className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                            />
                          </div>
                        </>
                      ) : null}

                      {selectedNode.type === "input" ? (
                        <div>
                          <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                            Input Text
                          </label>
                          <textarea
                            rows={6}
                            value={selectedNode.data.text}
                            onChange={(event) =>
                              updateSelectedNode((node) =>
                                node.type === "input"
                                  ? { ...node, data: { ...node.data, text: event.target.value } }
                                  : node,
                              )
                            }
                            className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                          />
                        </div>
                      ) : null}

                      {selectedNode.type === "router" ? (
                        <div>
                          <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                            Instructions
                          </label>
                          <textarea
                            rows={4}
                            value={selectedNode.data.instructions}
                            onChange={(event) =>
                              updateSelectedNode((node) =>
                                node.type === "router"
                                  ? {
                                      ...node,
                                      data: { ...node.data, instructions: event.target.value },
                                    }
                                  : node,
                              )
                            }
                            className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                          />
                        </div>
                      ) : null}

                      {selectedNode.type === "http_tool" ? (
                        <>
                          <div>
                            <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                              URL
                            </label>
                            <input
                              value={selectedNode.data.url}
                              onChange={(event) =>
                                updateSelectedNode((node) =>
                                  node.type === "http_tool"
                                    ? { ...node, data: { ...node.data, url: event.target.value } }
                                    : node,
                                )
                              }
                              className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                            />
                          </div>
                          <div>
                            <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                              Method
                            </label>
                            <select
                              value={selectedNode.data.method}
                              onChange={(event) =>
                                updateSelectedNode((node) =>
                                  node.type === "http_tool"
                                    ? {
                                        ...node,
                                        data: {
                                          ...node.data,
                                          method: event.target.value as "GET" | "POST",
                                        },
                                      }
                                    : node,
                                )
                              }
                              className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                            >
                              <option value="GET">GET</option>
                              <option value="POST">POST</option>
                            </select>
                          </div>
                        </>
                      ) : null}

                      {selectedNode.type === "output" ? (
                        <div>
                          <label className={cn("text-xs uppercase tracking-[0.25em]", subtleClass(theme))}>
                            Template
                          </label>
                          <textarea
                            rows={5}
                            value={selectedNode.data.template}
                            onChange={(event) =>
                              updateSelectedNode((node) =>
                                node.type === "output"
                                  ? { ...node, data: { ...node.data, template: event.target.value } }
                                  : node,
                              )
                            }
                            className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className={cn("mt-4 text-sm", mutedClass(theme))}>
                      Select a node on the canvas to configure it.
                    </div>
                  )}
                </section>

                <section className={cn("flex min-h-0 flex-1 flex-col rounded-[28px] border p-5 backdrop-blur-xl", panelClass(theme))}>
                  <div className="flex items-center justify-between">
                    <div className={cn("text-xs uppercase tracking-[0.32em]", subtleClass(theme))}>
                      Run Trace
                    </div>
                    {selectedRun ? (
                      <div
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.28em]",
                          selectedRun.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-200"
                            : selectedRun.status === "failed"
                              ? "bg-rose-500/10 text-rose-200"
                              : "bg-indigo-500/10 text-indigo-200",
                        )}
                      >
                        {selectedRun.status}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 space-y-3 overflow-y-auto pr-1">
                    {events.length === 0 ? (
                      <div
                        className={cn(
                          "rounded-2xl border border-dashed p-4 text-sm",
                          theme === "dark"
                            ? "border-white/10 bg-black/15 text-white/35"
                            : "border-slate-200 bg-slate-50 text-slate-500",
                        )}
                      >
                        Start a run to stream node activity and outputs here.
                      </div>
                    ) : (
                      events.map((event) => (
                        <div
                          key={event.id}
                          className={cn(
                            "rounded-2xl border p-3",
                            theme === "dark"
                              ? "border-white/8 bg-black/20"
                              : "border-slate-200 bg-slate-50",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                              {event.type}
                            </div>
                            <div className={cn("text-[11px]", theme === "dark" ? "text-white/25" : "text-slate-400")}>
                              {event.nodeId || "run"}
                            </div>
                          </div>
                          <div className={cn("mt-2 whitespace-pre-wrap text-sm leading-6", theme === "dark" ? "text-white/75" : "text-slate-700")}>
                            {event.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </main>
        </div>

        {providerModalOpen && selectedProvider ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-6">
            <div className={cn("w-full max-w-2xl rounded-[30px] border p-6 shadow-2xl", panelClass(theme), theme === "dark" ? "bg-[#10121c]" : "bg-white")}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={cn("text-xs uppercase tracking-[0.3em]", subtleClass(theme))}>
                    Edit Provider
                  </div>
                  <div className="mt-1 text-2xl font-medium">{selectedProvider.name}</div>
                </div>
                <button
                  onClick={() => setProviderModalOpen(false)}
                  className={cn("rounded-full border p-2", inputClass(theme))}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                    Provider Name
                  </label>
                  <input
                    value={selectedProvider.name}
                    onChange={(event) =>
                      updateSelectedProvider((provider) => ({
                        ...provider,
                        name: event.target.value,
                      }))
                    }
                    className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                  />
                </div>
                <div>
                  <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                    Protocol
                  </label>
                  <select
                    value={selectedProvider.type}
                    onChange={(event) =>
                      updateSelectedProvider((provider) => ({
                        ...provider,
                        type: event.target.value as ProviderCredential["type"],
                      }))
                    }
                    className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                  >
                    <option value="openai_compatible">openai_compatible</option>
                    <option value="openai">openai</option>
                    <option value="ollama">ollama</option>
                  </select>
                </div>
                <div>
                  <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                    Default Model
                  </label>
                  <input
                    value={selectedProvider.defaultModel}
                    onChange={(event) =>
                      updateSelectedProvider((provider) => ({
                        ...provider,
                        defaultModel: event.target.value,
                      }))
                    }
                    className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                  />
                </div>
                <div className="col-span-2">
                  <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                    Base URL
                  </label>
                  <input
                    value={selectedProvider.baseUrl ?? ""}
                    onChange={(event) =>
                      updateSelectedProvider((provider) => ({
                        ...provider,
                        baseUrl: event.target.value || undefined,
                      }))
                    }
                    className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                  />
                </div>
                <div className="col-span-2">
                  <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                    API Key
                  </label>
                  <input
                    value={selectedProvider.apiKey ?? ""}
                    onChange={(event) =>
                      updateSelectedProvider((provider) => ({
                        ...provider,
                        apiKey: event.target.value,
                      }))
                    }
                    className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                  />
                  <div className={cn("mt-2 text-xs", mutedClass(theme))}>
                    Stored locally. Current value: {maskKey(selectedProvider.apiKey)}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className={cn("text-xs uppercase tracking-[0.22em]", subtleClass(theme))}>
                    Custom Headers JSON
                  </label>
                  <textarea
                    rows={4}
                    value={providerHeadersText}
                    onChange={(event) => {
                      setProviderHeadersText(event.target.value);
                      setProviderHeadersError("");
                    }}
                    className={cn("mt-2 w-full rounded-2xl border px-4 py-3 text-sm outline-none", inputClass(theme))}
                  />
                  <div
                    className={cn(
                      "mt-2 text-xs",
                      providerHeadersError ? "text-rose-400" : mutedClass(theme),
                    )}
                  >
                    {providerHeadersError || "Use this for vendor-specific auth or routing headers."}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setProviderModalOpen(false)}
                  className={cn("rounded-full border px-4 py-2 text-sm", inputClass(theme))}
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    const ok = await saveSelectedProvider();
                    if (ok) {
                      setProviderModalOpen(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-100"
                >
                  <Save className="h-4 w-4" />
                  Save Provider
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ReactFlowProvider>
  );
}
