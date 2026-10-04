import "server-only";
import nextEnv from "@next/env";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { getEnvironment } from "../src/lib/server/env";
import { checksum } from "../src/ingestion/structure";
import { extractFile, MAX_FILE_BYTES } from "../src/ingestion/extract";
import sources from "../docs/seed-sources.json";

nextEnv.loadEnvConfig(process.cwd());
const allowed = (url: URL) =>
  url.protocol === "https:" && ["rtb.ie", "www.rtb.ie"].includes(url.hostname);
async function download(url: string): Promise<Buffer> {
  let current = new URL(url);
  for (let redirect = 0; redirect <= 4; redirect++) {
    if (!allowed(current))
      throw new Error(
        "Unexpected redirect host; download manually after checking the source."
      );
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(40_000),
      headers: { "user-agent": "Depositcheck local public-corpus setup/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Redirect missing a destination.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Source returned HTTP ${response.status}; use manual download. No access-control workaround attempted.`
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > MAX_FILE_BYTES)
          throw new Error("Source exceeds file size limit.");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Too many redirects; use manual download.");
}
try {
  const raw = path.join(getEnvironment().DATA_DIR, "raw");
  mkdirSync(raw, { recursive: true });
  if (lstatSync(raw).isSymbolicLink())
    throw new Error("Raw directory must not be a symlink.");
  for (const source of sources) {
    const target = path.join(raw, source.file);
    if (existsSync(target) && lstatSync(target).isSymbolicLink())
      throw new Error("Seed target must not be a symlink.");
    const bytes = existsSync(target)
      ? readFileSync(target)
      : await download(source.sourceUrl);
    if (source.sha256 && checksum(bytes) !== source.sha256)
      throw new Error(
        `Checksum differs for ${source.file}; preserve the file and review the updated source manually.`
      );
    await extractFile(bytes, path.extname(source.file));
    if (!existsSync(target)) writeFileSync(target, bytes, { flag: "wx" });
    const sidecar = `${target}.meta.json`;
    if (!existsSync(sidecar))
      writeFileSync(
        sidecar,
        JSON.stringify(
          {
            sourceUrl: source.sourceUrl,
            sourceOrganisation: "Residential Tenancies Board",
          },
          null,
          2
        ),
        { flag: "wx" }
      );
    console.log(`Ready: ${source.file}`);
  }
  console.log(
    "Five public case reports and one guide are ready. Run npm run ingest."
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Seed download failed. Use manual download instructions."
  );
  process.exitCode = 1;
}
