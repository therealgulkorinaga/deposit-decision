import type {
  CaseInput,
  EvidenceInput,
  PublicDocumentInput,
} from "../src/domain/schemas";

export const caseInput: CaseInput = {
  location: "Dublin",
  depositCents: 150000,
  returnedCents: 50000,
  tenancyStart: "2021-06-01",
  tenancyEnd: "2024-06-01",
  deductionReason: "Painting and cleaning",
  rentOutstanding: "no",
  utilitiesOutstanding: "unknown",
  description: "Synthetic test case",
};
export const evidenceInput: EvidenceInput = {
  type: "landlord_invoices",
  sourceParty: "landlord",
  status: "present",
  note: "Synthetic invoice metadata",
  file: {
    relativePath: "raw/test-invoice.pdf",
    originalName: "test-invoice.pdf",
    mediaType: "application/pdf",
    sizeBytes: 123,
  },
};
export const documentInput: PublicDocumentInput = {
  title: "Synthetic public document",
  sourceUrl: "https://example.org/test-document",
  kind: "case",
  rawPath: "raw/public-example.txt",
  sha256: "a".repeat(64),
  status: "ingested",
};
export const caseId = "d635617d-ecde-47b1-aa4c-27d1c3c217d9";
export const claimId = "683385ca-4a8e-4cef-bf30-8e2649c02c1d";
export const evidenceId = "102937a5-1711-4d11-9d8a-d7888412dd54";
export const now = "2026-01-01T12:00:00.000Z";
export const claimContext = {
  case: { id: caseId, details: caseInput, createdAt: now, updatedAt: now },
  claim: {
    id: claimId,
    caseId,
    category: "painting",
    amountCents: 70000,
    description: "Painting deduction",
    evidenceIds: [evidenceId],
  },
  evidence: [
    {
      id: evidenceId,
      caseId,
      details: evidenceInput,
      createdAt: now,
      updatedAt: now,
    },
  ],
};
export const previousAssessment = {
  id: "9a2e0293-d3b8-4b14-bd42-22a1080f3856",
  caseId,
  claimId,
  position: "worth_pursuing",
  confidence: "medium",
  question: "Synthetic question",
  supportingFactors: [],
  adverseFactors: [],
  missingEvidence: [],
  rules: [],
  comparableCases: [],
  recommendedAction: { description: "Ask for documents", checklist: [] },
  createdAt: now,
};
