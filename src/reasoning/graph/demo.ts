import { createDemoCase, createDemoWithNewEvidence } from "../../domain/ontology/demo";
import { DEFAULT_CATALOGUE } from "./catalogue";
import { evaluateCase, reassessCase } from "./evaluate";
import type { Options } from "./model";

export function runGraphDemo(asOf = "2026-10-04") {
  const options: Options = {
    asOf, catalogue: DEFAULT_CATALOGUE,
    evidenceAssignments: [
      { evidenceId: "tenancy-agreement", deductionFactId: null, role: "tenancy_agreement" },
      { evidenceId: "move-in-photos", deductionFactId: null, role: "move_in_photos" },
      { evidenceId: "move-out-photos", deductionFactId: null, role: "move_out_photos" },
      { evidenceId: "landlord-messages", deductionFactId: null, role: "damage_messages" },
    ],
  };
  const initialCase = createDemoCase();
  const initial = evaluateCase(initialCase, options);
  const updatedCase = createDemoWithNewEvidence();
  const updatedOptions: Options = { ...options, evidenceAssignments: [...options.evidenceAssignments,
    { evidenceId: "painting-invoice", deductionFactId: "painting_deduction", role: "invoice" },
    { evidenceId: "landlord-damage-photos", deductionFactId: "painting_deduction", role: "landlord_photographs" },
  ] };
  const reassessment = reassessCase(initial, updatedCase, updatedOptions);
  return { initialCase, options, initial, updatedCase, updatedOptions, ...reassessment };
}
