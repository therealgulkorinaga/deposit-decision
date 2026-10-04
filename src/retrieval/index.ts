import "server-only";
import type { PipelineServices } from "../services/contracts";
import { NotImplementedError } from "../services/errors";

export const retrieveCases: PipelineServices["retrieveCases"] = async () => {
  throw new NotImplementedError("retrieve cases");
};
export const retrieveRules: PipelineServices["retrieveRules"] = async () => {
  throw new NotImplementedError("retrieve rules");
};
