import { z } from "zod";
import { CaseSchema, EvidenceTypeSchema, IssueSchema, PositionSchema, RuleSchema, SourceSchema } from "../../domain/ontology";

export const BranchSchema = z.enum(["property_damage", "repainting", "cleaning", "rent_arrears", "utilities", "missing_items", "early_termination", "other"]);
export type Branch = z.infer<typeof BranchSchema>;
export const RoleSchema = z.enum(["move_in_photos", "move_out_photos", "landlord_photographs", "signed_inventory", "condition_report", "damage_messages", "invoice", "contractor_estimate", "proof_of_payment", "work_description", "tenancy_agreement", "rent_ledger", "utility_bill", "notice", "other"]);
export type EvidenceRole = z.infer<typeof RoleSchema>;
export const AssignmentSchema = z.object({ evidenceId: z.string().min(1), deductionFactId: z.string().nullable(), role: RoleSchema }).strict();
export const CatalogueEntrySchema = z.object({
  rule: RuleSchema, issueTypes: z.array(z.string()).min(1),
  scope: z.enum(["evidence_guidance", "deduction_guidance", "legislation"]),
  reviewedOn: z.iso.date(), reviewBy: z.iso.date(),
}).strict().refine(e => e.reviewBy >= e.reviewedOn, "Invalid source review window")
  .refine(e => e.scope !== "legislation" || (e.rule.kind === "legislation" && e.rule.sources.every(s => s.documentType === "legislation")), "Legislation scope requires legislative sources");
export const GraphIssueAnalysisSchema = z.object({ issueId: z.string(), supportingFactIds: z.array(z.string()), adverseFactIds: z.array(z.string()), missingFactTypes: z.array(z.string()), sourceReferences: z.array(SourceSchema) }).strict();
export const OptionsSchema = z.object({ asOf: z.iso.date(), catalogue: z.array(CatalogueEntrySchema), evidenceAssignments: z.array(AssignmentSchema).default([]), issueAnalyses: z.array(GraphIssueAnalysisSchema).optional() }).strict();
export const RequestSchema = z.object({ case: CaseSchema, options: OptionsSchema }).strict();
export type Options = z.infer<typeof OptionsSchema>;
export type CatalogueEntry = z.infer<typeof CatalogueEntrySchema>;

export const DependencySchema = z.object({
  role: RoleSchema, evidenceTypes: z.array(EvidenceTypeSchema), label: z.string(),
  evidenceIds: z.array(z.string()), state: z.enum(["absent", "supplied_unreviewed", "reviewed"]),
}).strict();
export const IssueEvaluationSchema = z.object({
  issue: IssueSchema, deductionFactId: z.string(), branch: BranchSchema, amountCents: z.number().int().nonnegative(),
  factType: z.string(), factIds: z.array(z.string()), assertedFactIds: z.array(z.string()),
  supportingEvidenceIds: z.array(z.string()), contradictingEvidenceIds: z.array(z.string()),
  neutralEvidenceIds: z.array(z.string()), unreviewedEvidenceIds: z.array(z.string()),
  state: z.enum(["unresolved", "conflicted", "landlord_supported", "tenant_supported"]),
  ruleIds: z.array(z.string()), ruleAvailable: z.boolean(), dependencies: z.array(DependencySchema),
  rationale: z.string(), sources: z.array(SourceSchema),
}).strict();
export type IssueEvaluation = z.infer<typeof IssueEvaluationSchema>;
export const TraceSchema = z.object({ step: z.number().int().positive(), nodeId: z.string(), issueId: z.string().nullable(), result: z.string(), explanation: z.string(), factIds: z.array(z.string()), evidenceIds: z.array(z.string()), ruleIds: z.array(z.string()), sources: z.array(SourceSchema) }).strict();
export const NextEvidenceSchema = z.object({ issueIds: z.array(z.string()), deductionFactId: z.string(), role: RoleSchema, label: z.string(), operation: z.enum(["request", "review"]), evidenceIds: z.array(z.string()), priority: z.number(), reason: z.string() }).strict();
export const ResultSchema = z.object({
  graphVersion: z.literal("1.0.0"), caseId: z.string(), status: z.enum(["assessed", "no_active_dispute", "unsupported", "needs_input"]),
  amount_in_dispute: z.number().int().nonnegative().nullable(), currency: z.literal("EUR"), amountBasis: z.enum(["corroborated", "asserted", "unresolved"]),
  position: PositionSchema.nullable(), confidence: z.enum(["high", "medium", "low"]), central_issue: z.string(),
  supporting_factors: z.array(z.string()), adverse_factors: z.array(z.string()), unresolved_facts: z.array(z.object({ issueId: z.string(), factType: z.string(), factIds: z.array(z.string()) }).strict()),
  missing_evidence: z.array(NextEvidenceSchema), next_best_evidence: NextEvidenceSchema.nullable(),
  next_best_action: z.object({ type: z.enum(["no_action", "request_itemisation", "request_evidence", "review_evidence", "request_deposit_return", "obtain_expert_review"]), description: z.string(), issueIds: z.array(z.string()) }).strict(),
  escalation: z.object({ destination: z.string(), reason: z.string(), issueIds: z.array(z.string()) }).strict().nullable(),
  issues: z.array(IssueEvaluationSchema), decision_trace: z.array(TraceSchema), source_references: z.array(SourceSchema),
}).strict();
export type GraphResult = z.infer<typeof ResultSchema>;

export const NodeSchema = z.object({ id: z.string(), question: z.string(), requiredInputs: z.array(z.string()), evaluationMethod: z.string(), possibleResults: z.array(z.string()), nextNodes: z.array(z.string()), provenanceRequirements: z.array(z.string()), escalationConditions: z.array(z.string()) }).strict();
export type Node = z.infer<typeof NodeSchema>;
