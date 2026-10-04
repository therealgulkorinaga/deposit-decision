import "server-only";
import type { PipelineServices } from "../services/contracts";
import { NotImplementedError } from "../services/errors";

export const ingestDocument: PipelineServices["ingestDocument"] = async () => {
  throw new NotImplementedError("ingest document");
};
