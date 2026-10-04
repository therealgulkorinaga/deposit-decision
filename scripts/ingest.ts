import nextEnv from "@next/env";
import { runIngestion } from "../src/ingestion/runner";

nextEnv.loadEnvConfig(process.cwd());
try {
  const manifest = await runIngestion();
  const counts = { ingested: 0, unchanged: 0, duplicate: 0, failed: 0 };
  for (const entry of manifest.entries) {
    counts[entry.status]++;
    console.log(
      `${entry.status}: ${entry.originalFile} (${entry.chunkCount} chunks)`
    );
    for (const error of entry.errors) console.error(`  ${error}`);
  }
  console.log(JSON.stringify(counts));
  console.log(
    "Manifest: DATA_DIR/processed/manifest.json. Originals are unchanged."
  );
  if (counts.failed) process.exitCode = 1;
} catch (error) {
  console.error(
    error instanceof Error &&
      /^(INGESTION_LOCKED|MANIFEST_INVALID|DATA_DIRECTORY_REJECTED|Invalid environment variables)/.test(
        error.message
      )
      ? error.message
      : "Ingestion could not start; check DATA_DIR and filesystem permissions."
  );
  process.exitCode = 1;
}
