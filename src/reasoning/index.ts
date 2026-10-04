import "server-only";
import type { PipelineServices } from "../services/contracts";
import { NotImplementedError } from "../services/errors";

export const assessClaim: PipelineServices["assessClaim"] = async () => {
  throw new NotImplementedError("assess claim");
};
export const reassessClaim: PipelineServices["reassessClaim"] = async () => {
  throw new NotImplementedError("reassess claim");
};
