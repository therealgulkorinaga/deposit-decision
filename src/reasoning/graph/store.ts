import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync, lstatSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getEnvironment } from "../../lib/server/env";
import { RequestSchema, ResultSchema, type GraphResult, type Options } from "./model";
import type { Case } from "../../domain/ontology";
import { evaluateCase } from "./evaluate";

export const StoredRunSchema = z.object({ schemaVersion: z.literal(1), runId: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.iso.datetime(), request: RequestSchema, assessment: ResultSchema }).strict();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

/** Local immutable run history; hashes bind the full input, rule snapshot and result. */
export function assessAndStore(input: Case, options: Options, directory = path.join(getEnvironment().DATA_DIR, "assessments")) {
  const request = RequestSchema.parse({ case: input, options });
  const assessment = evaluateCase(request.case, request.options);
  const runId = digest({ request, assessment });
  mkdirSync(directory, { recursive: true });
  if (lstatSync(directory).isSymbolicLink()) throw new Error("Assessment directory cannot be a symlink");
  const file = path.join(directory, `${runId}.json`);
  try {
    const existing = loadStoredRun(file);
    if (existing.runId !== runId) throw new Error("Stored assessment identity mismatch");
    return { file, run: existing };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const run = StoredRunSchema.parse({ schemaVersion: 1, runId, createdAt: new Date().toISOString(), request, assessment });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, JSON.stringify(run, null, 2) + "\n", { flag: "wx", mode: 0o600 }); renameSync(temp, file); }
  finally { rmSync(temp, { force: true }); }
  return { file, run };
}

export function loadStoredRun(file: string): z.infer<typeof StoredRunSchema> {
  if (lstatSync(file).isSymbolicLink()) throw new Error("Assessment file cannot be a symlink");
  const run = StoredRunSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  if (digest({ request: run.request, assessment: run.assessment }) !== run.runId || run.request.case.id !== run.assessment.caseId) throw new Error("Stored assessment integrity check failed");
  return run;
}

export function reassessAndStore(previous: GraphResult, input: Case, options: Options, directory?: string) {
  ResultSchema.parse(previous);
  if (previous.caseId !== input.id) throw new Error("Reassessment must refer to the same case");
  // No cached evidence evaluation: additions, edits, deletions and rule changes all rerun.
  return assessAndStore(input, options, directory);
}
