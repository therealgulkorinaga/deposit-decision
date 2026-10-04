import { getEnvironment } from "../../../lib/server/env";
import { openLocalDatabase } from "../../../lib/server/database";
import { errorResponse } from "../../../lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    getEnvironment();
    const db = openLocalDatabase();
    try {
      db.prepare("SELECT 1").get();
    } finally {
      db.close();
    }
    return Response.json({
      status: "ok",
      database: "sqlite",
      pipeline: "ingestion_only",
      ui: "mock",
    });
  } catch {
    return errorResponse(
      503,
      "ENVIRONMENT_UNAVAILABLE",
      "Check the server environment and data directory."
    );
  }
}
