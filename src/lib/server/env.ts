import "server-only";
import { z } from "zod";
import path from "node:path";

const EnvironmentSchema = z.object({
  OPENAI_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .min(1)
      .refine((value) => !/\s/.test(value), "Must not contain whitespace")
      .optional()
  ),
  DATA_DIR: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !value.includes("\0"), "Invalid directory")
    .default("./data"),
});

export function parseEnvironment(source: Record<string, string | undefined>) {
  const result = EnvironmentSchema.safeParse(source);
  if (!result.success) {
    // Report field names only: never print environment values or credentials.
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(`Invalid environment variables: ${fields.join(", ")}`);
  }
  return { ...result.data, DATA_DIR: path.resolve(result.data.DATA_DIR) };
}

export function getEnvironment() {
  return parseEnvironment(process.env);
}
