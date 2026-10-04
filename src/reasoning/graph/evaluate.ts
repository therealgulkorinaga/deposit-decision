import { CaseSchema, IssueSchema, type Case, type Fact, type Source } from "../../domain/ontology";
import { DEDUCTION_TYPES, REQUIREMENTS, ROLES } from "./definitions";
import { OptionsSchema, ResultSchema, type Branch, type GraphResult, type IssueEvaluation, type Options } from "./model";

const uniq = <T>(items: T[]): T[] => [...new Set(items)];
const sources = (items: Source[]) => [...new Map(items.map(s => [`${s.sourceDocumentId}:${s.chunkId}:${s.checksum}`, s])).values()];
const ireland = (value: string) => ["ie", "ireland"].includes(value.trim().toLowerCase());
const supported = (c: Case, f: Fact) => c.relationships.filter(r => r.type === "supports" && r.to === f.id).map(r => r.from);
const money = (f: Fact | undefined) => f?.value?.kind === "money" ? f.value.cents : null;

/** Pure deterministic evaluation. The catalogue is trusted server configuration, never model output. */
export function evaluateCase(input: Case, suppliedOptions: Options): GraphResult {
  const c = CaseSchema.parse(input);
  const options = OptionsSchema.parse(suppliedOptions);
  if (c.claims.length !== 1) throw new Error("Graph MVP requires exactly one deposit claim");
  for (const a of options.evidenceAssignments) {
    const e = c.evidence.find(e => e.id === a.evidenceId);
    if (!e || !ROLES[a.role].types.includes(e.type) || (a.deductionFactId !== null && !c.facts.some(f => f.id === a.deductionFactId && f.type.endsWith("_deduction")))) throw new Error("Invalid evidence assignment");
  }
  const result: GraphResult = {
    graphVersion: "1.0.0", caseId: c.id, status: "needs_input", amount_in_dispute: null, currency: "EUR", amountBasis: "unresolved", position: null, confidence: "low", central_issue: "Establish the amount withheld", supporting_factors: [], adverse_factors: [], unresolved_facts: [], missing_evidence: [], next_best_evidence: null, next_best_action: { type: "request_evidence", description: "Supply deposit payment and return records", issueIds: [] }, escalation: null, issues: [], decision_trace: [], source_references: [],
  };
  const trace = (nodeId: string, outcome: string, explanation: string, facts: Fact[] = [], evaluation?: IssueEvaluation) => {
    result.decision_trace.push({ step: result.decision_trace.length + 1, nodeId, issueId: evaluation?.issue.id ?? null, result: outcome, explanation, factIds: uniq([...facts.map(f => f.id), ...(evaluation?.factIds ?? [])]), evidenceIds: uniq([...facts.flatMap(f => f.evidenceIds), ...(evaluation?.supportingEvidenceIds ?? []), ...(evaluation?.contradictingEvidenceIds ?? []), ...(evaluation?.unreviewedEvidenceIds ?? [])]), ruleIds: evaluation?.ruleIds ?? [], sources: sources([...facts.flatMap(f => f.sources), ...(evaluation?.sources ?? [])]) });
  };
  const finish = () => {
    trace("finish", result.status, `${result.position ?? result.status} / ${result.confidence}; ${result.next_best_action.description}`);
    result.source_references = sources(result.decision_trace.flatMap(t => t.sources));
    return ResultSchema.parse(result);
  };
  trace("start", "valid", `Validated case ${c.id}; graph 1.0.0; assessed as of ${options.asOf}`);
  const paid = c.facts.filter(f => f.type === "deposit_paid");
  const returned = c.facts.filter(f => f.type === "deposit_returned");
  const amountFacts = [...paid, ...returned];
  const paidCents = money(paid[0]); const returnedCents = money(returned[0]);
  if (paid.length !== 1 || returned.length !== 1 || paidCents === null || returnedCents === null || amountFacts.some(f => !["asserted", "corroborated"].includes(f.verificationState))) {
    result.unresolved_facts = ["deposit_paid", "deposit_returned"].map(factType => ({ issueId: "money", factType, factIds: c.facts.filter(f => f.type === factType).map(f => f.id) }));
    trace("money", "unknown", "Deposit amounts are missing, ambiguous or disputed; no amount inferred", amountFacts);
    return finish();
  }
  result.amount_in_dispute = Math.max(0, paidCents - returnedCents);
  result.amountBasis = amountFacts.every(f => f.verificationState === "corroborated") ? "corroborated" : "asserted";
  trace("money", result.amount_in_dispute > 0 ? "withheld" : "none", `€${(result.amount_in_dispute / 100).toFixed(2)} currently withheld based on ${result.amountBasis} amounts (${paidCents} - ${returnedCents} cents)`, amountFacts);
  if (result.amount_in_dispute === 0) {
    result.status = "no_active_dispute"; result.central_issue = "No current monetary deposit-retention dispute";
    result.confidence = result.amountBasis === "corroborated" ? "high" : "medium";
    result.next_best_action = { type: "no_action", description: "No current monetary deposit-retention dispute on the supplied amounts", issueIds: [] };
    return finish();
  }
  trace("jurisdiction", ireland(c.jurisdiction) ? "supported" : "unsupported", `Jurisdiction = ${c.jurisdiction}`);
  if (!ireland(c.jurisdiction)) {
    result.status = "unsupported"; result.central_issue = "Jurisdiction is outside the Ireland MVP";
    result.next_best_action = { type: "obtain_expert_review", description: "Obtain advice for the applicable jurisdiction", issueIds: [] };
    result.escalation = { destination: "Jurisdiction-appropriate adviser", reason: "This graph supports Ireland only", issueIds: [] };
    return finish();
  }
  const deductions = c.facts.filter(f => f.type.endsWith("_deduction") && f.value !== null);
  if (!deductions.length) {
    result.central_issue = "The landlord's deduction reasons have not been itemised";
    result.next_best_action = { type: "request_itemisation", description: "Request an itemised explanation of the retained deposit", issueIds: [] };
    trace("reasons", "missing", "No structured deduction reasons supplied; do not infer them from photos or free text");
    return finish();
  }
  const branches = deductions.map(f => DEDUCTION_TYPES[f.type] ?? "other");
  const total = deductions.reduce((n, f) => n + (money(f) ?? 0), 0);
  if (deductions.some(f => money(f) === null || money(f) === 0 || !["asserted", "corroborated"].includes(f.verificationState)) || !Number.isSafeInteger(total) || total !== result.amount_in_dispute || new Set(branches).size !== branches.length) {
    result.central_issue = "Reconcile the itemised deductions with the retained amount";
    result.next_best_action = { type: "request_itemisation", description: "Request one reconciled monetary deduction per category, with amounts matching the retained deposit", issueIds: [] };
    trace("reasons", "inconsistent", "Deduction amounts are disputed, ambiguous, duplicated by category or do not match the withheld amount", deductions);
    return finish();
  }
  trace("reasons", "classified", `Deductions = ${branches.join(" + ")}; stated reasons remain assertions unless corroborated`, deductions);
  trace("issues", "created", "Create deduction-specific questions from versioned branch templates");

  for (const deduction of deductions) {
    const branch: Branch = DEDUCTION_TYPES[deduction.type] ?? "other";
    for (const requirement of REQUIREMENTS[branch]) {
      const factList = c.facts.filter(f => f.type === requirement.type);
      const factIds = factList.map(f => f.id);
      const links = c.relationships.filter(r => factIds.includes(r.to));
      const supportIds = uniq(links.filter(r => r.type === "supports").map(r => r.from));
      const contradictionIds = uniq(links.filter(r => r.type === "contradicts").map(r => r.from));
      const neutralIds = uniq(links.filter(r => r.type === "neutral").map(r => r.from));
      const dependencies = requirement.roles.map(role => {
        const bound = options.evidenceAssignments.filter(a => a.role === role && (a.deductionFactId === null || a.deductionFactId === deduction.id)).map(a => a.evidenceId);
        const inferred = factList.flatMap(f => f.evidenceIds).filter(id => c.evidence.some(e => e.id === id && ROLES[role].types.includes(e.type)));
        const ids = uniq([...bound, ...inferred]);
        return { role, evidenceTypes: ROLES[role].types, label: ROLES[role].label, evidenceIds: ids, state: ids.length === 0 ? "absent" as const : ids.some(id => c.evidence.find(e => e.id === id)?.reviewState === "unreviewed") ? "supplied_unreviewed" as const : "reviewed" as const };
      });
      const evaluation: IssueEvaluation = {
        issue: IssueSchema.parse({ id: `graph:${deduction.id}:${requirement.type}`, claimId: c.claims[0].id, type: requirement.type, question: requirement.question, status: "open" }),
        deductionFactId: deduction.id, branch, amountCents: money(deduction)!, factType: requirement.type, factIds,
        assertedFactIds: factList.filter(f => f.verificationState === "asserted").map(f => f.id),
        supportingEvidenceIds: supportIds, contradictingEvidenceIds: contradictionIds, neutralEvidenceIds: neutralIds,
        unreviewedEvidenceIds: uniq(dependencies.flatMap(d => d.evidenceIds).filter(id => c.evidence.find(e => e.id === id)?.reviewState === "unreviewed")),
        state: "unresolved", ruleIds: [], ruleAvailable: false, dependencies, rationale: "Material proposition remains missing, asserted or unreviewed", sources: sources([...factList.flatMap(f => f.sources), ...c.evidence.filter(e => [...supportIds, ...contradictionIds, ...neutralIds, ...dependencies.flatMap(d => d.evidenceIds)].includes(e.id)).flatMap(e => e.documentReference.sources)]),
      };
      if (contradictionIds.length || factList.some(f => f.verificationState === "contradicted") || factList.length > 1) {
        evaluation.state = "conflicted"; evaluation.rationale = "Material evidence conflicts or competing propositions need reconciliation";
      } else if (factList.length === 1 && factList[0].verificationState === "corroborated") {
        const f = factList[0];
        const usableSupport = supported(c, f).some(id => c.evidence.some(e => e.id === id && e.reviewState === "reviewed" && requirement.roles.some(role => ROLES[role].types.includes(e.type))));
        if (usableSupport && requirement.kind === "boolean" && f.value?.kind === "boolean") {
          evaluation.state = f.value.value ? "landlord_supported" : "tenant_supported";
          evaluation.rationale = `Reviewed evidence supports ${requirement.type} = ${f.value.value}; subject to applicable guidance`;
        } else if (usableSupport && requirement.kind === "cost" && f.value?.kind === "money") {
          evaluation.state = f.value.cents >= evaluation.amountCents ? "landlord_supported" : "tenant_supported";
          evaluation.rationale = `Reviewed records document €${(f.value.cents / 100).toFixed(2)} against €${(evaluation.amountCents / 100).toFixed(2)} claimed; this does not establish liability or authenticity`;
        }
      }
      const dependencySummary = dependencies.map(d => `${d.role}: ${d.state}`).join("; ");
      trace("evidence", evaluation.state, `${evaluation.rationale}. Evidence dependencies: ${dependencySummary}`, [], evaluation);
      const applicable = options.catalogue.filter(entry => ireland(entry.rule.jurisdiction) && entry.issueTypes.includes(requirement.type) && entry.reviewedOn <= options.asOf && entry.reviewBy >= options.asOf && (entry.rule.effectiveDate === null || entry.rule.effectiveDate <= options.asOf) && entry.rule.sources.every(s => (s.date === null || s.date <= options.asOf) && ["rtb_guidance", "legislation"].includes(s.documentType)));
      evaluation.ruleIds = applicable.map(e => e.rule.id);
      evaluation.ruleAvailable = applicable.some(e => e.scope === "evidence_guidance") && applicable.some(e => e.scope === "deduction_guidance" || e.scope === "legislation");
      evaluation.sources = sources([...evaluation.sources, ...applicable.flatMap(e => e.rule.sources)]);
      trace("rules", evaluation.ruleAvailable ? "available" : "unavailable", evaluation.ruleAvailable ? "Retrieved reviewed, source-linked guidance for this issue" : "No reliable applicable evidence and deduction rule coverage; expert review required", [], evaluation);
      const interpretation = options.issueAnalyses?.find(a => a.issueId === evaluation.issue.id);
      if (interpretation) {
        if ([...interpretation.supportingFactIds, ...interpretation.adverseFactIds].some(id => !evaluation.factIds.includes(id))) throw new Error("Analysis refers to facts outside this issue");
        evaluation.sources = sources([...evaluation.sources, ...interpretation.sourceReferences]);
        trace("issue_analysis", "interpreted", `Checked interpretation: ${interpretation.supportingFactIds.length} tenant fact references, ${interpretation.adverseFactIds.length} landlord fact references. Interpretation does not establish facts or override graph gates.`, [], evaluation);
      }
      result.issues.push(evaluation);
    }
  }

  const unresolved = result.issues.filter(i => i.state === "unresolved" || i.state === "conflicted");
  const missingRules = result.issues.filter(i => !i.ruleAvailable);
  const conflicts = result.issues.filter(i => i.state === "conflicted");
  const adverse = result.issues.filter(i => i.state === "landlord_supported");
  const favourable = result.issues.filter(i => i.state === "tenant_supported");
  result.status = "assessed";
  result.unresolved_facts = unresolved.map(i => ({ issueId: i.issue.id, factType: i.factType, factIds: i.factIds }));
  result.supporting_factors = favourable.map(i => `${i.issue.question} ${i.rationale}`);
  result.supporting_factors.push(...unresolved.filter(i => REQUIREMENTS[i.branch].find(r => r.type === i.factType)?.kind === "cost" && !i.dependencies.some(d => d.evidenceIds.length)).map(i => `The claimed ${i.branch} cost has no supplied, linked cost evidence; requesting substantiation is worthwhile, but absence does not prove the deduction invalid`));
  result.adverse_factors = adverse.map(i => `${i.issue.question} ${i.rationale}`);
  result.adverse_factors.push(...conflicts.map(i => `Conflicting evidence: ${i.issue.question}`));
  const everyDeductionChallenged = deductions.every(d => favourable.some(i => i.deductionFactId === d.id));
  result.position = missingRules.length ? "expert_review" : conflicts.length ? "uncertain" : everyDeductionChallenged ? "strong" : unresolved.length === 0 && adverse.length === result.issues.length ? "weak" : adverse.length ? "uncertain" : "worth_pursuing";
  const documentsAvailable = c.evidence.length > 0 && result.issues.some(i => i.dependencies.some(d => d.evidenceIds.length > 0));
  const allLegislation = result.issues.every(i => options.catalogue.some(e => i.ruleIds.includes(e.rule.id) && e.scope === "legislation"));
  result.confidence = missingRules.length || conflicts.length || !documentsAvailable ? "low" : !unresolved.length && result.amountBasis === "corroborated" && allLegislation ? "high" : "medium";
  result.central_issue = (missingRules[0] ?? conflicts[0] ?? unresolved[0] ?? result.issues[0]).issue.question;
  if (missingRules.length) result.escalation = { destination: "Qualified tenancy adviser", reason: "Applicable reviewed source coverage is missing; the graph will not invent a rule", issueIds: missingRules.map(i => i.issue.id) };
  trace("position", result.position, `Position = ${result.position}; confidence = ${result.confidence}. ${unresolved.length} unresolved issue(s), ${conflicts.length} conflict(s), ${missingRules.length} without applicable rule coverage`);

  const candidates: GraphResult["missing_evidence"] = [];
  for (const i of unresolved) {
    for (const dependency of i.dependencies) {
      // Reviewed documents with unresolved content need a focused review, not another request.
      const operation = dependency.evidenceIds.length ? "review" as const : "request" as const;
      const costIssue = REQUIREMENTS[i.branch].find(r => r.type === i.factType)?.kind === "cost";
      const priority = (i.state === "conflicted" ? 100 : 0) + (dependency.role === "invoice" && costIssue ? 60 : 0) + (operation === "review" ? 30 : 0) + (dependency.role === "landlord_photographs" && operation === "review" ? 8 : ["move_in_photos", "move_out_photos"].includes(dependency.role) && operation === "review" ? 5 : 0) + Math.min(i.amountCents / 10000, 20);
      candidates.push({ issueIds: [i.issue.id], deductionFactId: i.deductionFactId, role: dependency.role, label: dependency.label, operation, evidenceIds: dependency.evidenceIds, priority, reason: `${operation === "review" ? "Review supplied material for" : "Request material addressing"}: ${i.issue.question}` });
    }
  }
  const merged = new Map<string, GraphResult["missing_evidence"][number]>();
  for (const candidate of candidates) {
    const key = `${candidate.deductionFactId}:${candidate.role}:${candidate.operation}`;
    const existing = merged.get(key);
    if (existing) { existing.issueIds = uniq([...existing.issueIds, ...candidate.issueIds]); existing.evidenceIds = uniq([...existing.evidenceIds, ...candidate.evidenceIds]); existing.priority = Math.max(existing.priority, candidate.priority); }
    else merged.set(key, { ...candidate });
  }
  const ranked = [...merged.values()].map(e => ({ ...e, priority: e.priority + e.issueIds.length * 10 })).sort((a, b) => b.priority - a.priority || a.deductionFactId.localeCompare(b.deductionFactId) || a.role.localeCompare(b.role));
  result.missing_evidence = ranked.filter(e => e.operation === "request");
  result.next_best_evidence = ranked[0] ?? null;
  result.next_best_action = missingRules.length ? { type: "obtain_expert_review", description: "Obtain reviewed applicable guidance for the flagged issues", issueIds: missingRules.map(i => i.issue.id) } : result.next_best_evidence ? { type: result.next_best_evidence.operation === "review" ? "review_evidence" : "request_evidence", description: `${result.next_best_evidence.operation === "review" ? "Review" : "Request"}: ${result.next_best_evidence.label}`, issueIds: result.next_best_evidence.issueIds } : result.position === "strong" ? { type: "request_deposit_return", description: "Request return of the disputed deposit with the reviewed evidence", issueIds: favourable.map(i => i.issue.id) } : { type: "no_action", description: "Review the supported deductions before deciding whether to pursue the claim", issueIds: [] };
  trace("next", missingRules.length ? "expert_review" : result.next_best_evidence?.operation ?? "none", result.next_best_action.description);
  return finish();
}

/** Always reevaluate the new snapshot, including removed evidence and changed rules. */
export function reassessCase(previous: GraphResult, input: Case, options: Options) {
  ResultSchema.parse(previous);
  if (previous.caseId !== input.id) throw new Error("Reassessment must refer to the same case");
  const assessment = evaluateCase(input, options);
  const changedIssueIds = uniq([...previous.issues, ...assessment.issues].map(i => i.issue.id)).filter(id => JSON.stringify(previous.issues.find(i => i.issue.id === id)) !== JSON.stringify(assessment.issues.find(i => i.issue.id === id)));
  return { assessment, changedIssueIds, changed: JSON.stringify(previous) !== JSON.stringify(assessment), recomputedNodeIds: uniq(assessment.decision_trace.map(t => t.nodeId)) };
}
