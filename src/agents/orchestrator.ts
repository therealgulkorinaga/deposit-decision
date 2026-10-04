import "server-only";
import { z } from "zod";
import { CaseSchema, type Case } from "../domain/ontology";
import { DEFAULT_CATALOGUE } from "../reasoning/graph/catalogue";
import { evaluateCase } from "../reasoning/graph/evaluate";
import type { GraphResult } from "../reasoning/graph/model";
import { REQUIREMENTS } from "../reasoning/graph/definitions";
import { retrieve, sha256, type Corpus } from "../retrieval/corpus";
import { SCHEMAS, type Analysis, type Candidate, type Classification, type Document, type Hit, type Interpreter, type Stage, type Submission } from "./contracts";
import { ALLOWED_FACT_TYPES, baseCase, mergeInterpretation, narrative } from "./intake";
import { explanationChoices, verifyExplanation } from "./explanation";

export type IssueCache = { fingerprint: string; rules: Hit[]; cases: Hit[]; analysis: Analysis };
export interface FlowRun {
  submission: Submission; mode: Interpreter["mode"]; documentFingerprints: Record<string, string>; narrativeFingerprint: string;
  candidates: Candidate[]; classifications: Classification[]; ontology: Case; issueCache: Record<string, IssueCache>;
  graph: GraphResult; explanation: ReturnType<typeof verifyExplanation>;
  changes: { previousPosition: GraphResult["position"] | null; newPosition: GraphResult["position"]; previousConfidence: string | null; newConfidence: string; changedFactors: string[] };
  debug: { stages: Array<{ stage: string; reused: boolean }>; rejected: string[]; conflicts: string[]; mappedIssues: string[]; corpus: { documents: number; fingerprint: string; warnings: string[] }; verification: unknown; affectedIssueIds: string[] };
}
const fingerprint = (doc: Document, s: Submission) => sha256(JSON.stringify([doc.id, doc.sourceParty, s.evidence.find(e => e.id === doc.evidenceId)]));

