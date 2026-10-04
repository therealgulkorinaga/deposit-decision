import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  CaseInputSchema,
  CaseSchema,
  EvidenceInputSchema,
  EvidenceSchema,
  IdSchema,
  PublicDocumentInputSchema,
  PublicDocumentSchema,
} from "../../domain/schemas";
import type {
  CaseInput,
  CaseRecord,
  EvidenceInput,
  EvidenceRecord,
  PublicDocumentInput,
  PublicDocument,
} from "../../domain/schemas";

export class LocalRepository {
  constructor(private db: DatabaseSync) {}

  createCase(input: CaseInput): CaseRecord {
    const now = new Date().toISOString();
    const record = CaseSchema.parse({
      id: randomUUID(),
      details: CaseInputSchema.parse(input),
      createdAt: now,
      updatedAt: now,
    });
    this.db
      .prepare("INSERT INTO cases (id, record) VALUES (?, ?)")
      .run(record.id, JSON.stringify(record));
    return record;
  }

  getCase(id: string): CaseRecord | null {
    const row = this.db
      .prepare("SELECT record FROM cases WHERE id = ?")
      .get(IdSchema.parse(id));
    return row ? CaseSchema.parse(JSON.parse(String(row.record))) : null;
  }

  addEvidence(caseId: string, input: EvidenceInput): EvidenceRecord {
    const now = new Date().toISOString();
    const record = EvidenceSchema.parse({
      id: randomUUID(),
      caseId,
      details: EvidenceInputSchema.parse(input),
      createdAt: now,
      updatedAt: now,
    });
    this.db
      .prepare("INSERT INTO evidence (id, case_id, record) VALUES (?, ?, ?)")
      .run(record.id, record.caseId, JSON.stringify(record));
    return record;
  }

  listEvidence(caseId: string): EvidenceRecord[] {
    return this.db
      .prepare("SELECT record FROM evidence WHERE case_id = ? ORDER BY rowid")
      .all(IdSchema.parse(caseId))
      .map((row) => EvidenceSchema.parse(JSON.parse(String(row.record))));
  }

  savePublicDocument(input: PublicDocumentInput): PublicDocument {
    const now = new Date().toISOString();
    const record = PublicDocumentSchema.parse({
      id: randomUUID(),
      details: PublicDocumentInputSchema.parse(input),
      createdAt: now,
      updatedAt: now,
    });
    this.db
      .prepare("INSERT INTO public_documents (id, record) VALUES (?, ?)")
      .run(record.id, JSON.stringify(record));
    return record;
  }

  getPublicDocument(id: string): PublicDocument | null {
    const row = this.db
      .prepare("SELECT record FROM public_documents WHERE id = ?")
      .get(IdSchema.parse(id));
    return row
      ? PublicDocumentSchema.parse(JSON.parse(String(row.record)))
      : null;
  }
}
