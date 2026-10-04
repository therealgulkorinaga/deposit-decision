import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CaseSchema, RuleSchema, SourceSchema, sourceFromChunk, type Source } from "../src/domain/ontology";
import { createDemoCase, createDemoWithNewEvidence } from "../src/domain/ontology/demo";
import type { ProcessedDocument } from "../src/ingestion/schemas";

// Synthetic parser fixture, not a legal rule or real public case.
const text = "Synthetic source text.";
const source: Source = { sourceDocumentId: "00000000-0000-4000-8000-000000000001", sourceUrl: "https://example.org/test-fixture", documentTitle: "Synthetic test fixture", documentType: "unknown", date: null, pageNumber: 1, sectionHeading: "Fixture", checksum: "a".repeat(64), rawStart: 0, rawEnd: text.length, chunkId: "fixture:1", originalText: text };

test("ontology validates and round trips both independent demo snapshots", () => {
  for (const demo of [createDemoCase(), createDemoWithNewEvidence()]) assert.deepEqual(CaseSchema.parse(JSON.parse(JSON.stringify(demo))), demo);
  assert.equal(createDemoCase().evidence.length, 4);
  assert.equal(createDemoWithNewEvidence().evidence.length, 6);
  assert.equal(createDemoWithNewEvidence().facts.find(f => f.id === "tenant_caused_damage")?.verificationState, "unknown");
  for (const [name, demo] of [["initial", createDemoCase()], ["updated", createDemoWithNewEvidence()]] as const) assert.deepEqual(JSON.parse(readFileSync(new URL(`../docs/ontology-demo.${name}.json`, import.meta.url), "utf8")), demo);
});
test("ontology rejects invalid money, dangling IDs, duplicate IDs and live demo evidence", () => {
  const c = createDemoCase(); c.claims[0].amountClaimedCents = -1; assert.equal(CaseSchema.safeParse(c).success, false);
  const d = createDemoCase(); d.relationships[0].to = "missing-issue"; assert.equal(CaseSchema.safeParse(d).success, false);
  const e = createDemoCase(); e.parties[1].id = e.parties[0].id; assert.equal(CaseSchema.safeParse(e).success, false);
  const f = createDemoCase(); f.recordKind = "live"; assert.equal(CaseSchema.safeParse(f).success, false);
});
test("assertions and unreviewed uploads cannot silently become corroboration", () => {
  const c = createDemoCase(); c.facts[0].verificationState = "corroborated"; assert.equal(CaseSchema.safeParse(c).success, false);
  c.facts[0].evidenceIds = [c.evidence[0].id]; c.relationships.push({ type: "supports", from: c.evidence[0].id, to: c.facts[0].id });
  assert.equal(CaseSchema.safeParse(c).success, false);
  c.evidence[0].reviewState = "reviewed"; c.evidence[0].reviewNote = "Synthetic review of deposit clause";
  assert.equal(CaseSchema.safeParse(c).success, true);
});
test("contradiction is explicit and cannot be hidden behind corroborated state", () => {
  const c = createDemoWithNewEvidence(); const f = c.facts[0];
  f.evidenceIds = ["painting-invoice"]; f.verificationState = "contradicted";
  c.relationships.push({ type: "contradicts", from: "painting-invoice", to: f.id });
  assert.equal(CaseSchema.safeParse(c).success, true);
  f.verificationState = "corroborated"; assert.equal(CaseSchema.safeParse(c).success, false);
  // Test relationship mechanics only; this is not an assertion about invoice relevance.
});
test("missing evidence is an unresolved fact, not a fabricated evidence object", () => {
  const c = createDemoCase(); const f = c.facts.find(f => f.id === "painting_invoice_amount")!;
  assert.equal(f.verificationState, "missing"); assert.equal(c.evidence.some(e => e.type === "invoice"), false);
  f.value = { kind: "money", cents: 0, currency: "EUR" }; assert.equal(CaseSchema.safeParse(c).success, false);
});
test("rules and externally derived facts require usable source provenance", () => {
  assert.equal(SourceSchema.safeParse({ ...source, sourceUrl: null }).success, false);
  const rule = { id: "test-rule", topic: "test", jurisdiction: "IE", kind: "guidance", effectiveDate: null, source: "Synthetic fixture", summary: "Schema test only", sources: [source] };
  assert.equal(RuleSchema.safeParse(rule).success, true); assert.equal(RuleSchema.safeParse({ ...rule, sources: [] }).success, false);
  const c = createDemoCase(); c.facts[0].origin = "external_case"; assert.equal(CaseSchema.safeParse(c).success, false);
  c.facts[0].sources = [source]; assert.equal(CaseSchema.safeParse(c).success, true);
});
test("ingestion adapter preserves exact provenance and rejects source/page/text tampering", () => {
  const { chunkId, originalText, ...provenance } = source;
  const document = { documentId: source.sourceDocumentId, sourceUrl: source.sourceUrl, checksum: source.checksum, title: source.documentTitle, documentType: source.documentType, date: null, rawText: originalText, sections: [{ id: "section", heading: "Fixture", rawStart: 0, rawEnd: text.length }], pages: [{ pageNumber: 1, rawStart: 0, rawEnd: text.length }], chunks: [{ id: chunkId, sectionId: "section", text: originalText, provenance }] } as ProcessedDocument;
  assert.deepEqual(sourceFromChunk(document, chunkId), source);
  for (const altered of [{ ...document, sourceUrl: "https://example.org/other" }, { ...document, rawText: "tampered" }, { ...document, pages: [] }]) assert.throws(() => sourceFromChunk(altered, chunkId));
  assert.throws(() => sourceFromChunk(document, "absent"));
});
test("decision, missing fact, rule, action and escalation relationships validate together", () => {
  const c = createDemoCase();
  c.rules.push({ id: "test-rule", topic: "test", jurisdiction: "IE", kind: "guidance", effectiveDate: null, source: "Synthetic fixture", summary: "Schema test only", sources: [source] });
  c.decisions.push({ id: "test-decision", issueId: "costs", status: "provisional", outcome: "undetermined", supportingFactIds: [], adverseFactIds: [], appliedRuleIds: ["test-rule"], unresolvedFactIds: ["painting_invoice_amount"], rationale: "Synthetic test; not an assessment", confidence: null, sources: [source] });
  c.actions.push({ id: "ask", type: "request_invoice", description: "Request itemised painting invoice" });
  c.riskTriggers.push({ id: "risk", description: "Synthetic expert-review trigger", factIds: ["painting_invoice_amount"] });
  c.escalations.push({ id: "escalation", triggerId: "risk", destination: "Expert", reason: "Synthetic test", requiredEvidence: ["invoice"], unresolvedIssueId: "costs" });
  c.relationships.push({ type: "governs", from: "test-rule", to: "costs" }, { type: "lowers_confidence", from: "painting_invoice_amount", to: "test-decision" }, { type: "recommends", from: "test-decision", to: "ask" }, { type: "causes", from: "risk", to: "escalation" });
  assert.equal(CaseSchema.safeParse(c).success, true);
  c.decisions[0].sources = []; assert.equal(CaseSchema.safeParse(c).success, false); c.decisions[0].sources = [source];
  c.relationships.push({ type: "resolves", from: "test-decision", to: "costs" }); assert.equal(CaseSchema.safeParse(c).success, false);
  c.decisions[0].status = "determined"; c.decisions[0].outcome = "supported"; assert.equal(CaseSchema.safeParse(c).success, true);
  c.relationships = c.relationships.filter(r => r.type !== "lowers_confidence"); assert.equal(CaseSchema.safeParse(c).success, false);
});
