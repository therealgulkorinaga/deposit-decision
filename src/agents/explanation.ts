import type { GraphResult } from "../reasoning/graph/model";
import type { Hit } from "./contracts";

export const POSITION_LABELS = { strong: "Strong position", worth_pursuing: "Worth pursuing", uncertain: "Uncertain", weak: "Weak position", expert_review: "Needs expert review" } as const;
export function explanationChoices(graph: GraphResult): Record<string, string> {
  const choices: Record<string, string> = {
    summary: graph.position ? `The available evidence points to: ${POSITION_LABELS[graph.position]}. Confidence: ${graph.confidence}.` : graph.central_issue,
    amount: graph.amount_in_dispute === null ? "The amount withheld needs clarification." : `The amount currently in dispute is €${(graph.amount_in_dispute / 100).toFixed(2)}, based on ${graph.amountBasis} amounts.`,
    next: `The next step is: ${graph.next_best_action.description}.`,
  };
  if (graph.unresolved_facts.length) choices.missing = `Important evidence is missing or unresolved for ${graph.unresolved_facts.length} questions. The assessment could change after those questions are resolved.`;
  if (graph.escalation) choices.escalation = `Expert review is needed: ${graph.escalation.reason}.`;
  return choices;
}
export function verifyExplanation(graph: GraphResult, proposed: { sentenceIds: string[]; sourceIds: string[] }, registry: Hit[], modelApproved: boolean) {
  const choices = explanationChoices(graph);
  const failures: string[] = [];
  if (proposed.sentenceIds.some(id => !(id in choices))) failures.push("Unknown sentence removed");
  if (proposed.sourceIds.some(id => !registry.some(hit => hit.id === id))) failures.push("Unknown citation removed");
  if (!modelApproved) failures.push("Model verifier rejected the proposed explanation");
  // Conservative fallback replaces the whole proposal with authoritative graph-derived sentences.
  const chosen = failures.length ? Object.keys(choices) : [...new Set(["summary", "amount", ...proposed.sentenceIds, "next", ...(graph.escalation ? ["escalation"] : [])])];
  const paragraphs = chosen.map(id => choices[id]);
  const citations = failures.length ? [] : registry.filter(hit => proposed.sourceIds.includes(hit.id));
  return { approved: true, fallback: failures.length > 0, failures, paragraphs, citations };
}
