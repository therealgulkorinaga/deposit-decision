import { z } from "zod";

export const IdSchema = z.uuid();
export const MoneySchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const AnswerSchema = z.enum(["yes", "no", "unknown"]);
export const PartySchema = z.enum(["tenant", "landlord", "unknown"]);
export const EvidenceTypeSchema = z.enum([
  "tenancy_agreement",
  "condition_report",
  "move_in_photos",
  "move_out_photos",
  "landlord_messages",
  "payment_records",
  "landlord_invoices",
  "landlord_photographs",
  "utility_records",
  "other",
]);
export const RelativeFileSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes(":") &&
      !value.includes("\0") &&
      value
        .split("/")
        .every((part) => part !== ".." && part !== "." && part.length > 0),
    "Use a relative dataset path without traversal segments"
  );
export const CaseInputSchema = z
  .object({
    location: z.string().trim().min(1).max(300),
    depositCents: MoneySchema,
    returnedCents: MoneySchema,
    tenancyStart: z.iso.date(),
    tenancyEnd: z.iso.date(),
    deductionReason: z.string().trim().min(1).max(4000),
    rentOutstanding: AnswerSchema.default("unknown"),
    utilitiesOutstanding: AnswerSchema.default("unknown"),
    description: z.string().max(10000).default(""),
  })
  .strict()
  .refine((c) => c.returnedCents <= c.depositCents, {
    path: ["returnedCents"],
    message: "Returned amount exceeds deposit",
  })
  .refine((c) => c.tenancyEnd >= c.tenancyStart, {
    path: ["tenancyEnd"],
    message: "Tenancy end precedes start",
  });
export const CaseSchema = z
  .object({
    id: IdSchema,
    details: CaseInputSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const EvidenceInputSchema = z
  .object({
    type: EvidenceTypeSchema,
    sourceParty: PartySchema,
    status: z.enum(["present", "absent", "unknown"]),
    note: z.string().max(4000).default(""),
    file: z
      .object({
        relativePath: RelativeFileSchema,
        originalName: z.string().min(1).max(255),
        mediaType: z.string().min(1).max(150),
        sizeBytes: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((e) => !e.file || e.status === "present", {
    path: ["file"],
    message: "A file requires evidence to be present",
  });
export const EvidenceSchema = z
  .object({
    id: IdSchema,
    caseId: IdSchema,
    details: EvidenceInputSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const PublicDocumentInputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    sourceUrl: z.url({ protocol: /^https?$/ }),
    kind: z.enum(["rule", "case", "guidance"]),
    rawPath: RelativeFileSchema,
    processedPath: RelativeFileSchema.optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(["pending", "ingested", "failed"]).default("pending"),
  })
  .strict();
export const PublicDocumentSchema = z
  .object({
    id: IdSchema,
    details: PublicDocumentInputSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const ClaimSchema = z
  .object({
    id: IdSchema,
    caseId: IdSchema,
    category: z.enum([
      "painting",
      "cleaning",
      "damage",
      "rent",
      "utilities",
      "other",
    ]),
    amountCents: MoneySchema,
    description: z.string().min(1).max(4000),
    evidenceIds: z.array(IdSchema).max(100),
  })
  .strict();
export const RuleReferenceSchema = z
  .object({
    documentId: IdSchema,
    title: z.string().min(1),
    excerpt: z.string(),
    sourceUrl: z.url({ protocol: /^https?$/ }),
  })
  .strict();
export const ComparableCaseSchema = z
  .object({
    documentId: IdSchema,
    name: z.string().min(1),
    similarityReason: z.string(),
    outcome: z.string(),
    sourceUrl: z.url({ protocol: /^https?$/ }),
  })
  .strict();
export const RecommendedActionSchema = z
  .object({
    description: z.string(),
    checklist: z.array(z.string()),
    escalation: z.string().optional(),
  })
  .strict();
export const StructuredAssessmentSchema = z
  .object({
    id: IdSchema,
    caseId: IdSchema,
    claimId: IdSchema,
    position: z.enum([
      "strong_position",
      "worth_pursuing",
      "uncertain",
      "weak_position",
      "needs_expert_review",
    ]),
    confidence: z.enum(["high", "medium", "low"]),
    question: z.string().min(1),
    supportingFactors: z.array(z.string()),
    adverseFactors: z.array(z.string()),
    missingEvidence: z.array(z.string()),
    rules: z.array(RuleReferenceSchema),
    comparableCases: z.array(ComparableCaseSchema),
    recommendedAction: RecommendedActionSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export type CaseInput = z.infer<typeof CaseInputSchema>;
export type CaseRecord = z.infer<typeof CaseSchema>;
export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;
export type EvidenceRecord = z.infer<typeof EvidenceSchema>;
export type PublicDocumentInput = z.infer<typeof PublicDocumentInputSchema>;
export type PublicDocument = z.infer<typeof PublicDocumentSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type StructuredAssessment = z.infer<typeof StructuredAssessmentSchema>;
