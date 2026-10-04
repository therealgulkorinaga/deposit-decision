import type { Case } from "../../mocks/case-state";
import type { ConsumerResult } from "../../agents/service";

export async function submitAssessment(c: Case, id: string, previousRunId: string | null, jurisdiction: "IE" | "other"): Promise<ConsumerResult> {
  const body = new FormData();
  body.set("submission", JSON.stringify({ id, previousRunId, demo: c.demo, revision: c.revision, jurisdiction, location: c.location, deposit: c.deposit, returned: c.returned, start: c.start, end: c.end, reason: c.reason, description: c.description, rent: c.rent, utilities: c.utilities, claims: c.claims, evidence: c.evidence.map(e => ({ id: e.id, type: e.type, party: e.party, status: e.status, note: e.note, filename: e.filename ?? null })) }));
  for (const e of c.evidence) if (e.file && e.status === "present") body.set(`file:${e.id}`, e.file);
  const response = await fetch("/api/assessment", { method: "POST", body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "Assessment could not complete.");
  return result;
}
