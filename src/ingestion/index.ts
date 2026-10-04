import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PipelineServices } from "../services/contracts";
import { getEnvironment } from "../lib/server/env";
import { ProcessedDocumentSchema } from "./schemas";
import { runIngestion } from "./runner";

export const ingestDocument: PipelineServices["ingestDocument"] = async ({
  rawPath,
}) => {
  const dataDir = getEnvironment().DATA_DIR;
  const result = await runIngestion({ dataDir, only: rawPath });
  const entry = result.entries.find((e) => e.originalFile === rawPath)!;
  const document = entry.processedFile
    ? ProcessedDocumentSchema.parse(
        JSON.parse(
          readFileSync(path.join(dataDir, entry.processedFile), "utf8")
        )
      )
    : null;
  return { entry, document };
};
