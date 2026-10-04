import nextEnv from "@next/env";
import { openLocalDatabase } from "../src/lib/server/database";

nextEnv.loadEnvConfig(process.cwd());
try {
  const db = openLocalDatabase();
  db.close();
  console.log(
    "Local dataset directories and SQLite schema are ready. No documents imported."
  );
} catch {
  console.error(
    "Database setup failed. Check environment validation and data directory permissions."
  );
  process.exitCode = 1;
}
