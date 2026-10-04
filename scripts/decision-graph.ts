import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
import { CaseSchema } from "../src/domain/ontology";
import { DEFAULT_CATALOGUE } from "../src/reasoning/graph/catalogue";
import { runGraphDemo } from "../src/reasoning/graph/demo";
import { assessAndStore } from "../src/reasoning/graph/store";

nextEnv.loadEnvConfig(process.cwd());
try {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--demo") {
    const demo = runGraphDemo();
    const before = assessAndStore(demo.initialCase, demo.options);
    const after = assessAndStore(demo.updatedCase, demo.updatedOptions);
    console.log(JSON.stringify({ initial: { amount_in_dispute: demo.initial.amount_in_dispute, position: demo.initial.position, confidence: demo.initial.confidence, next_best_action: demo.initial.next_best_action, traceFile: before.file }, updated: { position: demo.assessment.position, confidence: demo.assessment.confidence, next_best_action: demo.assessment.next_best_action, traceFile: after.file }, changedIssueIds: demo.changedIssueIds }, null, 2));
  } else {
    if (args.length !== 2) throw new Error("Usage: npm run graph -- case.json YYYY-MM-DD (or --demo)");
    const c = CaseSchema.parse(JSON.parse(readFileSync(args[0], "utf8")));
    const saved = assessAndStore(c, { asOf: args[1], catalogue: DEFAULT_CATALOGUE, evidenceAssignments: [] });
    console.log(JSON.stringify({ file: saved.file, assessment: saved.run.assessment }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Graph evaluation failed");
  process.exitCode = 1;
}
