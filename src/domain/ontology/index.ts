import { z } from "zod";
import { ProvenanceSchema, type ProcessedDocument } from "../../ingestion/schemas";

const Id = z.string().min(1);
const Text = z.string().trim().min(1);
const Cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Confidence = z.number().min(0).max(1).nullable();
export const StateSchema = z.enum(["asserted", "corroborated", "contradicted", "missing", "unknown"]);
export const PositionSchema = z.enum(["strong", "worth_pursuing", "uncertain", "weak", "expert_review"]);
export const EvidenceTypeSchema = z.enum(["tenancy_agreement", "inventory", "photograph", "invoice", "bank_record", "message", "receipt", "utility_record", "witness_statement", "other"]);
export const SourceSchema = ProvenanceSchema.extend({
  sourceUrl: z.url({ protocol: /^https?$/ }), checksum: z.string().regex(/^[a-f0-9]{64}$/),
  chunkId: Id, originalText: Text,
}).strict().refine(s => s.rawEnd > s.rawStart && s.originalText.length === s.rawEnd - s.rawStart, "Source offsets must preserve exact original text");
export const PartySchema = z.object({ id: Id, type: z.enum(["tenant", "landlord", "property_manager", "other"]), name: Text }).strict();
export const ClaimSchema = z.object({ id: Id, type: z.literal("deposit_retention"), currency: z.literal("EUR"), amountClaimedCents: Cents, amountDisputedCents: Cents, claimant: Id, respondent: Id, status: z.enum(["open", "withdrawn", "settled", "determined"]) }).strict().refine(c => c.amountDisputedCents <= c.amountClaimedCents && c.claimant !== c.respondent, "Invalid claim amounts or parties");
export const FactValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("money"), cents: Cents, currency: z.literal("EUR") }).strict(),
  z.object({ kind: z.literal("months"), months: z.number().int().nonnegative() }).strict(),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
  z.object({ kind: z.literal("text"), value: Text }).strict(),
]);
export const FactSchema = z.object({
  id: Id, type: Text, value: FactValueSchema.nullable(), assertedBy: Id.nullable(),
  origin: z.enum(["party_assertion", "document_review", "external_case", "unknown"]),
  evidenceIds: z.array(Id), verificationState: StateSchema, confidence: Confidence,
  occurredAt: z.iso.date().nullable(), sources: z.array(SourceSchema),
}).strict().superRefine((f, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (f.origin === "party_assertion" && !f.assertedBy) fail("An assertion requires its party");
  if (f.origin === "external_case" && !f.sources.length) fail("External case information requires provenance");
  if (["missing", "unknown"].includes(f.verificationState) && (f.value !== null || f.confidence !== null)) fail("Missing/unknown facts have no established value or confidence");
  if (!["missing", "unknown"].includes(f.verificationState) && f.value === null) fail("A stated proposition requires a value");
});
export const EvidenceSchema = z.object({
  id: Id, type: EvidenceTypeSchema, sourceParty: Id,
  documentReference: z.object({ id: Id, label: Text, kind: z.enum(["private_document", "ingested_document", "demo_placeholder"]), sources: z.array(SourceSchema) }).strict(),
  date: z.iso.date().nullable(), reviewState: z.enum(["unreviewed", "reviewed"]),
  reviewNote: z.string(),
}).strict().superRefine((e, ctx) => {
  if (e.documentReference.kind === "ingested_document" && !e.documentReference.sources.length) ctx.addIssue({ code: "custom", message: "Ingested evidence requires provenance" });
  if (e.reviewState === "reviewed" && !e.reviewNote.trim()) ctx.addIssue({ code: "custom", message: "Reviewed evidence requires a review note" });
});
export const RuleSchema = z.object({ id: Id, topic: Text, jurisdiction: Text, kind: z.enum(["legislation", "guidance"]), effectiveDate: z.iso.date().nullable(), source: Text, summary: Text, sources: z.array(SourceSchema).min(1) }).strict();
export const IssueSchema = z.object({ id: Id, claimId: Id, type: Text, question: Text, status: z.enum(["open", "resolved"]) }).strict();
export const ActionSchema = z.object({ id: Id, type: z.enum(["request_itemisation", "request_invoice", "request_photographs", "request_inventory", "request_deposit_return", "escalate_to_rtb", "obtain_expert_review", "no_action"]), description: Text }).strict();
export const DecisionSchema = z.object({ id: Id, issueId: Id, status: z.enum(["provisional", "determined"]), outcome: z.enum(["supported", "not_supported", "undetermined"]), supportingFactIds: z.array(Id), adverseFactIds: z.array(Id), appliedRuleIds: z.array(Id), unresolvedFactIds: z.array(Id), rationale: Text, confidence: Confidence, sources: z.array(SourceSchema) }).strict();
export const RiskTriggerSchema = z.object({ id: Id, description: Text, factIds: z.array(Id) }).strict();
export const EscalationSchema = z.object({ id: Id, triggerId: Id, destination: Text, reason: Text, requiredEvidence: z.array(EvidenceTypeSchema), unresolvedIssueId: Id }).strict();

