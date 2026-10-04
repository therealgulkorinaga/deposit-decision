# Depositcheck UI logic

This is a session-only React + TypeScript prototype. No OpenAI calls, retrieval, ingestion, document parsing, legal reasoning, or automated sending are implemented.

## Screens and transitions

Landing → Situation → Evidence → Fact confirmation → Assessment → Next action.
Assessment → Add new evidence → Evidence update → Fact confirmation → Reassess → Assessment.
The example CTA preloads the Dublin case and starts at Situation. Back controls preserve in-session entries. The logo opens Landing without clearing data; starting either journey resets the case. Refresh clears all state. Screens use local React state, not URL routes.

## Input contracts

Situation: location, deposit, returned amount, start/end dates, reason, outstanding rent/utilities (Yes/No/Unknown), optional description. Required values and date order are validated before advancing and before assessment. Returned funds cannot exceed the deposit. Amount in dispute is deterministically deposit minus returned, rounded to cents. A fully returned deposit is allowed and shows zero in dispute.

Evidence: ten categories, source party, present/absent/unknown, optional note and selected File. Selection sets present. Changing to absent/unknown clears file metadata. Removing a file does not assert evidence is absent. Nothing is uploaded or persisted. Demo document filenames are illustrative and do not link to real files.

Fact confirmation: user statements and deductions are editable, separately from editable mock extracted facts with evidence references. The demo agreement supplies a mock summary; injected invoice/photos supply mock summaries. Non-demo uploads generate no factual assertions. Computed disputed amount changes through its editable input values. Evidence availability is editable through the evidence screen.

## State model

`Case`, `Party`, `Claim`, `Fact`, `Evidence`, `Assessment`, `RuleReference`, `ComparableCase`, `RecommendedAction` are UI contracts in src/mocks/case-state.ts. Case revision increments on edits. Assessments capture revision and disputed amount. Existing assessments remain visible as snapshots while edits are pending. The application owns current and previous assessment separately from current case data. These are not a legal ontology. Step 1 runs the same UI under Next.js, with separate backend contracts described in ARCHITECTURE.md; the UI still uses mocks.

## Assessment and output

Position supports Strong position, Worth pursuing, Uncertain, Weak position, Needs expert review. Confidence is a separate High/Medium/Low contract. No win probabilities or numeric similarity scores. The default example returns Worth pursuing / Medium; both landlord invoice and photos marked present cause Uncertain / Medium. Other cases return an explicitly labelled Uncertain / Low placeholder. These are UI fixtures, not legal inference. Supporting and adverse checklist factors reflect present evidence and rent/utility declarations.

Rules and comparable cases are visibly marked DEVELOPMENT MOCK DATA. Case cards show fictional ID/name, qualitative similarity, illustrative outcome, relevance and a non-clickable source URL placeholder.

## Reassessment

Add new evidence opens an editable evidence view. The demo injection adds a €700 invoice and wall-damage photograph metadata. A New evidence added or updated banner appears, while the prior result remains unchanged. Review my case opens facts; Reassess my position explicitly computes the mock result. The result shows the previous and current positions and “New evidence changed the assessment” when different. Repeated reassessment with no position change says “Reassessment complete”.

## Next action

An interactive checklist lists the requested evidence. Prepare evidence request produces an editable local draft with the disputed amount. The user may select/copy the text manually. Nothing is sent. RTB is shown as the escalation destination, without implementing an escalation submission.

## Loading and errors

A short simulated assessment delay disables the assessment button and shows preparation text. Cleanup cancels the pending timer on unmount. Invalid intake produces an error list and retains entries. Native browser inputs also enforce required fields. There are no network requests to fail. A future parsing layer must retain entered facts and offer manual correction on failure. Font download failure falls back to Arial.

## Verification

`npm run build` type-checks and builds; `npm run lint` checks source. `npm test` covers money calculation, validation, fresh/demo isolation, mock provenance, evidence injection, assessment snapshot stability and the explicit reassessment transition. Browser review covers demo flow and responsive layout.
