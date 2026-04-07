# Agent Studio

Local-first OSS agent orchestration studio built with Next.js, React Flow, TypeScript, and SQLite.

## Features

- React Flow canvas for DAG-based orchestrations
- Local SQLite persistence for providers, agents, workflows, runs, and events
- Provider abstraction for Ollama, OpenAI, and OpenAI-compatible APIs like Featherless.ai
- In-process orchestration runtime with streaming run events over SSE
- Import/export of workflows, agents, and providers as JSON
- Demo coordinator/worker workflow seeded on first launch

## Workspace

- `apps/web`: Next.js studio UI, API routes, SQLite persistence, SSE endpoints
- `packages/shared`: Zod schemas and shared types
- `packages/orchestrator`: Provider adapters and DAG execution runtime

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Verify

```bash
npm run build
npm test
```

## Notes

- SQLite data is stored in `apps/web/data/studio.db`.
- Ollama should expose an OpenAI-compatible endpoint such as `http://127.0.0.1:11434/v1`.
- Featherless.ai works through the `openai_compatible` provider type.
