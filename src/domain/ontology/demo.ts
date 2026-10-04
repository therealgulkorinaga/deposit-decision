import { CaseSchema, type Case, type Evidence, type Fact, type Relationship } from "./index";

// Fictional fixtures supplied by the product brief, never ingested public cases.
const money = (cents: number) => ({ kind: "money" as const, cents, currency: "EUR" as const });
const fact = (id: string, value: Fact["value"], assertedBy: string | null = "tenant", state: Fact["verificationState"] = "asserted"): Fact => ({ id, type: id, value, assertedBy, origin: assertedBy ? "party_assertion" : "unknown", evidenceIds: [], verificationState: state, confidence: null, occurredAt: null, sources: [] });
const evidence = (id: string, type: Evidence["type"], sourceParty = "tenant"): Evidence => ({ id, type, sourceParty, documentReference: { id: `demo-document:${id}`, label: `Illustrative ${id}; no actual file supplied`, kind: "demo_placeholder", sources: [] }, date: null, reviewState: "unreviewed", reviewNote: "" });
const relevant = (from: string, to: string): Relationship => ({ type: "relevant_to", from, to });

export function createDemoCase(): Case {
  return CaseSchema.parse({
    schemaVersion: 1, id: "demo:deposit-dispute", recordKind: "illustrative_demo", jurisdiction: "IE", claimType: "deposit_retention", status: "under_review", position: null,
    parties: [{ id: "tenant", type: "tenant", name: "Demo tenant" }, { id: "landlord", type: "landlord", name: "Demo landlord" }],
    claims: [{ id: "deposit-claim", type: "deposit_retention", currency: "EUR", amountClaimedCents: 100000, amountDisputedCents: 100000, claimant: "tenant", respondent: "landlord", status: "open" }],
    facts: [fact("deposit_paid", money(150000)), fact("deposit_returned", money(50000)), fact("painting_deduction", money(70000)), fact("cleaning_deduction", money(30000)), fact("tenancy_duration_months", { kind: "months", months: 36 }),
      fact("tenant_caused_damage", null, null, "unknown"), fact("damage_beyond_ordinary_wear", null, null, "unknown"),
      fact("painting_invoice_amount", null, null, "missing"), fact("cleaning_invoice_amount", null, null, "missing"), fact("landlord_damage_photographs_supplied", null, null, "missing"), fact("landlord_condition_report_supplied", null, null, "missing")],
    evidence: [evidence("tenancy-agreement", "tenancy_agreement"), evidence("move-in-photos", "photograph"), evidence("move-out-photos", "photograph"), evidence("landlord-messages", "message", "landlord")],
    issues: [
      { id: "painting", claimId: "deposit-claim", type: "painting_cost_justified", question: "Is the €700 painting deduction justified?", status: "open" },
      { id: "cleaning", claimId: "deposit-claim", type: "cleaning_cost_justified", question: "Is the €300 cleaning deduction justified?", status: "open" },
      { id: "damage", claimId: "deposit-claim", type: "tenant_damage_occurred", question: "Is there evidence of tenant-caused damage beyond ordinary wear?", status: "open" },
      { id: "costs", claimId: "deposit-claim", type: "claimed_cost_supported", question: "What evidence supports the claimed costs?", status: "open" }],
    rules: [], decisions: [], actions: [], riskTriggers: [], escalations: [],
    relationships: [
      ...["painting", "cleaning"].flatMap(i => [relevant("deposit_paid", i), relevant("deposit_returned", i)]),
      relevant("painting_deduction", "painting"), relevant("painting_deduction", "costs"), relevant("cleaning_deduction", "cleaning"), relevant("cleaning_deduction", "costs"),
      relevant("tenancy_duration_months", "painting"), relevant("tenancy_duration_months", "damage"),
      relevant("tenant_caused_damage", "damage"), relevant("tenant_caused_damage", "painting"), relevant("damage_beyond_ordinary_wear", "damage"), relevant("damage_beyond_ordinary_wear", "painting"),
      relevant("painting_invoice_amount", "costs"), relevant("painting_invoice_amount", "painting"), relevant("cleaning_invoice_amount", "costs"), relevant("cleaning_invoice_amount", "cleaning"),
      relevant("landlord_damage_photographs_supplied", "damage"), relevant("landlord_condition_report_supplied", "damage")],
  });
}

/** Authored demo update: reviews only document availability and invoice face value. */
export function createDemoWithNewEvidence(): Case {
  const c = createDemoCase();
  const invoice = evidence("painting-invoice", "invoice", "landlord");
  invoice.reviewState = "reviewed";
  invoice.reviewNote = "Illustrative review: the supplied invoice states €700 for painting. Authenticity, payment, necessity and liability are not established.";
  const photos = evidence("landlord-damage-photos", "photograph", "landlord");
  photos.reviewState = "reviewed";
  photos.reviewNote = "Illustrative review confirms that photographs were supplied. Date, location, damage, causation and ordinary wear remain unassessed.";
  c.evidence.push(invoice, photos);
  for (const [id, value, evidenceId] of [
    ["painting_invoice_amount", money(70000), invoice.id],
    ["landlord_damage_photographs_supplied", { kind: "boolean", value: true }, photos.id],
  ] as const) {
    const f = c.facts.find(f => f.id === id)!;
    Object.assign(f, { value, origin: "document_review", verificationState: "corroborated", evidenceIds: [evidenceId] });
    c.relationships.push({ type: "supports", from: evidenceId, to: id });
  }
  return CaseSchema.parse(c);
}
