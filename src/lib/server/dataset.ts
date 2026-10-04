import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getEnvironment } from "./env";

export const datasetFolders = ["raw", "processed", "rules", "cases"] as const;
export function ensureDataset(dataDir = getEnvironment().DATA_DIR) {
  mkdirSync(dataDir, { recursive: true });
  // This directory is created at runtime, not copied into a deployment bundle.
  for (const folder of datasetFolders)
    mkdirSync(path.join(/* turbopackIgnore: true */ dataDir, folder), {
      recursive: true,
    });
  return dataDir;
}
