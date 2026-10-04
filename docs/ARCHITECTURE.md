# Environment and planned architecture

## Scope

Step 1 establishes a Node-backed Next.js App Router environment beneath the existing React UI. It does not implement legal reasoning, ingestion, search, a decision graph, an agent loop, OpenAI calls, or UI persistence. The mock journey and visual design remain unchanged.

## Planned pipeline

User → UI → Case State → Evidence → Domain Model → Retrieval → Decision Graph → Agentic Flow → Structured Assessment

The UI gathers user statements and selected evidence. Its current typed state lives in `src/mocks/case-state.ts`. A future adapter will translate this UI state into validated domain records and integer euro cents. Browser `File` objects will not cross JSON service boundaries; evidence metadata carries a relative file reference instead.

Next.js server API routes validate input with Zod, call a service boundary, validate successful output and return structured JSON. Domain contracts are independent of React and infrastructure. Ingestion will normalise source documents into the local dataset and SQLite public-document records. Retrieval will return source-linked rules and comparable cases. A future decision graph will represent issues, evidence and missing facts, and a later agentic flow may orchestrate tools over that graph. The final response will follow `StructuredAssessmentSchema`. Those future stages are interfaces only, not working analysis.

The current wiring ends at explicit service stubs: UI → typed local mocks remains active; API → Zod → service stubs returns 501. Actual persistence is available independently through repositories and the case API. No mock assessment is passed off as a backend result.

## Directory ownership

| Path                     | Responsibility                                                         |
| ------------------------ | ---------------------------------------------------------------------- |
| `src/app/`               | Next.js layout, page and server route handlers                         |
| `src/components/`        | Existing client UI and styles                                          |
| `src/mocks/`             | Existing UI fixtures and state; no server imports                      |
| `src/domain/`            | Pure Zod domain records and inferred TypeScript types                  |
| `src/services/`          | Six request/result contracts, typed service ports and stub composition |
| `src/ingestion/`         | Server-only document ingestion stub                                    |
| `src/retrieval/`         | Server-only rule and case retrieval stubs                              |
| `src/reasoning/`         | Server-only assessment/reassessment stubs                              |
| `src/lib/server/`        | Environment, SQLite, repositories, dataset setup and HTTP helpers      |
| `src/instrumentation.ts` | Validate server environment at Next.js startup                         |
| `data/`                  | Local raw/processed/rules/cases directories and ignored SQLite file    |
| `scripts/`               | Environment check, database init, browser-bundle secret check          |
| `tests/`                 | Mock regression, domain, environment, route and persistence tests      |

## Contracts and API routes

All POST bodies are JSON. Invalid JSON returns 400. Schema failures return 422. Unimplemented operations return 501 with `{ "error": { "code": "NOT_IMPLEMENTED", "message": "..." } }`. Unexpected failures and invalid service output return a generic 500 without stack traces, input data or environment values.

| Method / route                  | Boundary              | Current behaviour                                         |
| ------------------------------- | --------------------- | --------------------------------------------------------- |
| `POST /api/ingestion/documents` | ingest document       | Validated request, 501                                    |
| `POST /api/retrieval/cases`     | retrieve cases        | Validated query and limit, 501                            |
| `POST /api/retrieval/rules`     | retrieve rules        | Validated query and limit, 501                            |
| `POST /api/claims/assess`       | assess claim          | Validated case, claim and evidence snapshot, 501          |
| `POST /api/evidence/update`     | update evidence       | Validated case/evidence IDs and replacement metadata, 501 |
| `POST /api/claims/reassess`     | reassess claim        | Validated snapshot and previous assessment, 501           |
| `POST /api/cases`               | create local case     | Persist validated case details, 201                       |
| `GET /api/cases/[caseId]`       | load local case       | Case and evidence metadata; 404 if absent                 |
| `GET /api/health`               | environment readiness | SQLite check; 200 or 503; no secret or local path output  |

Each service has request and result schemas in `src/services/contracts.ts`; types derive from those schemas. Assess/reassess enforce matching case/claim identities and evidence references. Position and confidence stay separate, with no win percentages. Source references require HTTP(S) URLs. The API key is never part of any request or response contract.

The update-evidence orchestration remains a stub. SQLite supports creating and listing evidence metadata now; revision management and reassessment triggering are intentionally deferred. Public-document metadata can be saved through the repository, but the ingestion endpoint does not read or fetch any document.

## Local persistence

Node's built-in `node:sqlite` provides SQLite without a native third-party binding. Use Node 24+ (`.nvmrc` selects 24). `DATA_DIR/depositcheck.sqlite` contains three tables: `cases`, `evidence`, `public_documents`. IDs and the evidence→case foreign key are relational; small validated records are stored as JSON. This avoids an ORM and premature schema expansion. Reads validate stored JSON again. SQL parameters bind user-controlled values.

Startup uses an idempotent schema version 1 migration, foreign keys, WAL and a busy timeout. Database connections are closed after each local API request. Tests use temporary directories and verify close/reopen durability. `npm run db:init` creates the empty schema and dataset directories. No private files or real public documents are seeded. The actual files, database, journal and WAL files are ignored by Git.

This is a local, single-user hackathon server. Dev/start commands bind to 127.0.0.1. There is no authentication or deployment configuration; adding remote access and user isolation is a separate step. A static host or an ephemeral serverless filesystem is not suitable for this SQLite setup.

## Environment and secret boundary

Copy `.env.local.example` to `.env.local` when configuring locally:

```dotenv
OPENAI_API_KEY=
DATA_DIR=./data
```

The key may be absent or empty during environment setup because no OpenAI operation is implemented. If supplied, whitespace is rejected. A nonempty DATA_DIR is required when explicitly set; omission defaults to `./data`, resolved from the project working directory. Env validation reports invalid field names only. Next.js loads `.env.local`; CLI scripts use `@next/env` to do the same. The SDK is installed but never imported or instantiated.

Modules touching secrets, disk, SQLite or pipeline implementations import `server-only`. Next.js rejects client imports of those modules. No `NEXT_PUBLIC_` credential variable and no `next.config` environment injection are used. Client components import only UI fixtures; domain/contracts contain no environment reads. `.env*` files are ignored except the safe example.

## Verification and commands

```sh
npm install
npm run env:check
npm run db:init
npm run dev
npm run lint
npm test
npm run build
npm run check:client
```

Development stays on http://127.0.0.1:5173. Production runs with `npm start` after build. Test/CLI commands use the `react-server` condition to permit deliberate server-only module loading outside Next.js. Tests also prove importing the environment without that condition is rejected. The build's client assets are scanned for the key variable, SQLite import and a fake canary. To verify value isolation explicitly:

```sh
OPENAI_API_KEY=sk-client-boundary-test-not-a-real-key npm run build
npm run check:client
```

Tests cover all six 501 boundaries, bad JSON, schema rejection, safe internal errors, case persistence routes, foreign keys, disk durability, env validation, cross-case references and the existing mock reassessment. Reasoning outputs are contracts only; no network/model quality claim is made.

Implementation references: [Next.js server/client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components), [route handlers](https://nextjs.org/docs/app/getting-started/route-handlers), and [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).
