import { z } from "zod";
import {
  CaseSchema,
  ClaimSchema,
  ComparableCaseSchema,
  EvidenceInputSchema,
  EvidenceSchema,
  IdSchema,
  RuleReferenceSchema,
  StructuredAssessmentSchema,
} from "../domain/schemas";

import {
  IngestionRequestSchema,
  IngestionResultSchema,
} from "../ingestion/schemas";
export const IngestDocumentRequestSchema = IngestionRequestSchema;
export const IngestDocumentResultSchema = IngestionResultSchema;
export const RetrieveCasesRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();
export const RetrieveCasesResultSchema = z
  .object({ cases: z.array(ComparableCaseSchema) })
  .strict();
export const RetrieveRulesRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();
export const RetrieveRulesResultSchema = z
  .object({ rules: z.array(RuleReferenceSchema) })
  .strict();
export const AssessClaimRequestSchema = z
  .object({
    case: CaseSchema,
    claim: ClaimSchema,
    evidence: z.array(EvidenceSchema).max(100),
  })
  .strict()
  .refine(
    (v) =>
      v.claim.caseId === v.case.id &&
      v.evidence.every((e) => e.caseId === v.case.id) &&
      v.claim.evidenceIds.every((id) => v.evidence.some((e) => e.id === id)),
    {
      message:
        "Claim and evidence must belong to this case and all referenced evidence must be included",
    }
  );
export const AssessClaimResultSchema = z
  .object({ assessment: StructuredAssessmentSchema })
  .strict();
export const UpdateEvidenceRequestSchema = z
  .object({
    caseId: IdSchema,
    evidenceId: IdSchema,
    evidence: EvidenceInputSchema,
  })
  .strict();
export const UpdateEvidenceResultSchema = z
  .object({ evidence: EvidenceSchema })
  .strict();
export const ReassessClaimRequestSchema = z
  .object({
    context: AssessClaimRequestSchema,
    previousAssessment: StructuredAssessmentSchema,
  })
  .strict()
  .refine(
    (v) =>
      v.previousAssessment.caseId === v.context.case.id &&
      v.previousAssessment.claimId === v.context.claim.id,
    { message: "Previous assessment must refer to the same case and claim" }
  );
export const ReassessClaimResultSchema = z
  .object({
    previousAssessmentId: IdSchema,
    assessment: StructuredAssessmentSchema,
    changed: z.boolean(),
    changeSummary: z.string(),
  })
  .strict();

export type IngestDocumentRequest = z.infer<typeof IngestDocumentRequestSchema>;
export type IngestDocumentResult = z.infer<typeof IngestDocumentResultSchema>;
export type RetrieveCasesRequest = z.infer<typeof RetrieveCasesRequestSchema>;
export type RetrieveCasesResult = z.infer<typeof RetrieveCasesResultSchema>;
export type RetrieveRulesRequest = z.infer<typeof RetrieveRulesRequestSchema>;
export type RetrieveRulesResult = z.infer<typeof RetrieveRulesResultSchema>;
export type AssessClaimRequest = z.infer<typeof AssessClaimRequestSchema>;
export type AssessClaimResult = z.infer<typeof AssessClaimResultSchema>;
export type UpdateEvidenceRequest = z.infer<typeof UpdateEvidenceRequestSchema>;
export type UpdateEvidenceResult = z.infer<typeof UpdateEvidenceResultSchema>;
export type ReassessClaimRequest = z.infer<typeof ReassessClaimRequestSchema>;
export type ReassessClaimResult = z.infer<typeof ReassessClaimResultSchema>;

export interface PipelineServices {
  ingestDocument(input: IngestDocumentRequest): Promise<IngestDocumentResult>;
  retrieveCases(input: RetrieveCasesRequest): Promise<RetrieveCasesResult>;
  retrieveRules(input: RetrieveRulesRequest): Promise<RetrieveRulesResult>;
  assessClaim(input: AssessClaimRequest): Promise<AssessClaimResult>;
  updateEvidence(input: UpdateEvidenceRequest): Promise<UpdateEvidenceResult>;
  reassessClaim(input: ReassessClaimRequest): Promise<ReassessClaimResult>;
}
