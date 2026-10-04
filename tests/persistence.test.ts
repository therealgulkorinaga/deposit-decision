import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../src/lib/server/database";
import { LocalRepository } from "../src/lib/server/repository";
import { ensureDataset, datasetFolders } from "../src/lib/server/dataset";
import { caseInput, documentInput, evidenceInput } from "./fixtures";

test("cases, evidence and public document metadata survive closing and reopening SQLite", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "depositcheck-persistence-"));
  const filename = path.join(dir, "test.sqlite");
  let db = openDatabase(filename);
  try {
    ensureDataset(dir);
    for (const folder of datasetFolders)
      assert.ok(existsSync(path.join(dir, folder)));
    const repository = new LocalRepository(db);
    const record = repository.createCase(caseInput);
    const evidence = repository.addEvidence(record.id, evidenceInput);
    const document = repository.savePublicDocument(documentInput);
    assert.throws(
      () =>
        repository.addEvidence(
          "fe88d3bb-c8b6-43d9-8b26-090e448eeb24",
          evidenceInput
        ),
      /FOREIGN KEY/
    );
    db.close();
    db = openDatabase(filename);
    const reopened = new LocalRepository(db);
    assert.deepEqual(reopened.getCase(record.id), record);
    assert.deepEqual(reopened.listEvidence(record.id), [evidence]);
    assert.deepEqual(reopened.getPublicDocument(document.id), document);
    assert.equal(
      reopened.getCase("fe88d3bb-c8b6-43d9-8b26-090e448eeb24"),
      null
    );
    assert.throws(() => reopened.getCase("' OR 1=1 --"));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