const edge = <T extends string>(type: T) => z.object({ type: z.literal(type), from: Id, to: Id }).strict();
export const RelationshipSchema = z.discriminatedUnion("type", [edge("supports"), edge("contradicts"), edge("neutral"), edge("relevant_to"), edge("governs"), edge("resolves"), edge("recommends"), edge("lowers_confidence"), edge("causes")]);
export const CaseSchema = z.object({
  schemaVersion: z.literal(1), id: Id, recordKind: z.enum(["live", "illustrative_demo"]), jurisdiction: Text,
  claimType: z.literal("deposit_retention"), status: z.enum(["draft", "under_review", "closed"]), position: PositionSchema.nullable(),
  parties: z.array(PartySchema), claims: z.array(ClaimSchema), facts: z.array(FactSchema), evidence: z.array(EvidenceSchema), rules: z.array(RuleSchema), issues: z.array(IssueSchema), decisions: z.array(DecisionSchema), actions: z.array(ActionSchema), riskTriggers: z.array(RiskTriggerSchema), escalations: z.array(EscalationSchema), relationships: z.array(RelationshipSchema),
}).strict().superRefine((c, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const groups = { parties: c.parties, claims: c.claims, facts: c.facts, evidence: c.evidence, rules: c.rules, issues: c.issues, decisions: c.decisions, actions: c.actions, riskTriggers: c.riskTriggers, escalations: c.escalations };
  const all = new Set<string>();
  for (const items of Object.values(groups)) for (const item of items) { if (all.has(item.id)) fail(`Duplicate entity ID: ${item.id}`); all.add(item.id); }
  const ref = (group: keyof typeof groups, id: string) => { if (!groups[group].some(x => x.id === id)) fail(`Unknown ${group} reference: ${id}`); };
  const has = (type: string, from: string, to: string) => c.relationships.some(r => r.type === type && r.from === from && r.to === to);
  const need = (type: string, from: string, to: string) => { if (!has(type, from, to)) fail(`Missing ${type} relationship: ${from} → ${to}`); };
  for (const claim of c.claims) { ref("parties", claim.claimant); ref("parties", claim.respondent); }
  for (const e of c.evidence) { ref("parties", e.sourceParty); if (c.recordKind === "live" && e.documentReference.kind === "demo_placeholder") fail("Live records cannot contain demo documents"); }
  for (const issue of c.issues) { ref("claims", issue.claimId); if (issue.status === "resolved" && !c.decisions.some(d => d.issueId === issue.id && d.status === "determined" && d.outcome !== "undetermined")) fail("Resolved issue requires a determination"); }
  for (const rule of c.rules) if (rule.jurisdiction !== c.jurisdiction) fail("Rule jurisdiction mismatch");
  for (const f of c.facts) {
    if (f.assertedBy) ref("parties", f.assertedBy);
    for (const id of f.evidenceIds) { ref("evidence", id); if (!["supports", "contradicts", "neutral"].some(t => has(t, id, f.id))) fail("Fact evidence reference requires an explicit relationship"); }
    const support = c.relationships.some(r => r.type === "supports" && r.to === f.id);
    const contradiction = c.relationships.some(r => r.type === "contradicts" && r.to === f.id);
    if (f.verificationState === "corroborated" && (!support || contradiction)) fail("Corroboration needs reviewed support and no unresolved contradiction");
    if (f.verificationState === "contradicted" && !contradiction) fail("Contradicted fact requires reviewed contradictory evidence");
    if (contradiction && f.verificationState !== "contradicted") fail("Contradiction must remain visible in the fact state");
  }
  const endpoints = { supports: ["evidence", "facts"], contradicts: ["evidence", "facts"], neutral: ["evidence", "facts"], relevant_to: ["facts", "issues"], governs: ["rules", "issues"], resolves: ["decisions", "issues"], recommends: ["decisions", "actions"], lowers_confidence: ["facts", "decisions"], causes: ["riskTriggers", "escalations"] } as const;
  const seen = new Set<string>();
  for (const r of c.relationships) {
    const key = JSON.stringify(r); if (seen.has(key)) fail("Duplicate relationship"); seen.add(key);
    const [from, to] = endpoints[r.type]; ref(from, r.from); ref(to, r.to);
    if (["supports", "contradicts", "neutral"].includes(r.type)) {
      const e = c.evidence.find(e => e.id === r.from); const f = c.facts.find(f => f.id === r.to);
      if (e?.reviewState !== "reviewed") fail("Unreviewed evidence cannot support or contradict a fact");
      if (!f?.evidenceIds.includes(r.from)) fail("Relationship must appear in fact evidenceIds");
    }
    if (r.type === "lowers_confidence" && (!c.facts.some(f => f.id === r.from && f.verificationState === "missing") || !c.decisions.some(d => d.id === r.to && d.unresolvedFactIds.includes(r.from)))) fail("MissingFact must be missing and unresolved by the decision");
    if (r.type === "resolves" && !c.decisions.some(d => d.id === r.from && d.issueId === r.to && d.status === "determined" && d.outcome !== "undetermined")) fail("Only an actual determination resolves its issue");
    if (r.type === "causes" && !c.escalations.some(e => e.id === r.to && e.triggerId === r.from)) fail("Escalation trigger mismatch");
  }
  for (const d of c.decisions) {
    ref("issues", d.issueId);
    for (const id of [...d.supportingFactIds, ...d.adverseFactIds, ...d.unresolvedFactIds]) { ref("facts", id); need("relevant_to", id, d.issueId); }
    for (const id of d.appliedRuleIds) { ref("rules", id); need("governs", id, d.issueId); }
    const inheritedSources = [...c.rules.filter(r => d.appliedRuleIds.includes(r.id)), ...c.facts.filter(f => [...d.supportingFactIds, ...d.adverseFactIds, ...d.unresolvedFactIds].includes(f.id))].flatMap(entity => entity.sources);
    for (const source of inheritedSources) if (!d.sources.some(s => JSON.stringify(s) === JSON.stringify(source))) fail("Decision must retain the exact provenance of referenced rules and externally sourced facts");
    if (d.status === "determined") { if (d.outcome === "undetermined") fail("A determination needs an outcome"); need("resolves", d.id, d.issueId); }
    for (const id of d.unresolvedFactIds) if (c.facts.some(f => f.id === id && f.verificationState === "missing")) need("lowers_confidence", id, d.id);
  }
  for (const t of c.riskTriggers) for (const id of t.factIds) ref("facts", id);
  for (const e of c.escalations) { ref("riskTriggers", e.triggerId); ref("issues", e.unresolvedIssueId); need("causes", e.triggerId, e.id); if (c.issues.find(i => i.id === e.unresolvedIssueId)?.status !== "open") fail("Escalation requires an unresolved issue"); }
});

