# Architecture

## Current boundary

The application runs on Next.js App Router and TypeScript. The existing React UI remains a client component using typed session-only mocks. A separate server-side ingestion layer now processes genuine local public documents. Retrieval, assessment, reassessment and evidence-update orchestration remain explicit 501 stubs. No legal ontology, decision graph, agent loop or OpenAI call is implemented.

## Planned pipeline

User → UI → Case State → Evidence → Domain Model → Retrieval → Decision Graph → Agentic Flow → Structured Assessment

The UI gathers statements and selected evidence. Its mock state lives in `src/mocks/case-state.ts`. A future adapter will translate it into Zod-validated domain records and integer euro cents; browser File objects will be represented by metadata and file references at service boundaries.

The real data pipeline currently ends here:

Public document → data/raw → local parser → metadata / source sections → provenance chunks → processed JSON + manifest + SQLite metadata

Later retrieval can select only source-linked chunks from the active manifest. A future graph may connect issues, facts and evidence; a later agent flow may orchestrate analysis. Neither stage exists yet. Structured assessment remains a schema contract.

## Directory ownership

| Path                     | Responsibility                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `src/app/`               | Next.js layout, page and server API routes                                            |
| `src/components/`        | Existing client UI and styles                                                         |
| `src/mocks/`             | Existing UI fixtures; independent of genuine public data                              |
| `src/domain/`            | Pure Zod domain records and inferred types                                            |
| `src/services/`          | Request/result contracts and service composition                                      |
| `src/ingestion/`         | Local parsers, conservative classification, chunking, manifests and idempotent runner |
| `src/retrieval/`         | Rule and case retrieval stubs                                                         |
| `src/reasoning/`         | Assessment/reassessment stubs                                                         |
| `src/lib/server/`        | Environment, SQLite, repositories and HTTP helpers                                    |
| `src/instrumentation.ts` | Server environment validation at startup                                              |
| `data/`                  | Ignored local raw/processed/rules/cases folders and SQLite database                   |
| `scripts/`               | Environment, database, ingestion, optional seed download and client-bundle checks     |
| `tests/`                 | UI regression, domain, environment, API, persistence and ingestion tests              |

## API contracts

POST bodies are JSON. Invalid JSON returns 400, schema rejection 422, unavailable operations 501 and unexpected failures generic 500 without secret values or stack traces.

| Method / route                  | Behaviour                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/ingestion/documents` | Accept `{ rawPath }` relative to DATA_DIR/raw; ingest a local file; 200 success, 422 file failure, 409 lock |
| `POST /api/retrieval/cases`     | Validated query/limit; 501                                                                                  |
| `POST /api/retrieval/rules`     | Validated query/limit; 501                                                                                  |
| `POST /api/claims/assess`       | Validated case/claim/evidence snapshot; 501                                                                 |
| `POST /api/evidence/update`     | Validated replacement metadata; 501                                                                         |
| `POST /api/claims/reassess`     | Snapshot and previous assessment; 501                                                                       |
| `POST /api/cases`               | Create persisted local case; 201                                                                            |
| `GET /api/cases/[caseId]`       | Load case and evidence metadata; 404 if absent                                                              |
| `GET /api/health`               | Check local SQLite readiness; no secret or path output                                                      |

Contracts derive TypeScript types from Zod. Assess/reassess enforce matching case/claim IDs and evidence references. Position and confidence remain separate. Ingestion now uses its own processed-document schema and no longer accepts the Step 1 placeholder `{ document }` payload.

## Persistence and source integrity

Node's built-in `node:sqlite` stores cases, evidence metadata and public-document metadata. Use Node 24+ (`.nvmrc` selects 24). Schema version 1 uses relational IDs/foreign keys and validated JSON records, parameterised SQL, WAL and a busy timeout. No ORM is needed.

Ingestion stores raw bytes unchanged, processed source text and chunks in JSON, and one content-addressed public-document row per byte checksum. Its manifest is the active corpus catalogue. Historical outputs and database rows are retained but must not be blindly included by future retrieval. Null source metadata is preserved instead of invented. Tribunal reports retain their own subtype rather than being misclassified as adjudication reports. See [INGESTION.md](INGESTION.md) for complete provenance, formats, duplicate handling and recovery rules.

The server is a local single-user hackathon setup bound to 127.0.0.1. User authentication and remote deployment are separate work. Persistent local SQLite requires a persistent filesystem, not a static or ephemeral serverless host.

## Environment and credentials

`.env.local.example` contains:

```dotenv
OPENAI_API_KEY=
DATA_DIR=./data
```

A blank key is valid because no OpenAI operation is implemented. A supplied key cannot contain whitespace. DATA_DIR defaults to ./data; an explicitly empty value is rejected. Validation reports field names only. Next.js loads .env.local; CLI scripts use @next/env.

Secrets, disk access, SQLite and pipeline implementations import `server-only`. Client components use only mocks. There is no NEXT_PUBLIC credential or next.config environment injection. OpenAI SDK is installed but never imported or instantiated. Private environment files, datasets and database sidecars are gitignored. Runtime data and environment files are excluded from output tracing.

## Verification

```sh
npm run env:check
npm run db:init
npm run ingest
npm run lint
npm test
npm run build
npm run typecheck
npm run check:client
```

Optional `npm run seed:public` downloads only catalogued public RTB sources, with size, host and PDF-checksum checks. It is separate from ingestion and has no anti-bot workarounds. The tests never depend on network access.

Development and production commands bind to http://127.0.0.1:5173. CLI/test commands use the react-server condition for deliberate server-module loading outside Next.js. Tests cover rejection without that condition. A production build using a fake API-key canary is scanned for credential and SQLite leakage.

References: [Next.js server/client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components), [route handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [PDF.js](https://mozilla.github.io/pdf.js/examples/), [Cheerio](https://cheerio.js.org/docs/basics/loading/).
