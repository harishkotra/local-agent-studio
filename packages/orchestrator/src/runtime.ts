import type {
  AgentProfile,
  ProviderCredential,
  RunEvent,
  RunNodeState,
  RunRecord,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@agent-studio/shared";
import { createChatModelAdapter } from "./providers";

type ExecutionDependencies = {
  workflow: WorkflowDefinition;
  agents: AgentProfile[];
  providers: ProviderCredential[];
  runId: string;
  input: Record<string, string>;
  onEvent: (event: RunEvent) => Promise<void> | void;
};

type ExecutionContext = {
  workflow: WorkflowDefinition;
  nodesById: Map<string, WorkflowNode>;
  incoming: Map<string, WorkflowEdge[]>;
  outgoing: Map<string, WorkflowEdge[]>;
  outputs: Map<string, unknown>;
  runNodes: Map<string, RunNodeState>;
  agentsById: Map<string, AgentProfile>;
  providersById: Map<string, ProviderCredential>;
  input: Record<string, string>;
  onEvent: (event: RunEvent) => Promise<void> | void;
  runId: string;
};

function now() {
  return new Date().toISOString();
}

function eventBase(runId: string, type: RunEvent["type"], nodeId?: string) {
  return {
    id: crypto.randomUUID(),
    runId,
    nodeId,
    type,
    timestamp: now(),
  };
}

function buildMaps(workflow: WorkflowDefinition) {
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, WorkflowEdge[]>();
  const outgoing = new Map<string, WorkflowEdge[]>();

  for (const node of workflow.nodes) {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }

  for (const edge of workflow.edges) {
    incoming.get(edge.target)?.push(edge);
    outgoing.get(edge.source)?.push(edge);
  }

  return { nodesById, incoming, outgoing };
}

function validateDag(workflow: WorkflowDefinition) {
  const { incoming, outgoing } = buildMaps(workflow);
  const inDegree = new Map<string, number>();
  const queue: string[] = [];
  for (const node of workflow.nodes) {
    const degree = incoming.get(node.id)?.length ?? 0;
    inDegree.set(node.id, degree);
    if (degree === 0) {
      queue.push(node.id);
    }
  }

  let visited = 0;
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    visited += 1;
    for (const edge of outgoing.get(nodeId) ?? []) {
      const next = (inDegree.get(edge.target) ?? 0) - 1;
      inDegree.set(edge.target, next);
      if (next === 0) {
        queue.push(edge.target);
      }
    }
  }

  if (visited !== workflow.nodes.length) {
    throw new Error("Workflow must be a DAG for this MVP.");
  }
}

function buildPrompt(
  node: Extract<WorkflowNode, { type: "agent" }>,
  upstreamOutputs: Array<{ from: string; output: unknown }>,
  input: Record<string, string>,
) {
  const upstreamBlock = upstreamOutputs
    .map(
      ({ from, output }) =>
        `Upstream node ${from} output:\n${typeof output === "string" ? output : JSON.stringify(output, null, 2)}`,
    )
    .join("\n\n");

  const inputBlock = Object.entries(input)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  return [node.data.prompt, inputBlock ? `Inputs:\n${inputBlock}` : "", upstreamBlock]
    .filter(Boolean)
    .join("\n\n");
}

