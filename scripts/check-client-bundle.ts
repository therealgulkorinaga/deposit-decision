import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Use a fake canary in a production build, never a real credential.
const forbidden = [
  "OPENAI_API_KEY",
  "sk-client-boundary-test-not-a-real-key",
  "node:sqlite",
];
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory()
      ? walk(file)
      : /\.(js|map)$/.test(file)
      ? [file]
      : [];
  });
}
const files = walk(".next/static");
if (!files.length) throw new Error("Build first: no browser JavaScript found.");
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (forbidden.some((token) => text.includes(token)))
    throw new Error(`Server-only data found in browser bundle: ${file}`);
}
console.log(
  `Checked ${files.length} browser assets: no API key canary, key variable, or SQLite import.`
);
