# Domain ontology

The canonical structured model lives in `src/domain/ontology/index.ts`; Zod schemas produce the exported TypeScript types. It is a pure, serialisable domain module with no network, database, OpenAI, agent or decision engine dependencies. `CaseSchema.parse` validates both entities and their references. Existing UI mocks and API/persistence records in `src/domain/schemas.ts` remain unchanged transport models. A future explicit adapter will map those records to this ontology; existing endpoints do not yet persist ontology snapshots.

## Entities

| Entity | Meaning and main fields |
| --- | --- |
| Case | One dispute: ID, jurisdiction, claim type, parties, claims, facts, evidence, rules, issues, decisions, actions, risks, escalations, relationships, status and optional position. Version 1. |
| Party | ID, type and display name. Tenant, landlord, property manager or other. |
| Claim | Deposit retention, claimant/respondent party IDs, claimed/disputed amounts, currency and status. Amounts use integer euro cents; disputed amount cannot exceed claimed amount. |
| Fact | A proposition with ID/type, typed value, asserting party, origin, evidence IDs, verification state, optional confidence/date and source excerpts. A fact object is not necessarily an established fact. |
| Evidence | A supplied document with ID/type, source party, document reference, date and review state/note. Document references distinguish private documents, ingested documents and visibly fictional demo placeholders. |
| Rule | A legal or guidance proposition with topic, jurisdiction, kind, effective date (null if unknown), issuing source, summary and original source excerpts. The source document ID/URL and original text live together in `sources`. |
| Issue | ID, claim ID, issue type, question and open/resolved status. |
| Decision | An authored determination record about one issue: status/outcome, supporting/adverse/unresolved fact IDs, applied rules, rationale, confidence and source references. Defining this record does not implement decision-making. |
| Action | ID, action type and specific description. |
| RiskTrigger | ID, explicit trigger description and fact references. No automated trigger evaluator exists. |
| Escalation | Trigger ID, destination, reason, required evidence types and unresolved issue ID. |

Dates are ISO dates or null; unknown dates must never be guessed. Confidence is a number from 0 to 1 or null; no scores are calculated here. Entity IDs are opaque strings, unique across a case. Public source document IDs retain ingestion UUIDs. Unknown properties are rejected.

## States and interpretation

- `asserted`: a party says it happened. This does not establish its truth.
- `corroborated`: reviewed evidence supports the proposition, without an unresolved contradictory link. This is not a guarantee of authenticity or legal sufficiency.
- `contradicted`: reviewed evidence challenges the proposition; it is contested, not automatically false. Both supporting and contradictory links can remain.
- `missing`: needed information has not been supplied. Value and confidence are null.
- `unknown`: the proposition cannot currently be stated. Value and confidence are null.

Fact origins are `party_assertion`, `document_review`, `external_case`, and `unknown`. Party assertions require an identified asserting party. External case facts require provenance. A reviewed source may support a narrowly worded fact (an invoice states €700) without supporting a broader allegation (the tenant owes €700).

Evidence types: `tenancy_agreement`, `inventory`, `photograph`, `invoice`, `bank_record`, `message`, `receipt`, `utility_record`, `witness_statement`, `other`. Review states: `unreviewed`, `reviewed`. Reviewed evidence needs a note. Uploading a document alone creates no support/contradiction relationship. `neutral` is an explicit reviewed relationship, not a default judgment about an unreviewed file. Source party identifies who originated the document; a message from the landlord can be held by the tenant.

Positions: `strong`, `worth_pursuing`, `uncertain`, `weak`, `expert_review`; null means unassessed. These values differ from legacy mock labels and must be mapped explicitly by a future adapter. Claim states: `open`, `withdrawn`, `settled`, `determined`. Case states: `draft`, `under_review`, `closed`. Decisions are `provisional` or `determined`, with outcomes `supported`, `not_supported`, `undetermined`.

Actions: `request_itemisation`, `request_invoice`, `request_photographs`, `request_inventory`, `request_deposit_return`, `escalate_to_rtb`, `obtain_expert_review`, `no_action`.

Issue types describe practical questions, including `deposit_was_retained`, `deduction_reason_identified`, `tenant_damage_occurred`, `damage_beyond_ordinary_wear`, `painting_cost_justified`, `cleaning_cost_justified`, `claimed_cost_supported`, `rent_arrears_outstanding`, and `utility_arrears_outstanding`. Fact/issue topic strings remain extensible; their values and relationship endpoints are validated.

## Relationships

