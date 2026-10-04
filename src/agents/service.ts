import "server-only";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getEnvironment } from "../lib/server/env";
import { loadCorpus, sha256 } from "../retrieval/corpus";
import { ingestUploads } from "./intake";
import { orchestrate, type FlowRun } from "./orchestrator";
import { OfflineDemoInterpreter } from "./offline-demo";
import { OpenAIInterpreter } from "./openai";
import { SubmissionSchema, type Submission } from "./contracts";
import { POSITION_LABELS } from "./explanation";
import { ResultSchema } from "../reasoning/graph/model";
import { CaseSchema } from "../domain/ontology";
import { DEFAULT_CATALOGUE } from "../reasoning/graph/catalogue";

export function loadFlowRun(id: string): FlowRun {
  z.uuid().parse(id);
  const envelope = JSON.parse(readFileSync(path.join(getEnvironment().DATA_DIR, "flows", `${id}.json`), "utf8"));
  if (sha256(JSON.stringify(envelope.flow)) !== envelope.checksum) throw new Error("RUN_INTEGRITY_FAILED");
  SubmissionSchema.parse(envelope.flow.submission); CaseSchema.parse(envelope.flow.ontology); ResultSchema.parse(envelope.flow.graph);
  return envelope.flow;
}
export function saveFlowRun(flow: FlowRun) {
  const id = randomUUID(); const dir = path.join(getEnvironment().DATA_DIR, "flows"); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temporary = path.join(dir, `${id}.tmp`);
  writeFileSync(temporary, JSON.stringify({ id, createdAt: new Date().toISOString(), checksum: sha256(JSON.stringify(flow)), flow }, null, 2), { flag: "wx", mode: 0o600 });
  renameSync(temporary, path.join(dir, `${id}.json`)); return id;
}
export function consumerResult(id: string, flow: FlowRun) {
  const graph = flow.graph;
  const verifiedHits = flow.explanation.citations;
  const unique = [...new Map(verifiedHits.map(h => [h.source.sourceDocumentId, h])).values()];
  const usedRuleSources = DEFAULT_CATALOGUE.filter(e => graph.issues.some(i => i.ruleIds.includes(e.rule.id))).flatMap(e => e.rule.sources.map(s => s.chunkId));
  const ruleHits = verifiedHits.filter(h => h.kind === "rule" && usedRuleSources.includes(h.id));
  const hasRole = (role: string) => flow.classifications.some(c => c.role === role);
  const changes: string[] = [];
  if (flow.changes.previousPosition !== null) {
    for (const issue of graph.issues.filter(i => i.state === "landlord_supported" && i.factType.endsWith("_invoice_amount"))) changes.push(`The ${issue.branch === "repainting" ? "painting" : issue.branch} cost now has documentary support (€${(issue.amountCents / 100).toFixed(0)}).`);
    if (hasRole("landlord_photographs")) changes.push("Landlord photographs now provide another account of the property condition; cause and ordinary wear remain unresolved.");
    if (hasRole("landlord_photographs") && hasRole("move_in_photos")) changes.push("Comparison with the move-in photographs is now an important next step.");
  }
  const deductions = [...new Map(graph.issues.map(i => [i.deductionFactId, i])).values()];
  return {
    runId: id, mode: flow.mode, paragraphs: flow.explanation.paragraphs,
    assessment: {
      position: graph.position ? POSITION_LABELS[graph.position] : graph.status === "no_active_dispute" ? "No active dispute" : graph.status === "unsupported" ? "Unsupported jurisdiction" : "More information needed",
      confidence: graph.confidence[0].toUpperCase() + graph.confidence.slice(1),
      revision: flow.submission.revision, disputed: graph.amount_in_dispute === null ? null : graph.amount_in_dispute / 100,
      question: graph.central_issue, supports: [...(hasRole("move_in_photos") && hasRole("move_out_photos") ? ["Move-in and move-out photographs are available for comparison."] : []), ...graph.supporting_factors], adverse: graph.adverse_factors.length ? graph.adverse_factors : deductions.length ? [`The landlord claims ${deductions.map(i => `€${(i.amountCents / 100).toFixed(0)} for ${i.branch.replaceAll("_", " ")}`).join(" and ")}; the justification still needs checking.`] : [],
      missing: [...new Set(graph.missing_evidence.filter(e => ["invoice", "condition_report", "landlord_photographs"].includes(e.role)).map(e => e.role === "invoice" ? `${graph.issues.find(i => i.deductionFactId === e.deductionFactId)?.branch === "repainting" ? "Painting" : "Cleaning"} invoice` : e.role === "landlord_photographs" ? `Landlord photographs for the ${graph.issues.find(i => i.deductionFactId === e.deductionFactId)?.branch.replaceAll("_", " ")} deduction` : e.label))],
      action: { description: graph.next_best_action.description, checklist: graph.next_best_evidence ? [graph.next_best_evidence.label] : [], escalation: graph.escalation ? `${graph.escalation.destination}: ${graph.escalation.reason}` : "No escalation recommended at this stage." },
    },
    rules: ruleHits.slice(0, 2).map(h => ({ id: h.id, title: h.source.documentTitle, url: h.source.sourceUrl, text: h.source.originalText, section: h.source.sectionHeading, page: h.source.pageNumber })),
    cases: unique.filter(h => h.kind === "case").sort((a, b) => b.score - a.score).slice(0, 1).map(h => ({ id: h.id, caseId: h.caseId, title: h.source.documentTitle, reportType: h.reportType, url: h.source.sourceUrl, text: h.source.originalText, section: h.source.sectionHeading, page: h.source.pageNumber })),
    changes: { ...flow.changes, changedFactors: changes.length ? changes : flow.changes.changedFactors }, notice: flow.mode === "offline_demo" ? "Example documents are illustrative. This assessment is calculated from their evidence using genuine public sources." : "AI interpretation checked against source references and deterministic decision rules. Unresolved claims remain unverified.",
    verificationFallback: flow.explanation.fallback,
  };
}
export type ConsumerResult = ReturnType<typeof consumerResult>;
export async function assessSubmission(input: Submission, files: Map<string, File>) {
  const s = SubmissionSchema.parse(input);
  const previous = s.previousRunId ? loadFlowRun(s.previousRunId) : undefined;
  if (previous && previous.submission.id !== s.id) throw new Error("PREVIOUS_CASE_MISMATCH");
  const interpreter = s.demo ? new OfflineDemoInterpreter() : new OpenAIInterpreter();
  const docs = await ingestUploads(s, files);
  const flow = await orchestrate(s, docs, loadCorpus(), interpreter, previous);
  return consumerResult(saveFlowRun(flow), flow);
}
