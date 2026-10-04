import "server-only";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { extractFile } from "../ingestion/extract";
import { sha256 } from "../retrieval/corpus";
import { getEnvironment } from "../lib/server/env";
import { CaseSchema, type Case, type Fact } from "../domain/ontology";
import { DEDUCTION_TYPES, REQUIREMENTS, ROLES } from "../reasoning/graph/definitions";
import type { Candidate, Classification, Document, Submission } from "./contracts";

export const ALLOWED_FACT_TYPES = [...new Set(["deposit_paid", "deposit_returned", "tenancy_duration_months", ...Object.keys(DEDUCTION_TYPES), ...Object.values(REQUIREMENTS).flatMap(rs => rs.map(r => r.type)), "landlord_damage_photographs_supplied"])];
export const cents = (amount: string) => { const [whole, decimal = ""] = amount.split("."); return Number(whole) * 100 + Number(decimal.padEnd(2, "0")); };
const party = (p: string) => p === "Landlord" ? "landlord" as const : p === "Tenant" ? "tenant" as const : "unknown" as const;
const money = (n: number) => ({ kind: "money" as const, cents: n, currency: "EUR" as const });
export function narrative(s: Submission) { return `${s.description}\nLandlord's stated reason: ${s.reason}\n${s.evidence.map(e => `${e.type}: ${e.note}`).join("\n")}`; }
function deductionType(label: string) {
  const t = label.toLowerCase().trim();
  if (/paint|decorat/.test(t)) return "painting_deduction";
  if (/clean/.test(t)) return "cleaning_deduction";
  if (/rent|arrears/.test(t) && !/utilit/.test(t)) return "rent_arrears_deduction";
  if (/utilit|electric|gas|water/.test(t)) return "utilities_deduction";
  if (/missing|item/.test(t)) return "missing_items_deduction";
  if (/terminat|notice/.test(t)) return "early_termination_deduction";
  if (/damage|repair/.test(t)) return "damage_deduction";
  return "other_deduction";
}
export function baseCase(s: Submission): Case {
  const fact = (id: string, type: string, value: Fact["value"]): Fact => ({ id, type, value, assertedBy: "tenant", origin: "party_assertion", evidenceIds: [], verificationState: "asserted", confidence: null, occurredAt: null, sources: [] });
  return CaseSchema.parse({ schemaVersion: 1, id: s.id, recordKind: s.demo ? "illustrative_demo" : "live", jurisdiction: s.jurisdiction, claimType: "deposit_retention", status: "under_review", position: null,
    parties: [{ id: "tenant", type: "tenant", name: "Tenant" }, { id: "landlord", type: "landlord", name: "Landlord" }, { id: "unknown", type: "other", name: "Source party unconfirmed" }],
    claims: [{ id: "deposit-claim", type: "deposit_retention", currency: "EUR", amountClaimedCents: Math.max(0, cents(s.deposit) - cents(s.returned)), amountDisputedCents: Math.max(0, cents(s.deposit) - cents(s.returned)), claimant: "tenant", respondent: "landlord", status: "open" }],
    facts: [fact("deposit-paid", "deposit_paid", money(cents(s.deposit))), fact("deposit-returned", "deposit_returned", money(cents(s.returned))), ...s.claims.filter(x => x.label.trim()).map(x => fact(`deduction:${x.id}`, deductionType(x.label), money(cents(x.amount.toFixed(2)))) )],
    evidence: [], issues: [], rules: [], decisions: [], actions: [], riskTriggers: [], escalations: [], relationships: [],
  });
}
const fixture: Record<string, string> = {
  "0": "Illustrative tenancy agreement. Tenancy duration: 36 months. Deposit paid: €1500.",
  "2": "Illustrative move-in photograph description: walls were painted; precise condition requires comparison.",
  "3": "Illustrative move-out photograph description: tenant reports ordinary wear. Date and wall condition require review.",
  "4": "Illustrative landlord message: I retained €700 for painting and €300 for cleaning.",
  "6": "Illustrative painting invoice. Painting invoice amount: €700. Work description: repainting walls. Payment and responsibility are unconfirmed.",
  "7": "Illustrative landlord photograph description: marks on a wall. Date, cause and ordinary wear are unconfirmed.",
};
export async function ingestUploads(s: Submission, files: Map<string, File>): Promise<Document[]> {
  const documents: Document[] = [];
  for (const e of s.evidence.filter(e => e.status === "present")) {
    const file = files.get(e.id);
    const demoText = s.demo && !file ? fixture[e.id] : undefined;
    if (!file && !demoText) continue; // A checkbox or note is not a supplied document.
    const bytes = file ? Buffer.from(await file.arrayBuffer()) : Buffer.from(demoText!);
    if (bytes.length > 5 * 1024 * 1024) throw new Error("UPLOAD_LIMIT");
    const checksum = sha256(bytes); const extension = file ? path.extname(file.name).toLowerCase() : ".txt";
    let image: string | null = null; let pageTexts: Document["pageTexts"] = [];
    if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
      const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isJpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const isWebp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
      if (!isPng && !isJpg && !isWebp) throw new Error("INVALID_IMAGE");
      image = `data:image/${isPng ? "png" : isJpg ? "jpeg" : "webp"};base64,${bytes.toString("base64")}`;
    } else {
      const extracted = await extractFile(bytes, extension);
      pageTexts = extracted.pages.map(p => ({ page: p.pageNumber, text: p.text }));
      if (pageTexts.reduce((n, p) => n + p.text.length, 0) > 60000) throw new Error("DOCUMENT_TEXT_LIMIT");
    }
    const dir = path.join(getEnvironment().DATA_DIR, "private", s.id); mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(dir, checksum + extension), bytes, { mode: 0o600 });
    documents.push({ id: `${e.id}:${checksum}`, evidenceId: e.id, checksum, filename: file?.name ?? `illustrative-${e.id}.txt`, text: pageTexts.map(p => p.text).join("\n\f\n"), pageTexts, image, sourceParty: party(e.party), illustrative: !!demoText });
  }
  return documents;
}
export function mergeInterpretation(s: Submission, docs: Document[], candidates: Candidate[], classes: Classification[]) {
  const c = baseCase(s); const rejected: string[] = []; const conflicts: string[] = [];
  for (const d of docs) {
    const cl = classes.find(cl => cl.evidenceId === d.evidenceId);
    c.evidence.push({ id: d.evidenceId, type: cl?.type ?? "other", sourceParty: d.sourceParty, documentReference: { id: d.id, label: d.filename, kind: d.illustrative ? "demo_placeholder" : "private_document", sources: [] }, date: null, reviewState: "unreviewed", reviewNote: "" });
  }
  for (const candidate of candidates) {
    const d = docs.find(d => d.id === candidate.source.documentId && d.evidenceId === candidate.evidenceId);
    const quote = candidate.source.quote;
    const grounded = d ? (quote ? d.text.includes(quote) : !!d.image) : candidate.source.documentId === null && candidate.evidenceId === null && !!quote && narrative(s).includes(quote);
    if (!ALLOWED_FACT_TYPES.includes(candidate.type) || !grounded) { rejected.push(`Ungrounded candidate ${candidate.type}`); continue; }
    // Monetary inputs and deduction categories are explicitly confirmed by the user form.
    if (["deposit_paid", "deposit_returned", ...Object.keys(DEDUCTION_TYPES)].includes(candidate.type)) {
      const existing = c.facts.find(f => f.type === candidate.type);
      if (existing && JSON.stringify(existing.value) !== JSON.stringify(candidate.value)) conflicts.push(`Source disagrees with user entry: ${candidate.type}`);
    }
    const existing = c.facts.find(f => f.type === candidate.type && JSON.stringify(f.value) === JSON.stringify(candidate.value));
    if (existing) continue; // Never silently overwrite a confirmed or existing assertion.
    const f: Fact = { id: `candidate:${sha256(JSON.stringify(candidate)).slice(0, 24)}`, type: candidate.type, value: candidate.value, assertedBy: candidate.assertedBy, origin: "party_assertion", evidenceIds: [], verificationState: "asserted", confidence: candidate.confidence, occurredAt: null, sources: [] };
    if (c.facts.some(f => f.type === candidate.type)) conflicts.push(`Conflicting versions preserved: ${candidate.type}`);
    const cl = classes.find(cl => cl.evidenceId === d?.evidenceId);
    // Code verifies only the face value of a supplied invoice, never cost liability.
    const quotedAmounts = [...(quote ?? "").matchAll(/€\s*(\d+(?:[,.]\d{1,2})?)/g)].map(m => cents(m[1].replace(",", ".")));
    const subject = candidate.type.split("_")[0];
    if (d && cl?.type === "invoice" && candidate.type.endsWith("_invoice_amount") && candidate.value.kind === "money" && quotedAmounts.includes(candidate.value.cents) && quote?.toLowerCase().includes(subject)) {
      f.origin = "document_review"; f.verificationState = "corroborated"; f.evidenceIds = [d.evidenceId];
      const e = c.evidence.find(e => e.id === d.evidenceId)!; e.reviewState = "reviewed"; e.reviewNote = "Code-checked quoted invoice face value; authenticity, payment, necessity and liability remain unverified.";
      c.relationships.push({ type: "supports", from: e.id, to: f.id });
    }
    c.facts.push(f);
  }
  const assignments = classes.flatMap(cl => {
    const e = c.evidence.find(e => e.id === cl.evidenceId);
    if (!e || !ROLES[cl.role].types.includes(e.type)) return [];
    const deductions = c.facts.filter(f => f.type.endsWith("_deduction") && cl.deductionTypes.includes(f.type));
    return deductions.map(f => ({ evidenceId: e.id, deductionFactId: f.id, role: cl.role }));
  });
  return { case: CaseSchema.parse(c), assignments, rejected, conflicts };
}