/** Copy an exact ingestion chunk; reject incomplete or detached provenance. No inference. */
export function sourceFromChunk(document: ProcessedDocument, chunkId: string): Source {
  const chunk = document.chunks.find(c => c.id === chunkId);
  if (!chunk) throw new Error("Unknown ingestion chunk");
  const p = chunk.provenance;
  if (p.sourceDocumentId !== document.documentId || p.sourceUrl !== document.sourceUrl || p.checksum !== document.checksum || p.documentTitle !== document.title || p.documentType !== document.documentType || p.date !== document.date || document.rawText.slice(p.rawStart, p.rawEnd) !== chunk.text || !document.sections.some(s => s.id === chunk.sectionId && s.heading === p.sectionHeading && s.rawStart <= p.rawStart && s.rawEnd >= p.rawEnd) || !document.pages.some(page => page.pageNumber === p.pageNumber && page.rawStart <= p.rawStart && page.rawEnd >= p.rawEnd)) throw new Error("Detached ingestion provenance");
  return SourceSchema.parse({ ...p, chunkId, originalText: chunk.text });
}

export type Case = z.infer<typeof CaseSchema>;
export type Party = z.infer<typeof PartySchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Escalation = z.infer<typeof EscalationSchema>;
export type RiskTrigger = z.infer<typeof RiskTriggerSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Position = z.infer<typeof PositionSchema>;
