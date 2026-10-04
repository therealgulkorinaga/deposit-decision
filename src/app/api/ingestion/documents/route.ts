import { IngestDocumentRequestSchema } from "../../../../services/contracts";
import { IngestionResultSchema } from "../../../../ingestion/schemas";
import { pipeline } from "../../../../services/pipeline";
import { errorResponse } from "../../../../lib/server/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "INVALID_JSON",
      "Send a valid JSON request body."
    );
  }
  const parsed = IngestDocumentRequestSchema.safeParse(body);
  if (!parsed.success)
    return errorResponse(
      422,
      "INVALID_REQUEST",
      "Provide a relative rawPath inside DATA_DIR/raw."
    );
  try {
    const result = IngestionResultSchema.parse(
      await pipeline.ingestDocument(parsed.data)
    );
    return Response.json(result, {
      status: result.entry.status === "failed" ? 422 : 200,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INGESTION_LOCKED"))
      return errorResponse(
        409,
        "INGESTION_LOCKED",
        "Another ingestion run may be active."
      );
    return errorResponse(
      500,
      "INGESTION_FAILED",
      "Check the ingestion manifest, local files and server configuration."
    );
  }
}
