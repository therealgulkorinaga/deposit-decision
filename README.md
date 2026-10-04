# Depositcheck / Verdict

Evidence-led Irish rental deposit assessment with a working offline hackathon demo.

## Run the presentation

Use the prepared checkout and keep its local `data/` directory. Node 24+.

```sh
cd /Users/arkoganguli/Projects/deposit-decision
npm run build
npm start
```

**Exact demo:** Try an example case → Continue to evidence → Review my case → Assess my position. Show **€1,000 in dispute / Worth pursuing / Medium** and the three RTB sources. Click **Add landlord evidence** on the assessment. It adds the painting invoice and photographs, calls the backend again and prominently shows **BEFORE Worth pursuing → AFTER Uncertain**, with Medium confidence and the reasons for the change.

No OpenAI key is needed for this presentation. The fixture interpreter is labelled in the interface. It does not set the position: the existing decision graph computes both assessments. Removing the landlord evidence also recomputes the initial position.

## What is implemented

UI → Case State → private document ingestion → candidate facts and evidence classification → ontology → issue mapping → separate rule/case retrieval → issue analysis → deterministic Decision Graph → explanation → verification → assessment UI.

Application code owns calculations, jurisdiction, state updates, source identity, graph transitions, confidence limits, escalation and actions. Six bounded interpreter stages handle extraction, classification, mapping, issue analysis, explanation selection and verification. There are no open-ended loops or autonomously spawned agents.

`POST /api/assessment` is the connected workflow. Legacy Step 1 routes still return 501 and are not used by the presentation. Debug logs are local under `data/flows/`; private uploaded files are under `data/private/`. Neither is committed or returned in the consumer response.

## Optional live interpretation

Copy `.env.local.example` to `.env.local` and configure `OPENAI_API_KEY` plus `OPENAI_MODEL` on the server. The OpenAI Responses adapter uses structured output, no tools, no retries, bounded calls and `store: false`. It has not been tested with a live key in this session. Without configuration, live cases return a clear unavailable message while the example works normally. No new provider is needed.

## Sources and verification

The local corpus contains **7 genuine RTB documents**: evidence guidance, security-deposit guidance and **5 tribunal reports**. The presentation shows two guidance sources and one retrieved report. Report excerpts retain actual document IDs, URLs, pages and sections; no invented precedent cards are used.

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run check:client
npm run flow:inspect -- RUN_UUID
```

All 52 tests passed on the prepared corpus. The exact offline workflow, real-source retrieval, evidence reversal, verifier fallback and HTTP guard are tested. The full presentation sequence was also verified in the browser. Corpus-dependent tests explicitly skip when the local corpus is absent.

See [agentic flow](docs/AGENTIC_FLOW.md), [decision graph](docs/DECISION_GRAPH.md), [ontology](docs/ONTOLOGY.md), and [ingestion](docs/INGESTION.md).
