import { SubmissionSchema } from "../../../agents/contracts";
import { assessSubmission } from "../../../agents/service";
import { errorResponse } from "../../../lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 180;
let active = 0;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    let allowed = false;
    try { const url = new URL(origin); allowed = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.host === (request.headers.get("host") ?? new URL(request.url).host); } catch { /* Invalid origin. */ }
    if (!allowed) return errorResponse(403, "ORIGIN_REJECTED", "Use the local application to submit your case.");
  }
  if (active >= 2) return errorResponse(429, "BUSY", "Two assessments are already running. Try again shortly.");
  active++;
  try {
    const reader = request.body?.getReader(); if (!reader) throw new Error("INVALID_REQUEST");
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.length; if (bytes > 12 * 1024 * 1024) { await reader.cancel(); return errorResponse(413, "UPLOAD_LIMIT", "Keep uploads below 12 MB total and 5 MB per file."); } chunks.push(next.value); }
    const form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body: Buffer.concat(chunks) }).formData();
    const submission = SubmissionSchema.parse(JSON.parse(String(form.get("submission"))));
    const files = new Map<string, File>();
    for (const [key, value] of form.entries()) if (key.startsWith("file:")) {
      const id = key.slice(5);
      if (typeof value === "string" || !submission.evidence.some(e => e.id === id && e.status === "present") || files.has(id)) throw new Error("INVALID_REQUEST");
      files.set(id, value);
    }
    return Response.json(await assessSubmission(submission, files));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "AI_NOT_CONFIGURED") return errorResponse(503, "AI_NOT_CONFIGURED", "Live interpretation is not configured. Set OPENAI_API_KEY and OPENAI_MODEL on the server, or use the example case.");
    if (/AI_|FLOW_BUDGET/.test(message)) return errorResponse(502, "INTERPRETATION_FAILED", "Interpretation could not complete. Your previous assessment is unchanged; try again.");
    if (/CORPUS/.test(message)) return errorResponse(503, "CORPUS_NOT_READY", "Public-source ingestion is not ready. Complete ingestion and retry.");
    return errorResponse(422, "ASSESSMENT_FAILED", "Check the case details and files. Use text PDFs, HTML, TXT, JSON, PNG, JPEG or WebP, up to 5 MB each. No assessment was replaced.");
  } finally { active--; }
}
