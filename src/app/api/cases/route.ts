import { z } from "zod";
import { CaseInputSchema, CaseSchema } from "../../../domain/schemas";
import { openLocalDatabase } from "../../../lib/server/database";
import { LocalRepository } from "../../../lib/server/repository";
import { createPostHandler } from "../../../lib/server/http";

export const runtime = "nodejs";
export const POST = createPostHandler(
  CaseInputSchema,
  z.object({ case: CaseSchema }),
  async (input) => {
    const db = openLocalDatabase();
    try {
      return { case: new LocalRepository(db).createCase(input) };
    } finally {
      db.close();
    }
  },
  201
);
