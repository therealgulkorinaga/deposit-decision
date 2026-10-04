import nextEnv from "@next/env";
import { getEnvironment } from "../src/lib/server/env";

nextEnv.loadEnvConfig(process.cwd());
try {
  getEnvironment();
  console.log(
    "Environment valid. OPENAI_API_KEY is optional during mock setup; no SDK calls made."
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Environment validation failed."
  );
  process.exitCode = 1;
}
