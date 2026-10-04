import snapshot from "./catalogue.json";
import { CatalogueEntrySchema } from "./model";

// Trusted, versioned source excerpts, not rules supplied by an API caller or LLM.
// Refresh through ingestion and review issue coverage before replacing this file.
export const DEFAULT_CATALOGUE = CatalogueEntrySchema.array().parse(snapshot);
