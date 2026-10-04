import "server-only";
import { ingestDocument } from "../ingestion";
import { retrieveCases, retrieveRules } from "../retrieval";
import { assessClaim, reassessClaim } from "../reasoning";
import type { PipelineServices } from "./contracts";
import { NotImplementedError } from "./errors";

export const pipeline: PipelineServices = {
  ingestDocument,
  retrieveCases,
  retrieveRules,
  assessClaim,
  reassessClaim,
  updateEvidence: async () => {
    throw new NotImplementedError("update evidence");
  },
};
