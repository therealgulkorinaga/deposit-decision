import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { POST as ingest } from "../src/app/api/ingestion/documents/route";
import { POST as retrieveCases } from "../src/app/api/retrieval/cases/route";
import { POST as retrieveRules } from "../src/app/api/retrieval/rules/route";
import { POST as assess } from "../src/app/api/claims/assess/route";
import { POST as reassess } from "../src/app/api/claims/reassess/route";
import { POST as update } from "../src/app/api/evidence/update/route";
import { POST as createCase } from "../src/app/api/cases/route";
import { GET as getCase } from "../src/app/api/cases/[caseId]/route";
import { GET as health } from "../src/app/api/health/route";
import { createPostHandler } from "../src/lib/server/http";
import {
  caseId,
  caseInput,
  claimContext,
  documentInput,
  evidenceId,
  evidenceInput,
  previousAssessment,
} from "./fixtures";

const request = (body: unknown) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

test("all six valid pipeline requests explicitly return 501; no reasoning runs", async () => {
  const operations: [typeof ingest, unknown][] = [
    [ingest, { document: documentInput }],
    [retrieveCases, { query: "painting" }],
    [retrieveRules, { query: "deposit" }],
    [assess, claimContext],
    [update, { caseId, evidenceId, evidence: evidenceInput }],
    [reassess, { context: claimContext, previousAssessment }],
  ];
  for (const [operation, body] of operations) {
    const response = await operation(request(body));
    assert.equal(response.status, 501);
    assert.equal((await response.json()).error.code, "NOT_IMPLEMENTED");
    assert.equal((await operation(request({}))).status, 422);
  }
});
test("API rejects malformed JSON and never exposes internal errors", async () => {
  assert.equal(
    (
      await retrieveCases(
        new Request("http://localhost", { method: "POST", body: "{broken" })
      )
    ).status,
    400
  );
  const internal = createPostHandler(
    z.object({}),
    z.object({ ok: z.boolean() }),
    async () => {
      throw new Error("secret-value");
    }
  );
  const response = await internal(request({}));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("secret-value"));
  const invalidOutput = createPostHandler(
    z.object({}),
    z.object({ count: z.number().int() }),
    async () => ({ count: 1.5 })
  );
  assert.equal((await invalidOutput(request({}))).status, 500);
});
test("case API persists locally, health is safe, invalid/unknown IDs have explicit status", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "depositcheck-api-"));
  const before = process.env.DATA_DIR;
  process.env.DATA_DIR = dir;
  try {
    const response = await createCase(request(caseInput));
    assert.equal(response.status, 201);
    const saved = (await response.json()).case;
    const loaded = await getCase(new Request("http://localhost"), {
      params: Promise.resolve({ caseId: saved.id }),
    });
    assert.equal(loaded.status, 200);
    assert.deepEqual((await loaded.json()).case, saved);
    const status = await health();
    assert.equal(status.status, 200);
    const text = await status.text();
    assert.ok(!text.includes("OPENAI_API_KEY"));
    assert.ok(!text.includes(dir));
    assert.equal(
      (
        await getCase(new Request("http://localhost"), {
          params: Promise.resolve({ caseId: "bad" }),
        })
      ).status,
      422
    );
    assert.equal(
      (
        await getCase(new Request("http://localhost"), {
          params: Promise.resolve({ caseId }),
        })
      ).status,
      404
    );
  } finally {
    if (before === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
