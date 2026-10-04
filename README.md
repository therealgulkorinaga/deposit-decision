# Depositcheck

Irish rental-deposit UI prototype with a Next.js / TypeScript backend environment.

## Run locally

Use Node 24+ (see `.nvmrc`).

```sh
npm install
npm run env:check
npm run db:init
npm run dev
```

Open http://127.0.0.1:5173. Copy `.env.local.example` to `.env.local` when configuring your own environment. A blank OpenAI key is valid for this step. No SDK calls are made.

## Verify

```sh
npm run lint
npm test
npm run build
npm run check:client
```

`npm start` serves the production build on the same local address.

## Mock demonstration

Choose **Try an example case**, follow the steps to **Worth pursuing**, then **Add new evidence → Add landlord evidence → Review my case → Reassess my position** to see **Uncertain**. The UI remains session-only and uses mock assessments, rules, case references and extraction. Files are not uploaded. Messages are not sent.

## Backend setup

Public document ingestion is implemented; retrieval, assessment, evidence orchestration and reassessment still return HTTP 501. Local SQLite repositories support cases, evidence metadata and public-document metadata. `POST /api/cases` and `GET /api/cases/[caseId]` exercise case persistence; `GET /api/health` verifies readiness. The existing UI is not connected to these APIs yet.

## Public data ingestion

Drop PDF, HTML, TXT or JSON documents into `data/raw/`, with optional `<filename>.meta.json` source metadata, then run:

```sh
npm run ingest
```

The command works without the frontend or any API key. Processed JSON and a provenance manifest are written to `data/processed/`; reruns skip unchanged documents. `npm run seed:public` optionally downloads the six verified public RTB sources (five case reports and an evidence guide). Local data is gitignored.

See [ingestion instructions](docs/INGESTION.md) for sources, manual downloads, output format, provenance, recovery and the current genuine corpus.

See [architecture](docs/ARCHITECTURE.md) for the planned pipeline, boundaries, environment and API details, and [UI logic](docs/UI_LOGIC.md) for the existing mock flow.
