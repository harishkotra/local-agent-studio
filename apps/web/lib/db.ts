import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import {
  agentProfileSchema,
  providerCredentialSchema,
  runEventSchema,
  runRecordSchema,
  sampleAgents,
  sampleProviders,
  sampleWorkflow,
  workflowDefinitionSchema,
  type AgentProfile,
  type ProviderCredential,
  type RunEvent,
  type RunRecord,
  type StudioSnapshot,
  type WorkflowDefinition,
} from "@agent-studio/shared";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "studio.db");

declare global {
  // eslint-disable-next-line no-var
  var __agentStudioDb: Database.Database | undefined;
}

function getDatabase() {
  if (!global.__agentStudioDb) {
    fs.mkdirSync(dataDir, { recursive: true });
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        json TEXT NOT NULL
      );
    `);

    global.__agentStudioDb = db;
    seedIfEmpty(db);
  }

  return global.__agentStudioDb;
}

function rowToJson<T>(json: string, parser: (value: unknown) => T): T {
  return parser(JSON.parse(json));
}

function seedIfEmpty(db: Database.Database) {
  const providerCount = db.prepare("SELECT COUNT(*) as count FROM providers").get() as {
    count: number;
  };
  if (providerCount.count > 0) {
    return;
  }

  const insertProvider = db.prepare(
    "INSERT INTO providers (id, json) VALUES (@id, @json)",
  );
  const insertAgent = db.prepare("INSERT INTO agents (id, json) VALUES (@id, @json)");
  const insertWorkflow = db.prepare(
    "INSERT INTO workflows (id, json) VALUES (@id, @json)",
  );

  const tx = db.transaction(() => {
    for (const provider of sampleProviders) {
      insertProvider.run({ id: provider.id, json: JSON.stringify(provider) });
    }
    for (const agent of sampleAgents) {
      insertAgent.run({ id: agent.id, json: JSON.stringify(agent) });
    }
    insertWorkflow.run({
      id: sampleWorkflow.id,
      json: JSON.stringify(sampleWorkflow),
    });
  });

  tx();
}

function parseProvider(value: unknown) {
  return providerCredentialSchema.parse(value);
}

function parseAgent(value: unknown) {
  return agentProfileSchema.parse(value);
}

function parseWorkflow(value: unknown) {
  return workflowDefinitionSchema.parse(value);
}

function parseRun(value: unknown) {
  return runRecordSchema.parse(value);
}

function parseRunEvent(value: unknown) {
  return runEventSchema.parse(value);
}

export function listProviders(): ProviderCredential[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT json FROM providers ORDER BY id").all() as Array<{
    json: string;
  }>;
  return rows.map((row) => rowToJson(row.json, parseProvider));
}

export function upsertProvider(provider: ProviderCredential) {
  const db = getDatabase();
  const parsed = providerCredentialSchema.parse(provider);
  db.prepare(
    "INSERT INTO providers (id, json) VALUES (@id, @json) ON CONFLICT(id) DO UPDATE SET json=@json",
  ).run({ id: parsed.id, json: JSON.stringify(parsed) });
  return parsed;
}

export function listAgents(): AgentProfile[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT json FROM agents ORDER BY id").all() as Array<{
    json: string;
  }>;
  return rows.map((row) => rowToJson(row.json, parseAgent));
}

export function upsertAgent(agent: AgentProfile) {
  const db = getDatabase();
  const parsed = agentProfileSchema.parse(agent);
  db.prepare(
    "INSERT INTO agents (id, json) VALUES (@id, @json) ON CONFLICT(id) DO UPDATE SET json=@json",
  ).run({ id: parsed.id, json: JSON.stringify(parsed) });
  return parsed;
}

export function listWorkflows(): WorkflowDefinition[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT json FROM workflows ORDER BY id").all() as Array<{
    json: string;
  }>;
  return rows.map((row) => rowToJson(row.json, parseWorkflow));
}

export function getWorkflow(id: string) {
  const db = getDatabase();
  const row = db
    .prepare("SELECT json FROM workflows WHERE id = ?")
    .get(id) as { json: string } | undefined;
  return row ? rowToJson(row.json, parseWorkflow) : null;
}

export function upsertWorkflow(workflow: WorkflowDefinition) {
  const db = getDatabase();
  const parsed = workflowDefinitionSchema.parse(workflow);
  db.prepare(
    "INSERT INTO workflows (id, json) VALUES (@id, @json) ON CONFLICT(id) DO UPDATE SET json=@json",
  ).run({ id: parsed.id, json: JSON.stringify(parsed) });
  return parsed;
}

export function createRun(run: RunRecord) {
  const db = getDatabase();
  const parsed = runRecordSchema.parse(run);
  db.prepare("INSERT INTO runs (id, json) VALUES (@id, @json)").run({
    id: parsed.id,
    json: JSON.stringify(parsed),
  });
  return parsed;
}

export function updateRun(run: RunRecord) {
  const db = getDatabase();
  const parsed = runRecordSchema.parse(run);
  db.prepare("UPDATE runs SET json = @json WHERE id = @id").run({
    id: parsed.id,
    json: JSON.stringify(parsed),
  });
  return parsed;
}

export function listRuns(): RunRecord[] {
  const db = getDatabase();
  const rows = db.prepare("SELECT json FROM runs ORDER BY rowid DESC").all() as Array<{
    json: string;
  }>;
  return rows.map((row) => rowToJson(row.json, parseRun));
}

export function getRun(id: string) {
  const db = getDatabase();
  const row = db.prepare("SELECT json FROM runs WHERE id = ?").get(id) as
    | { json: string }
    | undefined;
  return row ? rowToJson(row.json, parseRun) : null;
}

export function addRunEvent(event: RunEvent) {
  const db = getDatabase();
  const parsed = runEventSchema.parse(event);
  db.prepare(
    "INSERT INTO run_events (id, run_id, json) VALUES (@id, @runId, @json)",
  ).run({
    id: parsed.id,
    runId: parsed.runId,
    json: JSON.stringify(parsed),
  });
  return parsed;
}

export function listRunEvents(runId: string) {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT json FROM run_events WHERE run_id = ? ORDER BY rowid ASC")
    .all(runId) as Array<{ json: string }>;
  return rows.map((row) => rowToJson(row.json, parseRunEvent));
}

export function exportSnapshot(): StudioSnapshot {
  return {
    providers: listProviders(),
    agents: listAgents(),
    workflows: listWorkflows(),
  };
}

export function importSnapshot(snapshot: StudioSnapshot) {
  const db = getDatabase();
  const tx = db.transaction(() => {
    for (const provider of snapshot.providers) {
      upsertProvider(provider);
    }
    for (const agent of snapshot.agents) {
      upsertAgent(agent);
    }
    for (const workflow of snapshot.workflows) {
      upsertWorkflow(workflow);
    }
  });
  tx();
}
