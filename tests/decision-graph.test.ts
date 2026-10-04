import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDemoCase, createDemoWithNewEvidence } from "../src/domain/ontology/demo";
import { CaseSchema, SourceSchema, type Case, type Evidence, type Fact } from "../src/domain/ontology";
import { DEFAULT_CATALOGUE } from "../src/reasoning/graph/catalogue";
import { evaluateCase, reassessCase } from "../src/reasoning/graph/evaluate";
import { NODES, REQUIREMENTS } from "../src/reasoning/graph/definitions";
import { NodeSchema, ResultSchema, type Branch, type Options } from "../src/reasoning/graph/model";
import { runGraphDemo } from "../src/reasoning/graph/demo";
import { assessAndStore, loadStoredRun } from "../src/reasoning/graph/store";

const options = (): Options => ({ asOf: "2026-10-04", catalogue: structuredClone(DEFAULT_CATALOGUE), evidenceAssignments: [] });
function single(type: string): Case {
  const c = createDemoCase();
  c.facts.find(f => f.type === "cleaning_deduction")!.type = "unused_amount";
  const f = c.facts.find(f => f.type === "painting_deduction")!;
  f.type = type; f.value = { kind: "money", cents: 100000, currency: "EUR" };
  return c;
}
function corroborate(c: Case, type: string, value: Fact["value"], evidenceType: Evidence["type"] = "photograph") {
  let f = c.facts.find(f => f.type === type);
  if (!f) { f = { id: `test:${type}`, type, value: null, assertedBy: null, origin: "unknown", evidenceIds: [], verificationState: "unknown", confidence: null, occurredAt: null, sources: [] }; c.facts.push(f); }
  const id = `evidence:${type}`;
  c.evidence.push({ id, type: evidenceType, sourceParty: "landlord", documentReference: { id: `doc:${type}`, label: "Synthetic test fixture", kind: "demo_placeholder", sources: [] }, date: null, reviewState: "reviewed", reviewNote: "Synthetic reviewed evidence for graph mechanics" });
  Object.assign(f, { value, origin: "document_review", verificationState: "corroborated", evidenceIds: [id] });
  c.relationships.push({ type: "supports", from: id, to: f.id });
}

