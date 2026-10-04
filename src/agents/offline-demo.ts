import "server-only";
import { z } from "zod";
import { SCHEMAS, type Interpreter, type Stage, type Document } from "./contracts";
import { cents } from "./intake";

/** Explicit test/demo interpreter. It interprets labelled fictional fixture documents, never positions. */
export class OfflineDemoInterpreter implements Interpreter {
  readonly mode = "offline_demo" as const;
  async run<S extends Stage>(stage: S, payload: unknown): Promise<z.infer<(typeof SCHEMAS)[S]>> {
    const p = payload as Record<string, unknown>; let output: unknown;
    if (stage === "extract") {
      const docs = p.documents as Document[];
      output = { candidates: docs.flatMap(d => {
        const match = d.text.match(/Painting invoice amount: €(\d+(?:\.\d{1,2})?)/);
        return match ? [{ type: "painting_invoice_amount", value: { kind: "money", cents: cents(match[1]), currency: "EUR" }, source: { documentId: d.id, quote: match[0] }, assertedBy: d.sourceParty, evidenceId: d.evidenceId, confidence: 1 }] : [];
      }) };
    } else if (stage === "classify") {
      const d = p.document as Document; const text = d.text.toLowerCase();
      const [type, role] = text.includes("invoice") ? ["invoice", "invoice"] : text.includes("move-in photograph") ? ["photograph", "move_in_photos"] : text.includes("move-out photograph") ? ["photograph", "move_out_photos"] : text.includes("landlord photograph") ? ["photograph", "landlord_photographs"] : text.includes("tenancy agreement") ? ["tenancy_agreement", "tenancy_agreement"] : text.includes("landlord message") ? ["message", "damage_messages"] : ["other", "other"];
      output = { evidenceId: d.evidenceId, type, role, deductionTypes: role === "invoice" || role === "landlord_photographs" ? ["painting_deduction"] : ["painting_deduction", "cleaning_deduction"], relationships: [] };
    } else if (stage === "map") output = { issueTypes: p.allowedIssueTypes };
    else if (stage === "analyse") {
      const issue = p.issue as { id: string }; const rules = p.rules as Array<{ id: string }>;
      output = { issueId: issue.id, supportingTenant: [], supportingLandlord: [], relevantRuleIds: rules.map(r => r.id), distinctions: (p.cases as Array<{ id: string }>).map(c => ({ sourceId: c.id, text: "Retrieved passage is contextual material from a separate dispute; factual similarity and outcome require review." })), missingFactTypes: [], unresolvedQuestions: [] };
    } else if (stage === "explain") output = { sentenceIds: Object.keys(p.sentences as object), sourceIds: p.sourceIds };
    else output = { approved: true, reasons: [] };
    return SCHEMAS[stage].parse(output) as z.infer<(typeof SCHEMAS)[S]>;
  }
}
