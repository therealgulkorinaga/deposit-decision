import "server-only";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RelativeFileSchema, PublicDocumentSchema } from "../domain/schemas";
import { openDatabase } from "../lib/server/database";
import { getEnvironment } from "../lib/server/env";
import { extractFile, MAX_FILE_BYTES } from "./extract";
import {
  ManifestSchema,
  MetadataSchema,
  ProcessedDocumentSchema,
} from "./schemas";
import type {
  Manifest,
  ManifestEntry,
  ProcessedDocument,
  SourceMetadata,
} from "./schemas";
import {
  checksum,
  documentIdFor,
  PROCESSOR_VERSION,
  structureDocument,
} from "./structure";

function atomicJson(filename: string, value: unknown) {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
    });
    renameSync(temporary, filename);
  } finally {
    rmSync(temporary, { force: true });
  }
}
function safeFile(root: string, relative: string): string {
  RelativeFileSchema.parse(relative);
  const target = path.join(root, relative);
  // Do not follow symlinks, including parent directories and metadata sidecars.
  let cursor = root;
  for (const part of relative.split("/")) {
    cursor = path.join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink())
      throw new Error("SYMLINK_REJECTED: use a regular file inside data/raw");
  }
  const resolved = realpathSync(target);
  if (
    !resolved.startsWith(`${realpathSync(root)}${path.sep}`) ||
    !statSync(resolved).isFile()
  )
    throw new Error("PATH_REJECTED: expected a regular file inside data/raw");
  if (statSync(resolved).size > MAX_FILE_BYTES)
    throw new Error("FILE_LIMIT: maximum file size is 25 MiB");
  return resolved;
}
function scan(root: string, relative = ""): string[] {
  return readdirSync(path.join(root, relative), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.name.startsWith(".") || entry.name.endsWith(".meta.json"))
      return [];
    if (entry.isDirectory() && !entry.isSymbolicLink()) return scan(root, file);
    return [file];
  });
}
function loadMetadata(rawRoot: string, file: string): SourceMetadata {
  if (!existsSync(path.join(rawRoot, `${file}.meta.json`))) return {};
  const sidecar = safeFile(rawRoot, `${file}.meta.json`);
  return MetadataSchema.parse(JSON.parse(readFileSync(sidecar, "utf8")));
}
function persistMetadata(
  dataDir: string,
  document: ProcessedDocument,
  processedFile: string
) {
  const kind = document.preliminaryCase
    ? "case"
    : document.documentType === "legislation"
    ? "rule"
    : document.documentType === "rtb_guidance"
    ? "guidance"
    : document.documentType === "statistics"
    ? "statistics"
    : "unknown";
  const record = PublicDocumentSchema.parse({
    id: document.documentId,
    details: {
      title: document.title,
      sourceUrl: document.sourceUrl,
      kind,
      rawPath: `raw/${document.originalFile}`,
      processedPath: processedFile,
      sha256: document.checksum,
      status: "ingested",
    },
    createdAt: document.ingestionTimestamp,
    updatedAt: document.ingestionTimestamp,
  });
  const db = openDatabase(path.join(dataDir, "depositcheck.sqlite"));
  try {
    db.prepare(
      "INSERT INTO public_documents (id, record) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record"
    ).run(record.id, JSON.stringify(record));
  } finally {
    db.close();
  }
}
function entryFor(
  document: ProcessedDocument,
  file: string,
  output: string,
  status: ManifestEntry["status"],
  outputChecksum: string
): ManifestEntry {
  return {
    documentId: document.documentId,
    originalFile: file,
    source: {
      organisation: document.sourceOrganisation,
      url: document.sourceUrl,
    },
    checksum: document.checksum,
    ingestionTimestamp: document.ingestionTimestamp,
    documentType: document.documentType,
    chunkCount: document.chunks.length,
    status,
    errors: [],
    warnings: document.warnings,
    processedFile: output,
    outputChecksum,
    metadataFingerprint: document.metadataFingerprint,
    duplicateOf: status === "duplicate" ? document.originalFile : null,
  };
}
function safeError(error: unknown): string {
  if (
    error instanceof Error &&
    /^(?:FILE_LIMIT|PATH_REJECTED|SYMLINK_REJECTED|INVALID_PDF|PDF_PAGE_LIMIT|TEXT_LIMIT|OCR_REQUIRED|EMPTY_FILE|EMPTY_TEXT|UNSUPPORTED_FORMAT|ACCESS_CONTROL_PAGE|DUPLICATE_METADATA_CONFLICT):/.test(
      error.message
    )
  )
    return error.message;
  if (error instanceof SyntaxError)
    return "MALFORMED_JSON: invalid JSON document or metadata sidecar";
  if (error instanceof Error && error.name === "ZodError")
    return "INVALID_METADATA: document envelope or metadata does not match its schema";
  if (
    error instanceof Error &&
    ["PasswordException", "InvalidPDFException"].includes(error.name)
  )
    return `${
      error.name === "PasswordException" ? "ENCRYPTED_PDF" : "INVALID_PDF"
    }: provide a readable document manually`;
  return "PROCESSING_FAILED: unreadable document or invalid encoding; check the original file and metadata";
}

