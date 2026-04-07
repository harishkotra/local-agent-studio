"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addEdge,
  Background,
  ConnectionLineType,
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
  Play,
  Plus,
  Save,
  Server,
  Sparkles,
  Upload,
} from "lucide-react";
import { AgentNode } from "./agent-node";
import { cn } from "@/lib/utils";

type StudioNodeData = {
  label: string;
  description: string;
  kind: WorkflowNode["type"];
  status?: "idle" | "queued" | "running" | "completed" | "failed" | "skipped";
  agent?: AgentProfile;
  provider?: ProviderCredential;
  subtitle?: string;
  tools?: string[];
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
): Node<StudioNodeData> {
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
      subtitle: agent ? `${agent.model} · ${provider?.name ?? "provider"}` : node.type,
      tools:
        node.type === "agent"
          ? agent?.allowedTools
          : node.type === "http_tool"
            ? ["http", "fetch"]
            : [],
    },
  };
}

function workflowToFlow(
  workflow: WorkflowDefinition,
  agents: AgentProfile[],
  providers: ProviderCredential[],
  statuses: Record<string, StudioNodeData["status"]> = {},
) {
  const nodes = workflow.nodes.map((node) =>
    asFlowNode(node, agents, providers, statuses),
  );
  const edges: Edge[] = workflow.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: statuses[edge.source] === "running",
    type: "smoothstep",
    style: {
      stroke: statuses[edge.source] === "running" ? "#7c7cff" : "rgba(255,255,255,0.09)",
      strokeWidth: statuses[edge.source] === "running" ? 2.5 : 1.6,
    },
  }));

  return { nodes, edges };
}

