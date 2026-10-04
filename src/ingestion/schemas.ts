import { z } from "zod";
import { RelativeFileSchema } from "../domain/schemas";

export const DocumentTypeSchema = z.enum([
  "rtb_determination_order",
  "rtb_adjudication_report",
  "rtb_guidance",
  "legislation",
  "statistics",
  "unknown",
]);
export const MetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(1000).optional(),
    sourceOrganisation: z.string().trim().min(1).max(300).optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
    date: z.iso.date().optional(),
    dateKind: z.enum(["publication", "decision"]).optional(),
    documentType: DocumentTypeSchema.optional(),
  })
  .strict();
export type SourceMetadata = z.infer<typeof MetadataSchema>;
export type DocumentType = z.infer<typeof DocumentTypeSchema>;
export const PageSchema = z.object({
  pageNumber: z.number().int().positive().nullable(),
  text: z.string(),
  rawStart: z.number().int().nonnegative(),
  rawEnd: z.number().int().nonnegative(),
});
export const SectionSchema = z.object({
  id: z.string(),
  heading: z.string().nullable(),
  kind: z.enum([
    "background",
    "evidence",
    "findings",
    "decision",
    "order",
    "statutory_section",
    "guidance_topic",
    "other",
  ]),
  rawStart: z.number().int().nonnegative(),
  rawEnd: z.number().int().nonnegative(),
});
export const ProvenanceSchema = z.object({
  sourceDocumentId: z.uuid(),
  sourceUrl: z.url().nullable(),
  documentTitle: z.string(),
  documentType: DocumentTypeSchema,
  date: z.iso.date().nullable(),
  pageNumber: z.number().int().positive().nullable(),
  sectionHeading: z.string().nullable(),
  checksum: z.string(),
  rawStart: z.number().int().nonnegative(),
  rawEnd: z.number().int().nonnegative(),
});
export const ChunkSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  text: z.string(),
  splitReason: z.enum(["section", "page", "length_safeguard"]),
  provenance: ProvenanceSchema,
});
export const ExcerptSchema = z.object({
  text: z.string(),
  sectionId: z.string(),
  rawStart: z.number().int().nonnegative(),
  rawEnd: z.number().int().nonnegative(),
  pageNumbers: z.array(z.number().int().positive()),
});
export const PreliminaryCaseSchema = z.object({
  caseId: z.string(),
  title: z.string(),
  date: z.iso.date().nullable(),
  sourceUrl: z.url().nullable(),
  sourceDocumentId: z.uuid(),
  rawFactualSummary: z.array(ExcerptSchema).nullable(),
  rawEvidenceSection: z.array(ExcerptSchema).nullable(),
  rawFindings: z.array(ExcerptSchema).nullable(),
  rawOutcomeOrder: z.array(ExcerptSchema).nullable(),
  extractionNote: z.literal(
    "Verbatim section excerpts, not a generated factual or legal summary."
  ),
});
export const ProcessedDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  processorVersion: z.string(),
  documentId: z.uuid(),
  checksum: z.string(),
  metadataFingerprint: z.string(),
  originalFile: z.string(),
  ingestionTimestamp: z.iso.datetime(),
  title: z.string(),
  sourceOrganisation: z.string().nullable(),
  sourceUrl: z.url().nullable(),
  date: z.iso.date().nullable(),
  dateKind: z.enum(["publication", "decision"]).nullable(),
  documentType: DocumentTypeSchema,
  subtype: z.literal("rtb_tribunal_report").nullable(),
  metadataOrigins: z.record(z.string(), z.string()),
  classificationBasis: z.string(),
  dateEvidence: z.string().nullable(),
  depositRelevance: z.enum(["explicit_mention", "review_required"]),
  rawText: z.string(),
  pages: z.array(PageSchema),
  sections: z.array(SectionSchema),
  chunks: z.array(ChunkSchema),
  preliminaryCase: PreliminaryCaseSchema.nullable(),
  warnings: z.array(z.string()),
});
export const ManifestEntrySchema = z.object({
  documentId: z.uuid().nullable(),
  originalFile: z.string(),
  source: z.object({
    organisation: z.string().nullable(),
    url: z.string().nullable(),
  }),
  checksum: z.string().nullable(),
  ingestionTimestamp: z.iso.datetime(),
  documentType: DocumentTypeSchema,
  chunkCount: z.number().int().nonnegative(),
  status: z.enum(["ingested", "unchanged", "duplicate", "failed"]),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  processedFile: z.string().nullable(),
  outputChecksum: z.string().nullable(),
  metadataFingerprint: z.string().nullable(),
  duplicateOf: z.string().nullable(),
});
export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  processorVersion: z.string(),
  runStatus: z.enum(["running", "complete"]),
  updatedAt: z.iso.datetime(),
  entries: z.array(ManifestEntrySchema),
});
export const IngestionRequestSchema = z
  .object({ rawPath: RelativeFileSchema })
  .strict();
export const IngestionResultSchema = z.object({
  entry: ManifestEntrySchema,
  document: ProcessedDocumentSchema.nullable(),
});
export type ProcessedDocument = z.infer<typeof ProcessedDocumentSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Chunk = z.infer<typeof ChunkSchema>;
export type Extracted = {
  pages: { pageNumber: number | null; text: string }[];
  metadata: SourceMetadata;
  headings: string[];
  warnings: string[];
};