function interpolate(template: string, context: Record<string, unknown>) {
  return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const value = context[key.trim()];
    if (value == null) {
      return "";
    }
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

async function executeNode(
  node: WorkflowNode,
  context: ExecutionContext,
): Promise<{ output?: unknown; failed?: string; route?: string }> {
  const state = context.runNodes.get(node.id)!;
  state.status = "running";
  state.startedAt = now();
  await context.onEvent({
    ...eventBase(context.runId, "started", node.id),
    message: `${node.label} started`,
  });

  const upstreamOutputs = (context.incoming.get(node.id) ?? []).map((edge) => ({
    from: edge.source,
    output: context.outputs.get(edge.source),
  }));

  try {
    switch (node.type) {
      case "input": {
        const variableMap = Object.fromEntries(
          node.data.variables.map((name) => [name, context.input[name] ?? ""]),
        );
        const output = interpolate(node.data.text, variableMap);
        return { output };
      }
      case "agent": {
        const agent = context.agentsById.get(node.data.agentProfileId);
        if (!agent) {
          throw new Error(`Unknown agent profile: ${node.data.agentProfileId}`);
        }
        const provider = context.providersById.get(agent.providerId);
        if (!provider) {
          throw new Error(`Unknown provider: ${agent.providerId}`);
        }
        const adapter = createChatModelAdapter(provider, agent);
        const prompt = buildPrompt(node, upstreamOutputs, context.input);
        const result = await adapter.generate(
          [
            { role: "system", content: agent.systemPrompt },
            { role: "user", content: prompt },
          ],
          {
            temperature: agent.temperature,
            maxTokens: agent.maxTokens,
            onDelta: async (delta) => {
              await context.onEvent({
                ...eventBase(context.runId, "stream_delta", node.id),
                message: delta,
              });
            },
          },
        );
        return { output: result.text };
      }
      case "router": {
        const rawInput = upstreamOutputs.map((item) => item.output).join("\n");
        try {
          const parsed = JSON.parse(String(rawInput)) as { route?: string };
          return { output: parsed, route: parsed.route ?? node.data.defaultRoute };
        } catch {
          return {
            output: { route: node.data.defaultRoute, raw: rawInput },
            route: node.data.defaultRoute,
          };
        }
      }
      case "http_tool": {
        const body = node.data.bodyTemplate
          ? interpolate(
              node.data.bodyTemplate,
              Object.fromEntries(upstreamOutputs.map((item) => [item.from, item.output])),
            )
          : undefined;
        const response = await fetch(node.data.url, {
          method: node.data.method,
          headers: {
            "Content-Type": "application/json",
            ...node.data.headers,
          },
          body: node.data.method === "POST" ? body : undefined,
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`HTTP tool failed (${response.status}): ${text}`);
        }
        return { output: text };
      }
      case "output": {
        const payload = upstreamOutputs
          .map(({ from, output }) => `## ${from}\n${typeof output === "string" ? output : JSON.stringify(output, null, 2)}`)
          .join("\n\n");
        const output = node.data.template
          ? `${node.data.template}\n\n${payload}`
          : payload;
        return { output };
      }
    }
  } catch (error) {
    return {
      failed: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}

export async function executeWorkflow(
  dependencies: ExecutionDependencies,
): Promise<RunRecord> {
  validateDag(dependencies.workflow);

  const { nodesById, incoming, outgoing } = buildMaps(dependencies.workflow);
  const runNodes = new Map<string, RunNodeState>(
    dependencies.workflow.nodes.map((node) => [
      node.id,
      {
        nodeId: node.id,
        status: "idle",
      },
    ]),
  );

  const context: ExecutionContext = {
    workflow: dependencies.workflow,
    nodesById,
    incoming,
    outgoing,
    outputs: new Map(),
    runNodes,
    agentsById: new Map(dependencies.agents.map((agent) => [agent.id, agent])),
    providersById: new Map(
      dependencies.providers.map((provider) => [provider.id, provider]),
    ),
    input: dependencies.input,
    onEvent: dependencies.onEvent,
    runId: dependencies.runId,
  };

  const startNode = dependencies.workflow.nodes.find(
    (node) => (incoming.get(node.id)?.length ?? 0) === 0,
  );
  if (!startNode) {
    throw new Error("Workflow has no start node.");
  }

  const remainingDeps = new Map<string, number>();
  const ready = new Set<string>();
  for (const node of dependencies.workflow.nodes) {
    const count = incoming.get(node.id)?.length ?? 0;
    remainingDeps.set(node.id, count);
    if (count === 0) {
      ready.add(node.id);
    }
  }

  const routeSelections = new Map<string, string>();
  let failed = false;
  let finalOutput: unknown;

  while (ready.size > 0 && !failed) {
    const batch = Array.from(ready);
    ready.clear();

    await Promise.all(
      batch.map(async (nodeId) => {
        const node = nodesById.get(nodeId)!;
        const state = runNodes.get(nodeId)!;
        state.status = "queued";
        await dependencies.onEvent({
          ...eventBase(dependencies.runId, "queued", nodeId),
          message: `${node.label} queued`,
        });

        const result = await executeNode(node, context);

        if (result.failed) {
          state.status = "failed";
          state.error = result.failed;
          state.completedAt = now();
          failed = true;
          await dependencies.onEvent({
            ...eventBase(dependencies.runId, "failed", nodeId),
            message: result.failed,
          });
          return;
        }

        state.status = "completed";
        state.output = result.output;
        state.completedAt = now();
        context.outputs.set(nodeId, result.output);
        if (node.type === "output") {
          finalOutput = result.output;
        }
        if (node.type === "router") {
          routeSelections.set(node.id, result.route ?? node.data.defaultRoute);
        }

        await dependencies.onEvent({
          ...eventBase(dependencies.runId, "completed", nodeId),
          message: `${node.label} completed`,
          output: result.output,
        });

        for (const edge of outgoing.get(nodeId) ?? []) {
          if (node.type === "router") {
            const route = routeSelections.get(node.id);
            if (edge.label && edge.label !== route) {
              continue;
            }
          }

          const next = (remainingDeps.get(edge.target) ?? 1) - 1;
          remainingDeps.set(edge.target, next);
          if (next === 0) {
            ready.add(edge.target);
          }
        }
      }),
    );
  }

  const run: RunRecord = {
    id: dependencies.runId,
    workflowId: dependencies.workflow.id,
    workflowName: dependencies.workflow.name,
    status: failed ? "failed" : "completed",
    input: dependencies.input,
    output: finalOutput,
    startedAt: now(),
    completedAt: now(),
    nodes: Array.from(runNodes.values()),
  };

  return run;
}
