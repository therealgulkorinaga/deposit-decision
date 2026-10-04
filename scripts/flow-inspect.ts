import nextEnv from "@next/env";
import { loadFlowRun } from "../src/agents/service";
nextEnv.loadEnvConfig(process.cwd());
const flow = loadFlowRun(process.argv[2]);
console.log(JSON.stringify({ extractedFacts: flow.candidates, evidenceClassifications: flow.classifications, ontologyFacts: flow.ontology.facts, mappedIssues: flow.debug.mappedIssues, retrievalAndAnalyses: flow.issueCache, decisionTrace: flow.graph.decision_trace, verification: flow.debug.verification, affectedIssueIds: flow.debug.affectedIssueIds, stages: flow.debug.stages, rejected: flow.debug.rejected, conflicts: flow.debug.conflicts }, null, 2));
