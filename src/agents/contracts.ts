import { z } from "zod";
import { FactValueSchema, EvidenceTypeSchema, SourceSchema } from "../domain/ontology";
import { RoleSchema } from "../reasoning/graph/model";

const id = z.string().min(1).max(200);
const amount = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/);
export const SubmissionSchema = z.object({
  id: z.uuid(), previousRunId: z.uuid().nullable(), demo: z.boolean(), revision: z.number().int().nonnegative(),
  jurisdiction: z.enum(["IE", "other"]), location: z.string().max(300), deposit: amount, returned: amount,
  start: z.iso.date(), end: z.iso.date(), reason: z.string().max(4000), description: z.string().max(12000),
  rent: z.enum(["Yes", "No", "Unknown"]), utilities: z.enum(["Yes", "No", "Unknown"]),
  claims: z.array(z.object({ id, label: z.string().max(200), amount: z.number().nonnegative().max(1e9) }).strict()).max(8),
  evidence: z.array(z.object({ id, type: z.string().max(100), party: z.enum(["Tenant", "Landlord", "Unknown"]), status: z.enum(["present", "absent", "unknown"]), note: z.string().max(3000), filename: z.string().max(255).nullable() }).strict()).max(12),
}).strict().refine(s => s.end >= s.start, "End precedes start").refine(s => new Set(s.evidence.map(e => e.id)).size === s.evidence.length, "Duplicate evidence ID");
export type Submission = z.infer<typeof SubmissionSchema>;
export const DocumentSchema = z.object({ id, evidenceId: id, filename: z.string(), checksum: z.string(), text: z.string(), image: z.string().nullable(), sourceParty: z.enum(["tenant", "landlord", "unknown"]), pageTexts: z.array(z.object({ page: z.number().int().positive().nullable(), text: z.string() })), illustrative: z.boolean() }).strict();
export type Document = z.infer<typeof DocumentSchema>;

export const CandidateSchema = z.object({
  type: z.string(), value: FactValueSchema, source: z.object({ documentId: z.string().nullable(), quote: z.string().nullable() }).strict(),
  assertedBy: z.enum(["tenant", "landlord", "unknown"]), evidenceId: z.string().nullable(), confidence: z.number().min(0).max(1),
}).strict();
export const ExtractionSchema = z.object({ candidates: z.array(CandidateSchema) }).strict();
export const ClassificationSchema = z.object({ evidenceId: z.string(), type: EvidenceTypeSchema, role: RoleSchema, deductionTypes: z.array(z.string()), relationships: z.array(z.object({ factType: z.string(), relation: z.enum(["supports", "contradicts", "informs"]), quote: z.string().nullable() }).strict()) }).strict();
export const MappingSchema = z.object({ issueTypes: z.array(z.string()) }).strict();
const factor = z.object({ text: z.string(), factIds: z.array(z.string()), sourceIds: z.array(z.string()) }).strict();
export const AnalysisSchema = z.object({ issueId: z.string(), supportingTenant: z.array(factor), supportingLandlord: z.array(factor), relevantRuleIds: z.array(z.string()), distinctions: z.array(z.object({ sourceId: z.string(), text: z.string() }).strict()), missingFactTypes: z.array(z.string()), unresolvedQuestions: z.array(z.string()) }).strict();
// Model chooses grounded sentence IDs; it has no field for changing graph invariants or URLs.
export const ExplanationSchema = z.object({ sentenceIds: z.array(z.string()), sourceIds: z.array(z.string()) }).strict();
export const VerificationSchema = z.object({ approved: z.boolean(), reasons: z.array(z.string()) }).strict();
export const SCHEMAS = { extract: ExtractionSchema, classify: ClassificationSchema, map: MappingSchema, analyse: AnalysisSchema, explain: ExplanationSchema, verify: VerificationSchema } as const;
export type Stage = keyof typeof SCHEMAS;
export interface Interpreter {
  readonly mode: "openai" | "offline_demo";
  run<S extends Stage>(stage: S, payload: unknown): Promise<z.infer<(typeof SCHEMAS)[S]>>;
}
export const HitSchema = z.object({ id: z.string(), kind: z.enum(["rule", "case"]), caseId: z.string().nullable(), reportType: z.string(), source: SourceSchema, score: z.number().nonnegative(), tags: z.array(z.string()) }).strict();
export type Hit = z.infer<typeof HitSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
