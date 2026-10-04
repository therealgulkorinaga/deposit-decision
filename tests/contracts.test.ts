import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CaseInputSchema,
  EvidenceInputSchema,
  RelativeFileSchema,
} from "../src/domain/schemas";
import {
  AssessClaimRequestSchema,
  ReassessClaimRequestSchema,
} from "../src/services/contracts";
import {
  caseInput,
  claimContext,
  evidenceInput,
  previousAssessment,
} from "./fixtures";

test("domain uses integer cents and enforces financial/date invariants", () => {
  assert.ok(CaseInputSchema.safeParse(caseInput).success);
  assert.ok(
    !CaseInputSchema.safeParse({ ...caseInput, returnedCents: 150001 }).success
  );
  assert.ok(
    !CaseInputSchema.safeParse({ ...caseInput, depositCents: 150000.5 }).success
  );
  assert.ok(
    !CaseInputSchema.safeParse({ ...caseInput, tenancyEnd: "2020-01-01" })
      .success
  );
  assert.ok(
    !CaseInputSchema.safeParse({ ...caseInput, tenancyEnd: "2024-02-31" })
      .success
  );
});
test("metadata rejects traversal and files marked absent", () => {
  for (const invalid of [
    "../secret",
    "/etc/passwd",
    "raw/../../secret",
    "C:\\secret",
    "raw//file",
  ])
    assert.ok(!RelativeFileSchema.safeParse(invalid).success);
  assert.ok(RelativeFileSchema.safeParse("raw/example.pdf").success);
  assert.ok(
    !EvidenceInputSchema.safeParse({ ...evidenceInput, status: "absent" })
      .success
  );
});
test("assessment contracts cannot mix cases or omit referenced evidence", () => {
  assert.ok(AssessClaimRequestSchema.safeParse(claimContext).success);
  assert.ok(
    !AssessClaimRequestSchema.safeParse({ ...claimContext, evidence: [] })
      .success
  );
  assert.ok(
    !AssessClaimRequestSchema.safeParse({
      ...claimContext,
      claim: {
        ...claimContext.claim,
        caseId: "fe88d3bb-c8b6-43d9-8b26-090e448eeb24",
      },
    }).success
  );
  assert.ok(
    ReassessClaimRequestSchema.safeParse({
      context: claimContext,
      previousAssessment,
    }).success
  );
  assert.ok(
    !ReassessClaimRequestSchema.safeParse({
      context: claimContext,
      previousAssessment: {
        ...previousAssessment,
        claimId: "fe88d3bb-c8b6-43d9-8b26-090e448eeb24",
      },
    }).success
  );
});
