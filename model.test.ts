import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amountInDispute,
  assess,
  createCase,
  extract,
  injectLandlord,
  validate,
} from "./src/model.ts";

test("disputed amount is deterministic and cents-safe", () => {
  assert.equal(amountInDispute(createCase(true)), 1000);
  assert.equal(
    amountInDispute({
      ...createCase(),
      deposit: "1500.30",
      returned: "500.10",
    }),
    1000.2
  );
});
test("validation rejects missing, negative, excess returned and reversed dates", () => {
  assert.equal(validate(createCase(true)).length, 0);
  assert.ok(validate(createCase()).length >= 4);
  assert.ok(validate({ ...createCase(true), returned: "1600" }).length);
  assert.ok(validate({ ...createCase(true), returned: "-1" }).length);
  assert.ok(validate({ ...createCase(true), end: "2020-01-01" }).length);
});
test("new cases are empty and independent of demo state", () => {
  const demo = createCase(true);
  demo.evidence[0].note = "changed";
  assert.equal(createCase(true).evidence[0].note, "");
  assert.equal(createCase().deposit, "");
  assert.equal(assess(createCase()).confidence, "Low");
});
test("new evidence preserves old assessment until explicit reassessment", () => {
  const original = createCase(true);
  const before = assess(original);
  const updated = injectLandlord(original);
  assert.equal(before.position, "Worth pursuing");
  assert.equal(original.evidence[6].status, "absent");
  assert.equal(updated.evidence[6].status, "present");
  assert.equal(updated.evidence[7].status, "present");
  assert.notEqual(updated.revision, before.revision);
  const after = assess(updated);
  assert.equal(after.position, "Uncertain");
  assert.equal(after.confidence, "Medium");
  assert.equal(before.position, "Worth pursuing");
});
test("mock facts require available demo evidence and retain manual corrections", () => {
  const extracted = extract(createCase(true));
  assert.equal(extracted.facts.length, 1);
  extracted.facts[0].value = "Corrected agreement summary";
  assert.equal(
    extract(extracted).facts[0].value,
    "Corrected agreement summary"
  );
  assert.equal(extract(injectLandlord(extracted)).facts.length, 3);
  assert.equal(extract(createCase()).facts.length, 0);
});
