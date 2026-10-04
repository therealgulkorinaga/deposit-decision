import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { ensureDataset } from "./dataset";

export function openDatabase(filename: string) {
  const db = new DatabaseSync(filename);
  try {
    db.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;"
    );
    const version = db.prepare("PRAGMA user_version").get()?.user_version;
    if (Number(version) > 1)
      throw new Error("Database schema is newer than this application");
    db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        record TEXT NOT NULL CHECK (json_valid(record))
      );
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
        record TEXT NOT NULL CHECK (json_valid(record))
      );
      CREATE INDEX IF NOT EXISTS evidence_case_id ON evidence(case_id);
      CREATE TABLE IF NOT EXISTS public_documents (
        id TEXT PRIMARY KEY,
        record TEXT NOT NULL CHECK (json_valid(record))
      );
      PRAGMA user_version = 1;
      COMMIT;
    `);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function openLocalDatabase() {
  return openDatabase(path.join(ensureDataset(), "depositcheck.sqlite"));
}