| Relationship | Endpoints | Constraint |
| --- | --- | --- |
| supports / contradicts / neutral | Evidence → Fact | Evidence must be reviewed; fact evidenceIds must agree. |
| relevant_to | Fact → Issue | Both endpoints must exist in this case. |
| governs | Rule → Issue | Rule retains original source provenance. |
| resolves | Decision → Issue | Only a determined, non-undetermined decision for that issue. |
| recommends | Decision → Action | Explicit references; does not execute the action. |
| lowers_confidence | MissingFact → Decision | A Fact in missing state, listed as unresolved by that decision. No automatic score adjustment. |
| causes | RiskTrigger → Escalation | Must match the escalation trigger ID. No automatic escalation. |

`MissingFact` is a Fact with verificationState `missing`, not a second copy of the same entity. Decision fact references must also be relevant to that issue; applied rules must govern it. Duplicate IDs/relationships, dangling IDs, wrong endpoint kinds and unsupported corroboration are rejected. A resolved issue requires a determination. These checks establish structural consistency; they cannot establish truth or judge whether an invoice is persuasive.

## Provenance

Every `Source` preserves `sourceDocumentId`, `sourceUrl`, `documentTitle`, `documentType`, source date, page number, section heading, SHA-256 checksum, chunk ID, raw start/end offsets and exact original text. Null page/section/date means unavailable. Rules require at least one source; externally derived case facts and ingested evidence require provenance. Private documents use private document references, without invented public URLs.

`sourceFromChunk(processedDocument, chunkId)` adapts ingestion output and checks source identity, URL, checksum, title, type, date, text offsets, page and section membership. It refuses missing public URLs rather than inventing them. Unknown-source ingestion material remains in ingestion until its provenance is completed. Preserve every source when composing later decisions. Schema validation cannot authenticate a remote publication: use the adapter with verified ingestion output and the active manifest. No legal propositions have been invented or seeded into the demo.

## Worked demo

`createDemoCase()` returns an explicitly fictional fixture, not an RTB case. The deposit paid (€1,500), returned (€500), painting deduction (€700), cleaning deduction (€300), and duration (36 months) start as tenant assertions. The claim is for the retained €1,000. The four documents identified in the brief are unreviewed demo placeholders; no actual uploaded files or dates are implied. Missing invoices, landlord photographs and condition report are missing-information facts, not made-up evidence objects. Tenant causation and ordinary wear are unknown.

Four open issues cover painting, cleaning, tenant-caused damage and claimed costs. Fact-to-issue links make each monetary and evidentiary question explicit.

`createDemoWithNewEvidence()` produces an independent snapshot containing the €700 painting invoice and landlord damage photographs. Its authored illustrative reviews establish only invoice face value and photograph availability. The links are:

```text
painting-invoice → supports → painting_invoice_amount (€700)
painting_invoice_amount → relevant_to → costs / painting
landlord-damage-photos → supports → landlord_damage_photographs_supplied (true)
landlord_damage_photographs_supplied → relevant_to → damage
```

The invoice does not establish payment, reasonableness or tenant liability. Photograph availability does not establish damage date, causation or ordinary wear. The cleaning invoice and condition report remain missing. Decisions, rules and positions remain unpopulated because this step does not perform legal analysis. Relationship tests separately exercise contradictory evidence and authored decision/action/escalation records using plainly synthetic fixtures.

Complete JSON representations, including every entity and edge:

- [Initial demo](ontology-demo.initial.json)
- [Demo with new evidence](ontology-demo.updated.json)

These are generated from the exported factories and tested against them, so they are directly usable for serialisation/deserialisation rather than abbreviated pseudocode.

## Future extension

Keep Evidence, Fact, Source, Issue, Decision and relationship semantics reusable. A future consumer-refund model can add a discriminated claim variant with purchase/refund amounts and extend evidence types for purchase confirmations and return tracking. Its issues might ask whether goods were returned or a refund was received. Jurisdiction-specific, sourced rules remain separate from asserted facts. Add a schema version and explicit migration when changing stored shapes. Do not reinterpret tenancy fields as purchase fields, reuse RTB rules outside their jurisdiction, or merge public-case findings into the current user's established facts.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Ontology tests require no network, credentials or local corpus. No agents, assessment engine, final decision graph or UI flow changes are introduced.

## Subsequent graph integration

The ontology remains independently usable. The deterministic [decision graph](DECISION_GRAPH.md) now creates scoped Issue records and evaluations from these entities, while keeping existing UI/API transport models unchanged. Original source text retains whitespace exactly so raw ingestion offsets continue to match.