export async function runIngestion(
  options: { dataDir?: string; only?: string } = {}
): Promise<Manifest> {
  const dataDir = path.resolve(options.dataDir ?? getEnvironment().DATA_DIR);
  const rawRoot = path.join(dataDir, "raw");
  const processedRoot = path.join(dataDir, "processed");
  mkdirSync(rawRoot, { recursive: true });
  mkdirSync(processedRoot, { recursive: true });
  for (const folder of [rawRoot, processedRoot])
    if (
      lstatSync(folder).isSymbolicLink() ||
      !realpathSync(/* turbopackIgnore: true */ folder).startsWith(
        `${realpathSync(dataDir)}${path.sep}`
      )
    )
      throw new Error(
        "DATA_DIRECTORY_REJECTED: raw/processed must be local directories, not symlinks"
      );
  const lock = path.join(processedRoot, ".ingestion.lock");
  let handle: number;
  try {
    handle = openSync(lock, "wx");
  } catch {
    throw new Error(
      "INGESTION_LOCKED: another run may be active; see lock recovery in docs/INGESTION.md"
    );
  }
  try {
    writeFileSync(handle, String(process.pid));
    closeSync(handle);
    const manifestPath = path.join(processedRoot, "manifest.json");
    let previous: Manifest | null = null;
    if (existsSync(manifestPath)) {
      try {
        previous = ManifestSchema.parse(
          JSON.parse(readFileSync(manifestPath, "utf8"))
        );
      } catch {
        throw new Error(
          "MANIFEST_INVALID: existing manifest is corrupt; preserve it for inspection and follow recovery instructions"
        );
      }
    }
    if (options.only) RelativeFileSchema.parse(options.only);
    const files = (options.only ? [options.only] : scan(rawRoot)).sort(
      (a, b) =>
        Number(existsSync(path.join(rawRoot, `${b}.meta.json`))) -
          Number(existsSync(path.join(rawRoot, `${a}.meta.json`))) ||
        a.localeCompare(b, "en")
    );
    const manifest: Manifest = {
      schemaVersion: 1,
      processorVersion: PROCESSOR_VERSION,
      runStatus: "running",
      updatedAt: new Date().toISOString(),
      entries: options.only
        ? (previous?.entries ?? []).filter(
            (e) => e.originalFile !== options.only
          )
        : [],
    };
    const completed = new Map<string, ProcessedDocument>();
    for (const file of files) {
      let hash: string | null = null;
      let metadata: SourceMetadata = {};
      try {
        const absolute = safeFile(rawRoot, file);
        const bytes = readFileSync(absolute);
        hash = checksum(bytes);
        metadata = loadMetadata(rawRoot, file);
        const fingerprint = checksum(
          JSON.stringify([PROCESSOR_VERSION, metadata])
        );
        const id = documentIdFor(hash);
        const output = `processed/${id}.json`;
        const outputPath = path.join(dataDir, output);
        let cached = completed.get(hash);
        const old = previous?.entries.find(
          (e) =>
            e.checksum === hash &&
            e.status !== "failed" &&
            e.processedFile === output
        );
        if (!cached && old && existsSync(outputPath)) {
          try {
            const content = readFileSync(outputPath);
            if (checksum(content) === old.outputChecksum)
              cached = ProcessedDocumentSchema.parse(
                JSON.parse(content.toString("utf8"))
              );
          } catch {
            /* Rebuild missing/corrupt output from the untouched original. */
          }
        }
        if (
          cached &&
          cached.originalFile !== file &&
          (completed.has(hash) ||
            (options.only &&
              existsSync(path.join(rawRoot, cached.originalFile))))
        ) {
          if (
            Object.entries(metadata).some(
              ([key, value]) =>
                value !== undefined &&
                value !== cached![key as keyof ProcessedDocument]
            )
          )
            throw new Error(
              "DUPLICATE_METADATA_CONFLICT: identical bytes have conflicting metadata; reconcile the sidecars"
            );
          persistMetadata(dataDir, cached, output);
          const entry = entryFor(
            cached,
            file,
            output,
            "duplicate",
            checksum(readFileSync(outputPath))
          );
          manifest.entries.push(entry);
          completed.set(hash, cached);
        } else if (
          cached &&
          cached.originalFile === file &&
          cached.metadataFingerprint === fingerprint &&
          cached.processorVersion === PROCESSOR_VERSION
        ) {
          persistMetadata(dataDir, cached, output);
          manifest.entries.push(
            entryFor(
              cached,
              file,
              output,
              "unchanged",
              checksum(readFileSync(outputPath))
            )
          );
          completed.set(hash, cached);
        } else {
          const extracted = await extractFile(
            bytes,
            path.extname(file).toLowerCase()
          );
          const document = ProcessedDocumentSchema.parse(
            structureDocument(
              extracted,
              metadata,
              file,
              hash,
              fingerprint,
              new Date().toISOString()
            )
          );
          atomicJson(outputPath, document);
          persistMetadata(dataDir, document, output);
          completed.set(hash, document);
          manifest.entries.push(
            entryFor(
              document,
              file,
              output,
              "ingested",
              checksum(readFileSync(outputPath))
            )
          );
        }
      } catch (error) {
        manifest.entries.push({
          documentId: hash ? documentIdFor(hash) : null,
          originalFile: file,
          source: {
            organisation: metadata.sourceOrganisation ?? null,
            url: metadata.sourceUrl ?? null,
          },
          checksum: hash,
          ingestionTimestamp: new Date().toISOString(),
          documentType: metadata.documentType ?? "unknown",
          chunkCount: 0,
          status: "failed",
          errors: [safeError(error)],
          warnings: [],
          processedFile: null,
          outputChecksum: null,
          metadataFingerprint: null,
          duplicateOf: null,
        });
      }
      manifest.updatedAt = new Date().toISOString();
      atomicJson(manifestPath, manifest);
    }
    manifest.runStatus = "complete";
    manifest.updatedAt = new Date().toISOString();
    atomicJson(manifestPath, manifest);
    return manifest;
  } finally {
    rmSync(lock, { force: true });
  }
}