/** One bounded workflow. No agent tools, recursive loops, model-controlled transitions or spawning. */
export async function orchestrate(s: Submission, docs: Document[], corpus: Corpus, interpreter: Interpreter, previous?: FlowRun, asOf = new Date().toISOString().slice(0, 10)): Promise<FlowRun> {
  if (previous && (previous.submission.id !== s.id || previous.mode !== interpreter.mode)) throw new Error("PREVIOUS_CASE_MISMATCH");
  if (interpreter.mode === "offline_demo" && !s.demo) throw new Error("DEMO_ONLY");
  const debug: FlowRun["debug"] = { stages: [], rejected: [], conflicts: [], mappedIssues: [], corpus: { documents: corpus.documents.length, fingerprint: corpus.fingerprint, warnings: corpus.warnings }, verification: null, affectedIssueIds: [] };
  const deadline = Date.now() + 180_000; let calls = 0;
  const call = async <S extends Stage>(stage: S, payload: unknown): Promise<z.infer<(typeof SCHEMAS)[S]>> => {
    if (++calls > 50 || Date.now() > deadline) throw new Error("FLOW_BUDGET_EXCEEDED");
    debug.stages.push({ stage, reused: false });
    return SCHEMAS[stage].parse(await interpreter.run(stage, payload)) as z.infer<(typeof SCHEMAS)[S]>;
  };
  const documentFingerprints = Object.fromEntries(docs.map(d => [d.id, fingerprint(d, s)]));
  const changedDocs = docs.filter(d => previous?.documentFingerprints[d.id] !== documentFingerprints[d.id]);
  const narrativeFingerprint = sha256(narrative(s));
  const narrativeChanged = previous?.narrativeFingerprint !== narrativeFingerprint;
  const retainedCandidates = previous?.candidates.filter(c => c.source.documentId === null ? !narrativeChanged : docs.some(d => d.id === c.source.documentId && !changedDocs.includes(d))) ?? [];
  const extraction = changedDocs.length || narrativeChanged ? await call("extract", { narrative: narrativeChanged ? narrative(s) : "", documents: changedDocs, existingCase: previous?.ontology ?? baseCase(s), allowedFactTypes: ALLOWED_FACT_TYPES }) : { candidates: [] };
  const candidates = [...retainedCandidates, ...extraction.candidates];
  const classifications: Classification[] = [];
  for (const d of docs) {
    const prior = previous?.classifications.find(c => c.evidenceId === d.evidenceId);
    if (!changedDocs.includes(d) && prior) { classifications.push(prior); debug.stages.push({ stage: `classify:${d.evidenceId}`, reused: true }); continue; }
    const cl = await call("classify", { document: d, metadata: s.evidence.find(e => e.id === d.evidenceId), allowedFactTypes: ALLOWED_FACT_TYPES, allowedDeductionTypes: ALLOWED_FACT_TYPES.filter(t => t.endsWith("_deduction")) });
    if (cl.evidenceId !== d.evidenceId || cl.relationships.some(r => !ALLOWED_FACT_TYPES.includes(r.factType) || (r.quote !== null && !d.text.includes(r.quote)))) { debug.rejected.push(`Invalid classification references for ${d.evidenceId}`); continue; }
    classifications.push(cl);
  }
  const merged = mergeInterpretation(s, docs, candidates, classifications);
  debug.rejected.push(...merged.rejected); debug.conflicts = merged.conflicts;
  const mapping = await call("map", { facts: merged.case.facts, claims: merged.case.claims, allowedIssueTypes: [...new Set(Object.values(REQUIREMENTS).flatMap(rs => rs.map(r => r.type)))] });
  debug.mappedIssues = mapping.issueTypes.filter(t => Object.values(REQUIREMENTS).some(rs => rs.some(r => r.type === t)));
  if (debug.mappedIssues.length !== mapping.issueTypes.length) debug.rejected.push("Unsupported mapped issues removed");
  // Only reviewed mappings with source passages still present in the validated corpus may govern.
  const catalogue = DEFAULT_CATALOGUE.filter(entry => entry.rule.sources.every(source => corpus.documents.some(d => d.documentId === source.sourceDocumentId && d.checksum === source.checksum && d.chunks.some(ch => ch.id === source.chunkId && ch.text === source.originalText))));
  const options = { asOf, catalogue, evidenceAssignments: merged.assignments };
  const preliminary = evaluateCase(merged.case, options); // Deterministic planning pass creates required issues.
  merged.case.issues = preliminary.issues.map(i => i.issue);
  for (const i of preliminary.issues) for (const id of i.factIds) merged.case.relationships.push({ type: "relevant_to", from: id, to: i.issue.id });
  const ontology = CaseSchema.parse(merged.case);
  const issueCache: Record<string, IssueCache> = {};
  for (const i of preliminary.issues) {
    const relevantFacts = ontology.facts.filter(f => i.factIds.includes(f.id));
    const relevantEvidence = ontology.evidence.filter(e => i.dependencies.some(d => d.evidenceIds.includes(e.id)));
    const key = sha256(JSON.stringify([i.issue, relevantFacts, relevantEvidence, i.deductionFactId, i.amountCents, corpus.fingerprint, asOf]));
    const old = previous?.issueCache[i.issue.id];
    if (old?.fingerprint === key) { issueCache[i.issue.id] = old; debug.stages.push({ stage: `retrieve/analyse:${i.issue.id}`, reused: true }); continue; }
    debug.affectedIssueIds.push(i.issue.id);
    const rules = retrieve(corpus, "rule", i.issue); const cases = retrieve(corpus, "case", i.issue);
    const analysis = await call("analyse", { issue: i.issue, facts: relevantFacts, evidence: relevantEvidence, rules, cases });
    const allHits = [...rules, ...cases];
    const ids = new Set(allHits.map(h => h.id));
    const factIds = new Set(relevantFacts.map(f => f.id));
    if (analysis.issueId !== i.issue.id || analysis.relevantRuleIds.some(id => !rules.some(r => r.id === id)) || analysis.distinctions.some(d => !cases.some(h => h.id === d.sourceId)) || [...analysis.supportingTenant, ...analysis.supportingLandlord].some(f => f.sourceIds.some(id => !ids.has(id)) || f.factIds.some(id => !factIds.has(id)))) {
      debug.rejected.push(`Invalid issue analysis removed: ${i.issue.id}`);
      issueCache[i.issue.id] = { fingerprint: key, rules, cases, analysis: { issueId: i.issue.id, supportingTenant: [], supportingLandlord: [], relevantRuleIds: [], distinctions: [], missingFactTypes: [], unresolvedQuestions: ["Interpretation rejected; inspect structured evidence directly"] } };
    } else issueCache[i.issue.id] = { fingerprint: key, rules, cases, analysis };
  }
  // Graph owns every invariant. Analyses are bounded interpretations retained in its audit trace.
  const graph = evaluateCase(ontology, { ...options, issueAnalyses: Object.values(issueCache).map(cache => ({ issueId: cache.analysis.issueId, supportingFactIds: [...new Set(cache.analysis.supportingTenant.flatMap(f => f.factIds))], adverseFactIds: [...new Set(cache.analysis.supportingLandlord.flatMap(f => f.factIds))], missingFactTypes: cache.analysis.missingFactTypes.filter(t => ALLOWED_FACT_TYPES.includes(t)), sourceReferences: [...cache.rules, ...cache.cases].map(h => h.source) })) });
  const registry = [...new Map(Object.values(issueCache).flatMap(c => [...c.rules, ...c.cases]).map(h => [h.id, h])).values()];
  // Register graph sources as well; every displayed source is taken from verified retrieval or catalogue.
  for (const source of graph.source_references) if (!registry.some(h => h.id === source.chunkId)) registry.push({ id: source.chunkId, kind: "rule", caseId: null, reportType: source.documentType, source, score: 1, tags: [] });
  const proposal = await call("explain", { graph, sentences: explanationChoices(graph), sourceIds: registry.map(h => h.id) });
  let verification: z.infer<typeof SCHEMAS.verify>;
  try { verification = await call("verify", { graph, proposal, sentences: explanationChoices(graph), sources: registry }); }
  catch { verification = { approved: false, reasons: ["Verifier unavailable; use deterministic explanation"] }; }
  const explanation = verifyExplanation(graph, proposal, registry, verification.approved);
  debug.verification = { model: verification, deterministic: { approved: explanation.approved, fallback: explanation.fallback, failures: explanation.failures } };
  const changes: FlowRun["changes"] = { previousPosition: previous?.graph.position ?? null, newPosition: graph.position, previousConfidence: previous?.graph.confidence ?? null, newConfidence: graph.confidence, changedFactors: previous ? graph.issues.filter(i => JSON.stringify(previous.graph.issues.find(old => old.issue.id === i.issue.id)) !== JSON.stringify(i)).map(i => `${i.issue.question} ${i.rationale}`) : [] };
  return { submission: s, mode: interpreter.mode, documentFingerprints, narrativeFingerprint, candidates, classifications, ontology, issueCache, graph, explanation, changes, debug };
}
