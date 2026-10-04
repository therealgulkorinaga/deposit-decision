import {
  UpdateEvidenceRequestSchema,
  UpdateEvidenceResultSchema,
} from "../../../../services/contracts";
import { pipeline } from "../../../../services/pipeline";
import { createPostHandler } from "../../../../lib/server/http";

export const runtime = "nodejs";
export const POST = createPostHandler(
  UpdateEvidenceRequestSchema,
  UpdateEvidenceResultSchema,
  pipeline.updateEvidence
);
