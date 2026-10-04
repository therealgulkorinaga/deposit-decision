import type { Branch, EvidenceRole, Node } from "./model";
import type { Evidence } from "../../domain/ontology";

export const ROLES: Record<EvidenceRole, { types: Evidence["type"][]; label: string }> = {
  move_in_photos: { types: ["photograph"], label: "Move-in photographs" },
  move_out_photos: { types: ["photograph"], label: "Move-out photographs" },
  landlord_photographs: { types: ["photograph"], label: "Landlord photographs of the alleged damage" },
  signed_inventory: { types: ["inventory"], label: "Signed inventory" },
  condition_report: { types: ["inventory", "other"], label: "Start/end condition report" },
  damage_messages: { types: ["message"], label: "Messages describing the condition or damage" },
  invoice: { types: ["invoice"], label: "Itemised invoice for this deduction" },
  contractor_estimate: { types: ["other"], label: "Contractor estimate for this deduction" },
  proof_of_payment: { types: ["bank_record", "receipt"], label: "Proof of payment for this deduction" },
  work_description: { types: ["invoice", "message", "other"], label: "Description of the work performed" },
  tenancy_agreement: { types: ["tenancy_agreement"], label: "Tenancy agreement" },
  rent_ledger: { types: ["bank_record", "receipt", "other"], label: "Rent ledger and payment records" },
  utility_bill: { types: ["utility_record"], label: "Final utility bill and account balance" },
  notice: { types: ["message", "other"], label: "Termination notice and service records" },
  other: { types: ["other", "message"], label: "Documents explaining this deduction" },
};
const condition: EvidenceRole[] = ["move_in_photos", "move_out_photos", "signed_inventory", "condition_report", "landlord_photographs", "damage_messages"];
const cost: EvidenceRole[] = ["invoice", "contractor_estimate", "proof_of_payment", "work_description"];
export type Requirement = { type: string; question: string; roles: EvidenceRole[]; kind: "boolean" | "cost"; material: boolean };
const q = (type: string, question: string, roles: EvidenceRole[] = condition, kind: Requirement["kind"] = "boolean"): Requirement => ({ type, question, roles, kind, material: true });
export const REQUIREMENTS: Record<Branch, Requirement[]> = {
  repainting: [q("painting_required", "Was repainting required?"), q("tenant_caused_damage", "Was the need caused by tenant damage?"), q("damage_beyond_ordinary_wear", "Was the damage beyond ordinary wear?"), q("painting_invoice_amount", "Is the claimed painting cost supported?", cost, "cost")],
  cleaning: [q("cleaning_required", "Was additional cleaning required?"), q("cleaning_beyond_ordinary_use", "Was the condition beyond ordinary use?"), q("cleaning_invoice_amount", "Is the claimed cleaning cost supported?", cost, "cost")],
  property_damage: [q("tenant_caused_damage", "Did the tenant cause the damage?"), q("damage_beyond_ordinary_wear", "Was the damage beyond ordinary wear?"), q("damage_invoice_amount", "Is the claimed repair cost supported?", cost, "cost")],
  rent_arrears: [q("rent_arrears_outstanding", "Was rent outstanding at the end of the tenancy?", ["rent_ledger", "tenancy_agreement"]), q("rent_arrears_amount", "Do rent records support the claimed arrears?", ["rent_ledger", "proof_of_payment", "tenancy_agreement"], "cost")],
  utilities: [q("tenant_responsible_for_utilities", "Was the tenant responsible for these bills?", ["tenancy_agreement", "utility_bill"]), q("utility_arrears_amount", "Do bills and payments support outstanding utilities?", ["utility_bill", "proof_of_payment"], "cost")],
  missing_items: [q("tenant_responsible_for_missing_items", "Were the missing items supplied and left in the tenant's care?", ["signed_inventory", "condition_report", "move_out_photos"]), q("missing_items_invoice_amount", "Is the claimed replacement cost supported?", cost, "cost")],
  early_termination: [q("early_termination_liability", "Does this termination justify a deduction?", ["tenancy_agreement", "notice"]), q("early_termination_loss", "Is the claimed termination loss supported?", ["rent_ledger", "proof_of_payment"], "cost")],
  other: [q("other_deduction_justified", "What is the basis for this deduction?", ["other"])]
};
export const DEDUCTION_TYPES: Record<string, Branch> = { painting_deduction: "repainting", repainting_deduction: "repainting", cleaning_deduction: "cleaning", damage_deduction: "property_damage", property_damage_deduction: "property_damage", rent_deduction: "rent_arrears", rent_arrears_deduction: "rent_arrears", utilities_deduction: "utilities", utility_deduction: "utilities", missing_items_deduction: "missing_items", early_termination_deduction: "early_termination", other_deduction: "other" };
const n = (id: string, question: string, requiredInputs: string[], evaluationMethod: string, possibleResults: string[], nextNodes: string[], provenanceRequirements: string[] = [], escalationConditions: string[] = []): Node => ({ id, question, requiredInputs, evaluationMethod, possibleResults, nextNodes, provenanceRequirements, escalationConditions });
export const NODES: Node[] = [
  n("start", "Is this a valid structured case?", ["ontology case", "one deposit claim", "asOf", "trusted catalogue"], "Zod and endpoint validation", ["valid"], ["money"]),
  n("money", "Is money currently withheld?", ["deposit_paid", "deposit_returned"], "Subtract integer cents; refuse ambiguous or contradicted amounts", ["withheld", "none", "unknown"], ["jurisdiction", "finish"], ["Preserve amount fact IDs and assertion basis"], ["Ambiguous or missing deposit amounts"]),
  n("jurisdiction", "Is jurisdiction Ireland?", ["case.jurisdiction"], "Accept IE or Ireland, case-insensitive", ["supported", "unsupported"], ["reasons", "finish"]),
  n("reasons", "Has a deduction reason been supplied?", ["typed deduction facts"], "Classify explicit *_deduction fact types; compare total with withheld amount", ["classified", "missing", "inconsistent"], ["issues", "finish"], ["Asserted reasons remain labelled asserted"], ["Unitemised balance or invalid amounts"]),
  n("issues", "What needs determination for each deduction?", ["branch requirement templates"], "Instantiate stable ontology Issue IDs per deduction and requirement", ["created"], ["evidence"]),
  n("evidence", "What supports, contradicts or could resolve this issue?", ["facts", "evidence", "relationships", "explicit evidence assignments"], "Evaluate reviewed links; enumerate missing and unreviewed dependencies", ["unresolved", "conflicted", "landlord_supported", "tenant_supported"], ["rules"], ["Retain fact/evidence IDs and all source excerpts"], ["Material conflict or ambiguous facts"]),
  n("rules", "Is reliable applicable guidance available?", ["issue type", "jurisdiction", "asOf", "trusted catalogue"], "Exact topic lookup; require reviewed current sources of both evidence and substantive scope", ["available", "unavailable"], ["evidence", "position"], ["Exact ingestion excerpts; review window; no free-text legal guessing"], ["Missing, expired or inapplicable source"]),
  n("position", "What position and confidence follow?", ["all issue evaluations", "amount basis", "rule scopes"], "Apply documented precedence and confidence caps", ["strong", "worth_pursuing", "uncertain", "weak", "expert_review"], ["next"], ["Union of evaluated source references"], ["Unavailable rule"]),
  n("next", "Which evidence is most useful next?", ["unresolved issues", "dependency availability", "deduction amounts"], "Rank review/request tasks by conflicts, coverage, cost relevance and monetary impact", ["request", "review", "none", "expert_review"], ["finish"]),
  n("finish", "What is the structured result?", ["trace", "computed result"], "Validate output; persistence wrapper stores complete immutable run", ["assessed", "no_active_dispute", "unsupported", "needs_input"], []),
];
