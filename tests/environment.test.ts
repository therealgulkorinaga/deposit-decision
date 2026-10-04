import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseEnvironment } from "../src/lib/server/env";

test("environment allows blank key for mock setup and resolves DATA_DIR", () => {
  assert.deepEqual(parseEnvironment({ OPENAI_API_KEY: "" }), {
    OPENAI_API_KEY: undefined,
    DATA_DIR: path.resolve("data"),
  });
  assert.equal(
    parseEnvironment({ DATA_DIR: "./test-data" }).DATA_DIR,
    path.resolve("test-data")
  );
});
test("invalid environment fails without disclosing values", () => {
  assert.throws(
    () => parseEnvironment({ DATA_DIR: "  " }),
    /Invalid environment variables: DATA_DIR/
  );
  assert.throws(
    () => parseEnvironment({ OPENAI_API_KEY: "sensitive secret" }),
    (error) =>
      error instanceof Error &&
      error.message.includes("OPENAI_API_KEY") &&
      !error.message.includes("sensitive")
  );
});
test("server-only boundary rejects imports outside server conditions", () => {
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      "import('./src/lib/server/env.ts')",
    ],
    { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } }
  );
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /cannot be imported from a Client Component/);
});
