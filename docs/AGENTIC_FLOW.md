# Bounded interpretation flow and demo handoff

## Architecture

UI → Case State → Ingestion → Ontology → Issue Mapping → Retrieval → Decision Graph → Agentic Interpretation / Explanation → Verification → Assessment.

The actual fixed execution order interprets documents before running the graph: extraction → classification → conservative ontology merge → issue mapping → rule retrieval → prior-report retrieval → per-issue analysis → graph → explanation selection → verification. A preliminary graph planning pass creates the required issues; the final pass receives checked analysis references. Models cannot create graph nodes or override the final position.

`src/agents/orchestrator.ts` is the sole orchestrator. Each stage has a strict Zod contract. `openai.ts` uses the server-only SDK and [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). `offline-demo.ts` implements the same contracts for explicitly fictional presentation documents. It extracts an invoice amount from fixture content; it has no position-setting logic.

## Deterministic components

Code validates inputs, converts amounts to cents, ingests PDF/HTML/TXT/JSON documents, checks exact source quotations and references, preserves competing assertions, checks invoice face values, creates graph issues, verifies corpus checksums, retrieves source passages, executes the existing graph, enforces confidence limits and formats the result. Candidate interpretations do not silently overwrite confirmed facts. An invoice amount does not establish authenticity, payment or tenant liability.

## AI components

1. Candidate fact extraction: typed value, assertion party, source document, quote, evidence reference and confidence.
2. Evidence classification: type, role, deduction relevance and proposed supports/contradicts/informs relations.
3. Issue mapping: selections from the graph's existing allowed issue types.
4. Per-issue analysis: tenant/landlord factors, sourced rules, distinctions from real cases and missing questions. No overall position field.
5. Explanation selection: chooses code-approved sentence IDs and verified source IDs. No free-form legal claims or editable arithmetic.
6. Verification: checks the proposal against the graph. Rejected or unavailable verification falls back to deterministic graph-derived language and removes proposed citations.

The presentation uses the offline adapter. Live OpenAI configuration is intentionally not required or exercised for the demo. Images can be submitted to the live adapter, but the offline example uses labelled textual descriptions of illustrative photographs, not computer vision.

## Retrieval and provenance

Only complete active ingestion manifests are loaded. Processed-file hashes, source identity and exact chunk offsets/page/section membership are checked. Rules and case reports are retrieved separately with deterministic lexical matching and one best passage per document. Tribunal reports retain their actual report type. The existing reviewed rule catalogue is available only when its original source excerpts remain in the validated local corpus.

Current prepared corpus:

- RTB Guide to evidence
- RTB Security deposits
- TR0001016
- TR0225-008504
- TR0519-003760
- TR0625-008843
- TR1219-004124

The local raw and processed dataset remains gitignored. A new clone needs the source corpus and matching reviewed catalogue. Do not rebuild the corpus immediately before presenting; the prepared checkout already has the verified sources.

## Reassessment

New or changed document fingerprints trigger extraction/classification only for those documents. Removed documents invalidate their candidates. Issue fingerprints include relevant facts/evidence, corpus identity and date. Unchanged issue retrieval/analysis is reused. The deterministic graph reruns to avoid stale final decisions. The return includes previous/new position, previous/new confidence and changed factors. Both snapshots and their complete debug traces are saved as separate local runs.

The single-click presentation action adds the €700 painting invoice and landlord photograph fixture to case state, submits the new state, and displays the backend's recomputed result. The initial outcome is Worth pursuing / Medium; the updated outcome is Uncertain / Medium. The €1,000 amount remains unchanged. The before/after panel is driven by returned assessment objects, not a UI-only badge toggle.

## Inspect and test

Run `npm run flow:inspect -- RUN_UUID` to inspect extracted facts, classifications, issue mapping, retrieved sources, analyses, graph trace, affected issues and verification. These details are not included in the consumer API response. Run files are stored locally with restrictive file permissions and integrity hashes.

The prepared corpus passes the 52-test suite, including initial assessment, changed evidence, source provenance, verifier rejection, cache reuse, evidence removal and the local HTTP origin guard. Browser verification covered the same steps and visible RTB links. Live model accuracy is unverified because no key is configured.

## Known limits and the next 30 minutes

This is a local single-user prototype. No production authentication or multi-user storage. Uploaded files and debug records remain on this computer. Text PDFs are supported; scanned PDF OCR is not. Model facts remain candidates except narrowly code-checked invoice face values. No automated source text becomes authoritative legislation. The source catalogue is curated and has explicit review dates. Prior-case excerpts provide context, not binding predictions.

With another 30 minutes: add a one-click reset/replay; shorten the guided intake for presentations; add a few adversarial extraction/verification fixtures; validate live structured-output calls only if a key is already available. Avoid new model infrastructure or broader ingestion before the demo.
