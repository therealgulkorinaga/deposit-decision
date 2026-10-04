import "server-only";
import { readFileSync, lstatSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ManifestSchema, ProcessedDocumentSchema, type ProcessedDocument } from "../ingestion/schemas";
import { sourceFromChunk } from "../domain/ontology";
import { getEnvironment } from "../lib/server/env";
import { RelativeFileSchema } from "../domain/schemas";
import type { Hit } from "../agents/contracts";

export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const tokens = (s: string) => [...new Set(s.toLowerCase().replaceAll("_", " ").match(/[a-z]{3,}/g) ?? [])];
export type Corpus = { fingerprint: string; documents: ProcessedDocument[]; warnings: string[] };
function safeRead(root: string, relative: string) {
  RelativeFileSchema.parse(relative);
  let cursor = root;
  if (lstatSync(root).isSymbolicLink()) throw new Error("CORPUS_SYMLINK");
  for (const segment of relative.split("/")) { cursor = path.join(cursor, segment); if (lstatSync(cursor).isSymbolicLink()) throw new Error("CORPUS_SYMLINK"); }
  return readFileSync(cursor);
}
export function loadCorpus(root = getEnvironment().DATA_DIR): Corpus {
  if (!existsSync(path.join(root, "processed/manifest.json"))) return { fingerprint: "empty", documents: [], warnings: ["No active ingestion manifest; public-source retrieval unavailable"] };
  const manifest = ManifestSchema.parse(JSON.parse(safeRead(root, "processed/manifest.json").toString()));
  if (manifest.runStatus !== "complete") throw new Error("CORPUS_NOT_READY");
  const documents: ProcessedDocument[] = []; const warnings: string[] = [];
  for (const entry of manifest.entries.filter(e => ["ingested", "unchanged"].includes(e.status))) {
    if (!entry.processedFile || !entry.outputChecksum) continue;
    try {
      const bytes = safeRead(root, entry.processedFile);
      if (sha256(bytes) !== entry.outputChecksum) throw new Error("checksum");
      const d = ProcessedDocumentSchema.parse(JSON.parse(bytes.toString()));
      if (d.documentId !== entry.documentId || d.checksum !== entry.checksum || d.sourceUrl !== entry.source.url || !d.sourceUrl) throw new Error("identity");
      const host = new URL(d.sourceUrl).hostname;
      if (!/^(www\.)?rtb\.ie$/.test(host) && !/^(www\.)?irishstatutebook\.ie$/.test(host) && host !== "revisedacts.lawreform.ie") continue;
      // A detached page, section or excerpt invalidates this document for retrieval.
      for (const chunk of d.chunks) sourceFromChunk(d, chunk.id);
      documents.push(d);
    } catch { warnings.push(`Excluded invalid public document ${entry.documentId}`); }
  }
  return { fingerprint: sha256(JSON.stringify(documents.map(d => [d.documentId, d.checksum, d.metadataFingerprint]))), documents, warnings };
}
export function retrieve(corpus: Corpus, kind: Hit["kind"], issue: { type: string; question: string }, limit = 3): Hit[] {
  const query = tokens(`${issue.type} ${issue.question} deposit ${/painting|wear|damage/.test(issue.type) ? "paint damage condition wear" : /clean/.test(issue.type) ? "clean cleaning condition" : ""}`);
  const hits: Hit[] = [];
  for (const d of corpus.documents) {
    const isRule = ["rtb_guidance", "legislation"].includes(d.documentType);
    const isCase = ["rtb_determination_order", "rtb_adjudication_report"].includes(d.documentType) || d.subtype === "rtb_tribunal_report";
    if (kind === "rule" ? !isRule : !isCase || !d.preliminaryCase || d.depositRelevance !== "explicit_mention") continue;
    for (const chunk of d.chunks) {
      const words = tokens(chunk.text); const matched = query.filter(q => words.some(w => w === q || (q.length > 4 && w.startsWith(q.slice(0, -1)))));
      if (matched.length < 2) continue;
      const score = Math.round((matched.length / query.length) * 1000) / 1000;
      hits.push({ id: chunk.id, kind, caseId: d.preliminaryCase?.caseId ?? null, reportType: d.subtype ?? d.documentType, source: sourceFromChunk(d, chunk.id), score, tags: [issue.type, ...matched] });
    }
  }
  // One best passage per document makes the small corpus useful without repetitive hits.
  const unique = new Map<string, Hit>();
  for (const hit of hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))) if (!unique.has(hit.source.sourceDocumentId)) unique.set(hit.source.sourceDocumentId, hit);
  return [...unique.values()].slice(0, limit);
}