function flowToWorkflow(
  base: WorkflowDefinition,
  nodes: Node<StudioNodeData>[],
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

export function StudioShell() {
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, StudioNodeData["status"]>>(
    {},
  );
  const [isPending, startTransition] = useTransition();

  const workflow =
    snapshot?.workflows.find((item) => item.id === selectedWorkflowId) ??
    snapshot?.workflows[0] ??
    sampleWorkflow;

  const [nodes, setNodes, onNodesChange] = useNodesState<StudioFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const loadStudioRef = useRef<() => Promise<void>>(async () => undefined);

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
  };

  useEffect(() => {
    void loadStudioRef.current();
  }, []);

  useEffect(() => {
    if (!workflow || !snapshot) {
      return;
    }
    const flow = workflowToFlow(
      workflow,
      snapshot.agents,
      snapshot.providers,
      nodeStatuses,
    );
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSelectedNodeId((current) => current || flow.nodes[0]?.id || "");
  }, [workflow, snapshot, nodeStatuses, setEdges, setNodes]);

  const selectedNode = useMemo(
    () => workflow?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [workflow, selectedNodeId],
  );

  const selectedFlowNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const onConnect = useMemo<OnConnect>(
    () => (connection) =>
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: crypto.randomUUID(),
            type: "smoothstep",
            animated: false,
            style: { stroke: "rgba(255,255,255,0.09)", strokeWidth: 1.6 },
          },
          current,
        ),
      ),
    [setEdges],
  );

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
    setSnapshot((current) =>
      current
        ? {
            ...current,
            workflows: current.workflows.map((item) =>
              item.id === saved.id ? saved : item,
            ),
          }
        : current,
    );
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
    setSnapshot((current) =>
      current
        ? {
            ...current,
            workflows: current.workflows.map((item) =>
              item.id === workflow.id ? nextWorkflow : item,
            ),
          }
        : current,
    );
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
            agentProfileId: snapshot?.agents[0]?.id ?? "",
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

    setSnapshot((current) =>
      current
        ? {
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
          }
        : current,
    );
    setSelectedNodeId(id);
  }

  async function createAgent() {
    if (!snapshot?.providers[0]) {
      return;
    }
    const now = new Date().toISOString();
    const agent: AgentProfile = {
      id: crypto.randomUUID(),
      name: `Worker ${snapshot.agents.length + 1}`,
      description: "New agent profile",
      role: "worker",
      providerId: snapshot.providers[0].id,
      model: snapshot.providers[0].defaultModel,
      systemPrompt: "You are a helpful worker agent.",
      temperature: 0.4,
      maxTokens: 800,
      outputMode: "text",
      allowedTools: [],
      avatar: "🤖",
      createdAt: now,
      updatedAt: now,
    };
    await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agent),
    });
    await loadStudioRef.current();
  }

  async function createProvider() {
    const now = new Date().toISOString();
    const provider: ProviderCredential = {
      id: crypto.randomUUID(),
      name: "Custom OpenAI-Compatible",
      type: "openai_compatible",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      defaultModel: "model-name",
      createdAt: now,
      updatedAt: now,
    };
    await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider),
    });
    await loadStudioRef.current();
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
            setNodeStatuses((current) => ({
              ...current,
              [event.nodeId!]:
                event.type === "queued"
                  ? "queued"
                  : event.type === "started"
                    ? "running"
                    : event.type === "completed"
                      ? "completed"
                      : event.type === "failed"
                        ? "failed"
                        : current[event.nodeId!] ?? "running",
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(85,99,255,0.18),_transparent_30%),linear-gradient(180deg,_#0b0b14_0%,_#090910_100%)] text-white">
        <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 p-4">
          <aside className="flex w-[320px] shrink-0 flex-col gap-4">
            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-white/30">
                    Agents
                  </div>
                  <div className="mt-1 text-2xl font-medium">
                    {snapshot?.agents.length ?? 0}
                  </div>
                </div>
                <button
                  onClick={createAgent}
                  className="rounded-full border border-indigo-400/25 bg-indigo-500/10 p-2 text-indigo-100 transition hover:bg-indigo-500/20"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {snapshot?.agents.map((agent) => {
                  const provider = snapshot.providers.find(
                    (item) => item.id === agent.providerId,
                  );
                  return (
                    <div
                      key={agent.id}
                      className="rounded-2xl border border-white/8 bg-black/20 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-slate-950">
                          {agent.avatar || "🤖"}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{agent.name}</div>
                          <div className="truncate text-xs text-white/35">
                            {agent.model} · {provider?.name}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.3em] text-white/30">
                  Providers
                </div>
                <button
                  onClick={createProvider}
                  className="rounded-full border border-white/8 bg-white/[0.04] p-2 text-white/70 transition hover:bg-white/[0.08]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {snapshot?.providers.map((provider) => (
                  <div
                    key={provider.id}
                    className="rounded-2xl border border-white/8 bg-black/20 p-3"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Server className="h-4 w-4 text-cyan-300" />
                      {provider.name}
                    </div>
                    <div className="mt-1 text-xs text-white/35">
                      {provider.type} · {provider.defaultModel}
                    </div>
                    <div className="mt-2 text-xs text-white/45">
                      key {maskKey(provider.apiKey)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.3em] text-white/30">
                  Runs
                </div>
                <div className="rounded-full border border-white/8 px-2 py-1 text-[10px] uppercase tracking-[0.28em] text-white/30">
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
                    className="w-full rounded-2xl border border-white/8 bg-black/20 p-3 text-left transition hover:border-indigo-400/30"
                  >
                    <div className="truncate text-sm font-medium">{run.workflowName}</div>
                    <div className="mt-1 text-xs text-white/35">{run.status}</div>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col gap-4">
            <header className="flex items-center justify-between rounded-[28px] border border-white/8 bg-white/[0.03] px-5 py-4 backdrop-blur-xl">
              <div>
                <div className="text-xs uppercase tracking-[0.32em] text-white/30">
                  Agent Studio
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <select
                    value={selectedWorkflowId}
                    onChange={(event) => setSelectedWorkflowId(event.target.value)}
                    className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm outline-none"
                  >
                    {snapshot?.workflows.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-white/35">
                    React Flow canvas, local SQLite, streaming runtime
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => addNode("agent")}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80 transition hover:bg-white/[0.08]"
                >
                  <Bot className="h-4 w-4" />
                  Add Agent
                </button>
                <button
                  onClick={saveWorkflow}
                  className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-100 transition hover:bg-indigo-500/20"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  onClick={startRun}
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:brightness-105 disabled:opacity-60"
                >
                  <Play className="h-4 w-4" />
                  Run
                </button>
                <button
                  onClick={exportStudio}
                  className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/75"
                >
                  <Download className="h-4 w-4" />
                </button>
                <label className="cursor-pointer rounded-full border border-white/10 bg-white/[0.04] p-2 text-white/75">
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
              <section className="relative min-h-[760px] overflow-hidden rounded-[30px] border border-white/8 bg-[#090912]/95 shadow-[0_40px_80px_rgba(0,0,0,0.45)]">
                <div className="absolute left-4 top-4 z-10 flex gap-2">
                  {(["input", "router", "http_tool", "output"] as WorkflowNode["type"][]).map(
                    (type) => (
                      <button
                        key={type}
                        onClick={() => addNode(type)}
                        className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs uppercase tracking-[0.22em] text-white/55 transition hover:border-indigo-400/25 hover:text-white"
                      >
                        {type}
                      </button>
                    ),
                  )}
                </div>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  connectionLineType={ConnectionLineType.SmoothStep}
                  fitView
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  defaultEdgeOptions={{
                    type: "smoothstep",
                    style: { stroke: "rgba(255,255,255,0.12)", strokeWidth: 1.6 },
                  }}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="rgba(255,255,255,0.06)" gap={28} size={1.1} />
                  <MiniMap
                    pannable
                    zoomable
                    nodeColor={() => "#5864ff"}
                    maskColor="rgba(8, 8, 15, 0.78)"
                    className="!bottom-4 !left-4 !h-28 !w-44 !rounded-2xl !border !border-white/8 !bg-black/45"
                  />
                  <Controls
                    className="[&>button]:!border-white/8 [&>button]:!bg-black/45 [&>button]:!text-white/70"
                    showInteractive={false}
                  />
                </ReactFlow>
              </section>

              <aside className="flex min-h-[760px] flex-col gap-4">
                <section className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5 backdrop-blur-xl">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-white/30">
                    <Sparkles className="h-4 w-4" />
                    Inspector
                  </div>
                  {selectedNode && selectedFlowNode ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className="text-xs uppercase tracking-[0.25em] text-white/30">
                          Name
                        </label>
                        <input
                          value={selectedFlowNode.data.label}
                          onChange={(event) => {
                            setNodes((current) =>
                              current.map((node) =>
                                node.id === selectedNodeId
                                  ? {
                                      ...node,
                                      data: { ...node.data, label: event.target.value },
                                    }
                                  : node,
                              ),
                            );
                            updateSelectedNode((node) => ({
                              ...node,
                              label: event.target.value,
                            }));
                          }}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-xs uppercase tracking-[0.25em] text-white/30">
                          Description
                        </label>
                        <textarea
                          value={selectedFlowNode.data.description}
                          onChange={(event) => {
                            setNodes((current) =>
                              current.map((node) =>
                                node.id === selectedNodeId
                                  ? {
                                      ...node,
                                      data: {
                                        ...node.data,
                                        description: event.target.value,
                                      },
                                    }
                                  : node,
                              ),
                            );
                            updateSelectedNode((node) => ({
                              ...node,
                              description: event.target.value,
                            }));
                          }}
                          rows={3}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                        />
                      </div>

                      {selectedNode.type === "agent" && (
                        <>
                          <div>
                            <label className="text-xs uppercase tracking-[0.25em] text-white/30">
                              Agent Profile
                            </label>
                            <select
                              value={selectedNode.data.agentProfileId}
                              onChange={(event) =>
                                updateSelectedNode((node) =>
                                  node.type === "agent"
                                    ? {
                                        ...node,
                                        data: {
                                          ...node.data,
                                          agentProfileId: event.target.value,
                                        },
                                      }
                                    : node,
                                )
                              }
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                            >
                              {snapshot?.agents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                  {agent.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs uppercase tracking-[0.25em] text-white/30">
                              Prompt
                            </label>
                            <textarea
                              value={selectedNode.data.prompt}
                              onChange={(event) =>
                                updateSelectedNode((node) =>
                                  node.type === "agent"
                                    ? {
                                        ...node,
                                        data: { ...node.data, prompt: event.target.value },
                                      }
                                    : node,
                                )
                              }
                              rows={6}
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                            />
                          </div>
                        </>
                      )}

                      {selectedNode.type === "input" && (
                        <div>
                          <label className="text-xs uppercase tracking-[0.25em] text-white/30">
                            Input Text
                          </label>
                          <textarea
                            value={selectedNode.data.text}
                            onChange={(event) =>
                              updateSelectedNode((node) =>
                                node.type === "input"
                                  ? {
                                      ...node,
                                      data: { ...node.data, text: event.target.value },
                                    }
                                  : node,
                              )
                            }
                            rows={6}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                          />
                        </div>
                      )}

                      {selectedNode.type === "router" && (
                        <div>
                          <label className="text-xs uppercase tracking-[0.25em] text-white/30">
                            Instructions
                          </label>
                          <textarea
                            value={selectedNode.data.instructions}
                            onChange={(event) =>
                              updateSelectedNode((node) =>
                                node.type === "router"
                                  ? {
                                      ...node,
                                      data: {
                                        ...node.data,
                                        instructions: event.target.value,
                                      },
                                    }
                                  : node,
                              )
                            }
                            rows={4}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                          />
                        </div>
                      )}

                      {selectedNode.type === "http_tool" && (
                        <>
                          <div>
                            <label className="text-xs uppercase tracking-[0.25em] text-white/30">
                              URL
                            </label>
                            <input
                              value={selectedNode.data.url}
                              onChange={(event) =>
                                updateSelectedNode((node) =>
                                  node.type === "http_tool"
                                    ? {
                                        ...node,
                                        data: { ...node.data, url: event.target.value },
                                      }
                                    : node,
                                )
                              }
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs uppercase tracking-[0.25em] text-white/30">
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
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                            >
                              <option value="GET">GET</option>
                              <option value="POST">POST</option>
                            </select>
                          </div>
                        </>
                      )}

                      {selectedNode.type === "output" && (
                        <div>
                          <label className="text-xs uppercase tracking-[0.25em] text-white/30">
                            Template
                          </label>
                          <textarea
                            value={selectedNode.data.template}
                            onChange={(event) =>
                              updateSelectedNode((node) =>
                                node.type === "output"
                                  ? {
                                      ...node,
                                      data: { ...node.data, template: event.target.value },
                                    }
                                  : node,
                              )
                            }
                            rows={5}
                            className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 text-sm text-white/40">
                      Select a node on the canvas to configure it.
                    </div>
                  )}
                </section>

                <section className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-white/8 bg-white/[0.03] p-5 backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-[0.32em] text-white/30">
                      Run Trace
                    </div>
                    {selectedRun && (
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
                    )}
                  </div>
                  <div className="mt-4 space-y-3 overflow-y-auto pr-1">
                    {events.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-white/35">
                        Start a run to stream node activity and outputs here.
                      </div>
                    ) : (
                      events.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-2xl border border-white/8 bg-black/20 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs uppercase tracking-[0.22em] text-white/30">
                              {event.type}
                            </div>
                            <div className="text-[11px] text-white/25">
                              {event.nodeId || "run"}
                            </div>
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/75">
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
      </div>
    </ReactFlowProvider>
  );
}