test("money gate handles fully returned, over-returned and unknown deposits", () => {
  for (const cents of [150000, 160000]) { const c = createDemoCase(); c.facts.find(f => f.type === "deposit_returned")!.value = { kind: "money", cents, currency: "EUR" }; const r = evaluateCase(c, options()); assert.equal(r.amount_in_dispute, 0); assert.equal(r.status, "no_active_dispute"); assert.equal(r.position, null); assert.equal(r.decision_trace.some(t => t.nodeId === "rules"), false); }
  const c = createDemoCase(); c.facts.find(f => f.type === "deposit_paid")!.value = null; c.facts.find(f => f.type === "deposit_paid")!.verificationState = "unknown";
  assert.equal(evaluateCase(c, options()).amount_in_dispute, null);
});
test("jurisdiction gate stops unsupported cases before deduction reasoning", () => {
  const c = createDemoCase(); c.jurisdiction = "GB";
  const r = evaluateCase(c, options()); assert.equal(r.status, "unsupported"); assert.equal(r.position, null); assert.equal(r.issues.length, 0);
  c.jurisdiction = "Ireland"; assert.equal(evaluateCase(c, options()).status, "assessed");
});
test("missing reasons and mismatched itemisation produce a focused request", () => {
  const c = createDemoCase(); for (const f of c.facts.filter(f => f.type.endsWith("_deduction"))) f.type = "unused_amount";
  assert.equal(evaluateCase(c, options()).next_best_action.type, "request_itemisation");
  const d = createDemoCase(); d.facts.find(f => f.type === "painting_deduction")!.value = { kind: "money", cents: 1, currency: "EUR" };
  assert.equal(evaluateCase(d, options()).status, "needs_input");
});
test("painting and cleaning create separate ontology issues and evidence dependencies", () => {
  const r = evaluateCase(createDemoCase(), options()); assert.equal(r.issues.length, 7);
  assert.ok(r.issues.some(i => i.factType === "damage_beyond_ordinary_wear" && i.dependencies.some(d => d.role === "condition_report")));
  assert.ok(r.issues.some(i => i.factType === "cleaning_required"));
  assert.ok(r.issues.some(i => i.factType === "painting_invoice_amount" && i.dependencies.some(d => d.role === "contractor_estimate")));
  assert.equal(r.amount_in_dispute, 100000); assert.ok(r.source_references.length >= 2);
});
test("all eight deduction branches are recognised; unsupported legal coverage escalates", () => {
  for (const [type, branch] of [["damage_deduction", "property_damage"], ["painting_deduction", "repainting"], ["cleaning_deduction", "cleaning"], ["rent_arrears_deduction", "rent_arrears"], ["utilities_deduction", "utilities"], ["missing_items_deduction", "missing_items"], ["early_termination_deduction", "early_termination"], ["unknown_deduction", "other"]] as const) {
    const r = evaluateCase(single(type), options()); assert.ok(r.issues.every(i => i.branch === branch));
    if (["early_termination", "other"].includes(branch)) assert.equal(r.position, "expert_review");
  }
  const rent = evaluateCase(single("rent_arrears_deduction"), options()); assert.ok(rent.issues.some(i => i.factType === "rent_arrears_outstanding")); assert.ok(rent.missing_evidence.some(e => e.role === "rent_ledger"));
});
test("asserted invoice, unreviewed upload and unrelated invoice do not verify a cost", () => {
  const c = createDemoCase(); const f = c.facts.find(f => f.type === "painting_invoice_amount")!;
  Object.assign(f, { value: { kind: "money", cents: 70000, currency: "EUR" }, assertedBy: "landlord", origin: "party_assertion", verificationState: "asserted" });
  const r = evaluateCase(c, options()); assert.equal(r.issues.find(i => i.factType === f.type)?.state, "unresolved");
  const d = createDemoWithNewEvidence(); const e = d.evidence.find(e => e.id === "painting-invoice")!; e.reviewState = "unreviewed";
  d.relationships = d.relationships.filter(l => l.from !== e.id); const df = d.facts.find(f => f.type === "painting_invoice_amount")!; df.verificationState = "asserted"; df.evidenceIds = [];
  const o = options(); o.evidenceAssignments = [{ evidenceId: e.id, deductionFactId: "painting_deduction", role: "invoice" }];
  const unreviewed = evaluateCase(d, o); assert.equal(unreviewed.issues.find(i => i.factType === "painting_invoice_amount")?.state, "unresolved");
  assert.equal(evaluateCase(createDemoWithNewEvidence(), options()).issues.find(i => i.factType === "cleaning_invoice_amount")?.state, "unresolved");
});
test("material contradiction forces uncertainty and prevents high confidence", () => {
  const c = createDemoCase(); corroborate(c, "tenant_caused_damage", { kind: "boolean", value: false });
  const f = c.facts.find(f => f.type === "tenant_caused_damage")!; f.verificationState = "contradicted";
  const e = c.evidence.find(e => e.id === "move-out-photos")!; e.reviewState = "reviewed"; e.reviewNote = "Synthetic contradictory review";
  f.evidenceIds.push(e.id); c.relationships.push({ type: "contradicts", from: e.id, to: f.id });
  const r = evaluateCase(c, options()); assert.equal(r.position, "uncertain"); assert.equal(r.confidence, "low"); assert.ok(r.issues.some(i => i.contradictingEvidenceIds.includes(e.id)));
});
test("missing, expired, future or unrelated rules always require expert review", () => {
  for (const o of [{ ...options(), catalogue: [] }, { ...options(), asOf: "2028-01-01" }, { ...options(), asOf: "2020-01-01" }, { ...options(), catalogue: options().catalogue.map(e => ({ ...e, issueTypes: ["unrelated"] })) }, { ...options(), catalogue: options().catalogue.filter(e => e.scope === "evidence_guidance") }]) {
    const r = evaluateCase(createDemoCase(), o); assert.equal(r.position, "expert_review"); assert.equal(r.confidence, "low"); assert.ok(r.escalation);
  }
});
test("new evidence recomputes position and next evidence, with no hardcoded demo state", () => {
  const d = runGraphDemo(); assert.equal(d.initial.position, "worth_pursuing"); assert.equal(d.initial.confidence, "medium"); assert.equal(d.assessment.position, "uncertain");
  assert.equal(d.initial.next_best_evidence?.role, "invoice"); assert.equal(d.assessment.next_best_evidence?.role, "landlord_photographs");
  assert.ok(d.initial.decision_trace.some(t => t.nodeId === "evidence" && t.explanation.includes("invoice: absent")));
  assert.ok(d.assessment.decision_trace.some(t => t.nodeId === "evidence" && t.explanation.includes("landlord_photographs: reviewed")));
  assert.ok(d.changedIssueIds.some(id => id.endsWith("painting_invoice_amount"))); assert.ok(d.recomputedNodeIds.includes("position"));
  assert.equal(reassessCase(d.assessment, d.initialCase, d.options).assessment.position, "worth_pursuing");
  assert.deepEqual(evaluateCase(d.updatedCase, d.updatedOptions), d.assessment);
  assert.deepEqual(ResultSchema.parse(JSON.parse(JSON.stringify(d.assessment))), d.assessment);
  const renamed = structuredClone(d.updatedCase); renamed.id = "another-case";
  assert.equal(evaluateCase(renamed, d.updatedOptions).position, "uncertain");
  assert.throws(() => reassessCase(d.initial, renamed, d.updatedOptions));
});
test("fully reviewed branch findings produce distinct strong and weak positions", () => {
  for (const branch of ["repainting", "cleaning", "rent_arrears"] as Branch[]) {
    const type = { repainting: "painting_deduction", cleaning: "cleaning_deduction", rent_arrears: "rent_arrears_deduction" }[branch as "repainting" | "cleaning" | "rent_arrears"];
    const c = single(type);
    for (const req of REQUIREMENTS[branch]) corroborate(c, req.type, req.kind === "cost" ? { kind: "money", cents: 100000, currency: "EUR" } : { kind: "boolean", value: true }, branch === "rent_arrears" ? "bank_record" : req.kind === "cost" ? "invoice" : "photograph");
    assert.equal(evaluateCase(c, options()).position, "weak");
    c.facts.find(f => f.type === REQUIREMENTS[branch][0].type)!.value = { kind: "boolean", value: false };
    assert.equal(evaluateCase(c, options()).position, "strong");
    assert.equal(evaluateCase(c, options()).confidence, "medium"); // Guidance-only ceiling.
  }
});
test("graph is immutable, nodes are declared, and genuine source text retains whitespace", () => {
  const c = createDemoCase(); const before = JSON.stringify(c); const r = evaluateCase(c, options()); assert.equal(JSON.stringify(c), before);
  const ids = NODES.map(n => NodeSchema.parse(n).id); for (const n of NODES) for (const next of n.nextNodes) assert.ok(ids.includes(next));
  for (const t of r.decision_trace) assert.ok(ids.includes(t.nodeId));
  for (const entry of DEFAULT_CATALOGUE) for (const s of entry.rule.sources) { assert.deepEqual(SourceSchema.parse(s), s); assert.equal(s.originalText.length, s.rawEnd - s.rawStart); assert.ok(s.originalText.endsWith("\n")); }
  assert.deepEqual(CaseSchema.parse(c), c);
});
test("stored runs retain full input, output and trace; repeats deduplicate and tampering fails", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "verdict-graph-"));
  try {
    const d = runGraphDemo(); const a = assessAndStore(d.initialCase, d.options, directory); const b = assessAndStore(d.updatedCase, d.updatedOptions, directory);
    assert.notEqual(a.run.runId, b.run.runId); assert.deepEqual(assessAndStore(d.initialCase, d.options, directory).run, a.run);
    assert.deepEqual(loadStoredRun(a.file).assessment.decision_trace, d.initial.decision_trace);
    const tampered = JSON.parse(readFileSync(a.file, "utf8")); tampered.assessment.position = "weak"; writeFileSync(a.file, JSON.stringify(tampered));
    assert.throws(() => loadStoredRun(a.file), /integrity/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
