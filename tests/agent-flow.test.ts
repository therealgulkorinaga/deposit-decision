import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createCase, injectLandlord } from "../src/mocks/case-state";
import { SubmissionSchema } from "../src/agents/contracts";
import { assessSubmission, loadFlowRun } from "../src/agents/service";
import { loadCorpus, retrieve } from "../src/retrieval/corpus";
import { verifyExplanation } from "../src/agents/explanation";
import { runGraphDemo } from "../src/reasoning/graph/demo";
import { POST } from "../src/app/api/assessment/route";

const corpus = loadCorpus();
const hasDemoCorpus = corpus.documents.some(d => d.title === "Security deposits") && corpus.documents.some(d => d.preliminaryCase);
const submission = (c = createCase(true), id = randomUUID(), previousRunId: string | null = null) => SubmissionSchema.parse({ id, previousRunId, jurisdiction: "IE", ...Object.fromEntries(Object.entries(c).filter(([key]) => key !== "facts")), evidence: c.evidence.map(e => ({ ...e, filename: e.filename ?? null })) });

test("exact offline demo: ingestion → interpretation → real retrieval → graph → verified consumer result", { skip: !hasDemoCorpus }, async () => {
  const c = createCase(true); const id = randomUUID();
  const a = await assessSubmission(submission(c, id), new Map());
  assert.equal(a.mode, "offline_demo"); assert.equal(a.assessment.disputed, 1000);
  assert.equal(a.assessment.position, "Worth pursuing"); assert.equal(a.assessment.confidence, "Medium");
  assert.equal(a.rules.length, 2); assert.equal(a.cases.length, 1);
  assert.ok(a.rules.some(r => r.section === "Reasons for keeping the deposit"));
  assert.ok(a.rules.every(r => r.url.startsWith("https://rtb.ie/")));
  const b = await assessSubmission(submission(injectLandlord(c), id, a.runId), new Map());
  assert.equal(b.assessment.position, "Uncertain"); assert.equal(b.assessment.confidence, "Medium");
  assert.equal(b.assessment.disputed, 1000);
  assert.ok(b.changes.changedFactors.some(f => f.includes("documentary support (€700)")));
  assert.ok(b.changes.changedFactors.some(f => f.includes("move-in photographs")));
  const stored = loadFlowRun(b.runId);
  assert.equal(stored.ontology.facts.find(f => f.type === "painting_invoice_amount")?.verificationState, "corroborated");
  assert.equal(stored.graph.position, "uncertain");
  assert.equal(stored.debug.stages.filter(s => s.stage === "classify" && !s.reused).length, 2);
  assert.ok(stored.debug.stages.some(s => s.stage.startsWith("retrieve/analyse:") && s.reused));
  assert.ok(!JSON.stringify(b).includes("AI_NOT_CONFIGURED"));
  assert.ok(!("debug" in b));
  // Reverting evidence recomputes, rather than preserving a hard-coded badge.
  const reverted = await assessSubmission(submission(c, id, b.runId), new Map());
  assert.equal(reverted.assessment.position, "Worth pursuing");
});
test("corpus retrieval returns distinct real rule and prior-report sources", { skip: !hasDemoCorpus }, () => {
  const issue = { type: "painting_invoice_amount", question: "Is the painting deduction supported by evidence?" };
  const rules = retrieve(corpus, "rule", issue); const cases = retrieve(corpus, "case", issue);
  assert.ok(rules.length); assert.ok(cases.length);
  for (const hit of [...rules, ...cases]) { const d = corpus.documents.find(d => d.documentId === hit.source.sourceDocumentId)!; assert.ok(d); assert.equal(d.rawText.slice(hit.source.rawStart, hit.source.rawEnd), hit.source.originalText); }
  assert.ok(cases.every(h => !!h.caseId)); assert.ok(rules.every(h => h.kind === "rule"));
});
test("verification removes unknown text/citations without modifying graph invariants", () => {
  const graph = runGraphDemo().initial; const before = JSON.stringify(graph);
  const safe = verifyExplanation(graph, { sentenceIds: ["You will win"], sourceIds: ["invented-case"] }, [], true);
  assert.equal(safe.fallback, true); assert.equal(safe.citations.length, 0);
  assert.ok(!safe.paragraphs.some(p => /you will win/i.test(p))); assert.equal(JSON.stringify(graph), before);
});
test("assessment endpoint rejects cross-origin requests and malformed input safely", async () => {
  assert.equal((await POST(new Request("http://127.0.0.1:5173/api/assessment", { method: "POST", headers: { origin: "https://example.org" }, body: "x" }))).status, 403);
  const response = await POST(new Request("http://127.0.0.1:5173/api/assessment", { method: "POST", body: "invalid" }));
  const local = await POST(new Request("http://localhost:5173/api/assessment", { method: "POST", headers: { host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" }, body: "invalid" }));
  assert.equal(local.status, 422); // Next's internal hostname must not reject the same-origin browser.
  assert.equal(response.status, 422); assert.ok(!(await response.text()).includes("stack"));
});
