import { executeWorkflow } from "@agent-studio/orchestrator";
import type { RunEvent, RunRecord } from "@agent-studio/shared";
import {
  addRunEvent,
  createRun,
  getRun,
  getWorkflow,
  listAgents,
  listProviders,
  updateRun,
} from "./db";

type Listener = (event: RunEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __agentStudioRuntime:
    | {
        listeners: Map<string, Set<Listener>>;
      }
    | undefined;
}

function getState() {
  if (!global.__agentStudioRuntime) {
    global.__agentStudioRuntime = {
      listeners: new Map(),
    };
  }
  return global.__agentStudioRuntime;
}

function publish(event: RunEvent) {
  const listeners = getState().listeners.get(event.runId);
  if (!listeners) {
    return;
  }
  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeToRun(runId: string, listener: Listener) {
  const state = getState();
  const listeners = state.listeners.get(runId) ?? new Set<Listener>();
  listeners.add(listener);
  state.listeners.set(runId, listeners);

  return () => {
    const current = state.listeners.get(runId);
    current?.delete(listener);
    if (current && current.size === 0) {
      state.listeners.delete(runId);
    }
  };
}

export async function startWorkflowRun(
  workflowId: string,
  input: Record<string, string>,
) {
  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found.`);
  }

  const runId = crypto.randomUUID();
  const placeholder: RunRecord = {
    id: runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "running",
    input,
    startedAt: new Date().toISOString(),
    nodes: workflow.nodes.map((node) => ({
      nodeId: node.id,
      status: "idle",
    })),
  };

  createRun(placeholder);

  void executeWorkflow({
    workflow,
    agents: listAgents(),
    providers: listProviders(),
    runId,
    input,
    onEvent: async (event) => {
      addRunEvent(event);
      publish(event);
    },
  })
    .then((result) => {
      updateRun({
        ...placeholder,
        status: result.status,
        output: result.output,
        completedAt: result.completedAt,
        nodes: result.nodes,
      });
    })
    .catch((error) => {
      updateRun({
        ...placeholder,
        status: "failed",
        completedAt: new Date().toISOString(),
        nodes: placeholder.nodes.map((node) => ({
          ...node,
          status: node.status === "idle" ? "failed" : node.status,
        })),
        output: error instanceof Error ? error.message : "Run failed",
      });
    });

  return getRun(runId);
}
