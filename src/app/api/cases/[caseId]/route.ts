import { IdSchema } from "../../../../domain/schemas";
import { openLocalDatabase } from "../../../../lib/server/database";
import { LocalRepository } from "../../../../lib/server/repository";
import { errorResponse } from "../../../../lib/server/http";

export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await context.params;
  if (!IdSchema.safeParse(caseId).success)
    return errorResponse(422, "INVALID_REQUEST", "Case ID must be a UUID.");
  try {
    const db = openLocalDatabase();
    try {
      const repository = new LocalRepository(db);
      const record = repository.getCase(caseId);
      return record
        ? Response.json({
            case: record,
            evidence: repository.listEvidence(caseId),
          })
        : errorResponse(404, "NOT_FOUND", "Case not found.");
    } finally {
      db.close();
    }
  } catch {
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "The server could not load this case."
    );
  }
}
