export type Party = "Tenant" | "Landlord" | "Unknown";
export type Presence = "present" | "absent" | "unknown";
export type Answer = "Yes" | "No" | "Unknown";
export type Position =
  | "Strong position"
  | "Worth pursuing"
  | "Uncertain"
  | "Weak position"
  | "Needs expert review";
export interface Claim {
  id: string;
  label: string;
  amount: number;
}
export interface Fact {
  id: string;
  label: string;
  value: string;
  provenance: "User statement" | "Mock extraction";
  evidenceId?: string;
}
export interface Evidence {
  id: string;
  type: string;
  party: Party;
  status: Presence;
  file?: File;
  filename?: string;
  note: string;
}
export interface Case {
  location: string;
  deposit: string;
  returned: string;
  start: string;
  end: string;
  reason: string;
  rent: Answer;
  utilities: Answer;
  description: string;
  claims: Claim[];
  facts: Fact[];
  evidence: Evidence[];
  demo: boolean;
  revision: number;
}
export interface RuleReference {
  id: string;
  title: string;
  description: string;
  sourceLabel: string;
  sourceUrl: null;
}
export interface ComparableCase {
  id: string;
  name: string;
  similarity: string;
  outcome: string;
  reason: string;
  sourceUrl: null;
}
export interface RecommendedAction {
  description: string;
  checklist: string[];
  escalation: string;
}
export interface Assessment {
  position: Position;
  confidence: "High" | "Medium" | "Low";
  revision: number;
  disputed: number;
  question: string;
  supports: string[];
  adverse: string[];
  missing: string[];
  action: RecommendedAction;
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
export const amountInDispute = (c: Case) =>
  Math.round((Number(c.deposit) - Number(c.returned)) * 100) / 100;
const types = [
  "Tenancy agreement",
  "Inventory / condition report",
  "Move-in photos",
  "Move-out photos",
  "Landlord messages",
  "Deposit / payment records",
  "Landlord invoices",
  "Landlord photographs",
  "Utility records",
  "Other evidence",
];
export function createCase(demo = false): Case {
  return {
    location: demo ? "Dublin" : "",
    deposit: demo ? "1500" : "",
    returned: demo ? "500" : "",
    start: demo ? "2021-06-01" : "",
    end: demo ? "2024-06-01" : "",
    reason: demo ? "Painting and cleaning" : "",
    rent: demo ? "No" : "Unknown",
    utilities: "Unknown",
    description: demo
      ? "After three years, my landlord retained €1,000 for painting and cleaning. I have photos from the beginning and end of the tenancy."
      : "",
    claims: demo
      ? [
          { id: "painting", label: "Painting", amount: 700 },
          { id: "cleaning", label: "Cleaning", amount: 300 },
        ]
      : [],
    facts: [],
    demo,
    revision: 0,
    evidence: types.map((type, i) => ({
      id: String(i),
      type,
      party: i === 6 || i === 7 ? "Landlord" : "Tenant",
      status: demo
        ? [0, 2, 3, 4].includes(i)
          ? "present"
          : [1, 6, 7].includes(i)
          ? "absent"
          : "unknown"
        : "unknown",
      note: "",
    })),
  };
}
export function validate(c: Case): string[] {
  const errors: string[] = [];
  if (!c.location.trim()) errors.push("Enter a county or property location.");
  if (
    !c.deposit ||
    !Number.isFinite(Number(c.deposit)) ||
    Number(c.deposit) <= 0
  )
    errors.push("Enter a deposit greater than €0.");
  if (
    !c.returned ||
    !Number.isFinite(Number(c.returned)) ||
    Number(c.returned) < 0 ||
    Number(c.returned) > Number(c.deposit)
  )
    errors.push("Enter an amount returned between €0 and the deposit paid.");
  if (!c.start || !c.end || c.end < c.start)
    errors.push("Enter tenancy dates, with the end on or after the start.");
  if (!c.reason.trim())
    errors.push("Enter the stated reason, or “No reason given”.");
  return errors;
}
export function extract(c: Case): Case {
  if (!c.demo) return c;
  const facts = c.evidence
    .filter((e) => e.status === "present" && ["0", "6", "7"].includes(e.id))
    .map((e) => ({
      id: e.id,
      label:
        e.id === "0"
          ? "Tenancy agreement summary"
          : e.id === "6"
          ? "Invoice summary"
          : "Photograph summary",
      value:
        e.id === "0"
          ? "Agreement describes a three-year tenancy."
          : e.id === "6"
          ? "Painting invoice: €700."
          : "Landlord photographs show wall damage; date and cause unconfirmed.",
      provenance: "Mock extraction" as const,
      evidenceId: e.id,
    }));
  return {
    ...c,
    facts: facts.map((f) => c.facts.find((old) => old.id === f.id) ?? f),
  };
}
export function injectLandlord(c: Case): Case {
  return {
    ...c,
    revision: c.revision + 1,
    evidence: c.evidence.map((e) =>
      e.id === "6"
        ? {
            ...e,
            status: "present",
            party: "Landlord",
            filename: "demo-painting-invoice.pdf",
            note: "Demo invoice: €700 painting charge.",
          }
        : e.id === "7"
        ? {
            ...e,
            status: "present",
            party: "Landlord",
            filename: "demo-wall-damage.jpg",
            note: "Demo photographs showing wall damage.",
          }
        : e
    ),
  };
}
export const action: RecommendedAction = {
  description:
    "Request an itemised breakdown, supporting photographs and invoices before deciding whether to escalate.",
  checklist: [
    "Itemised deductions",
    "Supporting photographs",
    "Invoices or estimates",
    "Move-in condition evidence",
    "Return of any undisputed deposit",
  ],
  escalation: "Residential Tenancies Board",
};
export function assess(c: Case): Assessment {
  const has = (id: string) =>
    c.evidence.some((e) => e.id === id && e.status === "present");
  const landlord = has("6") && has("7");
  return {
    revision: c.revision,
    disputed: amountInDispute(c),
    position: c.demo && !landlord ? "Worth pursuing" : "Uncertain",
    confidence: c.demo ? "Medium" : "Low",
    question:
      "Whether the claimed costs reflect tenant-caused damage or ordinary wear associated with the tenancy.",
    supports: [
      has("2") ? "Move-in photos are marked as available for comparison." : "",
      has("3") ? "Move-out photos are marked as available for comparison." : "",
      c.rent === "No" ? "You report no outstanding rent." : "",
    ].filter(Boolean),
    adverse: [
      has("6")
        ? "Landlord invoices are now available; the claimed costs need checking."
        : "The landlord states a deduction, but supporting costs remain unconfirmed.",
      has("7")
        ? "Landlord photographs are available; their date and context need checking."
        : "",
      c.rent === "Yes" ? "You report outstanding rent." : "",
      c.utilities === "Yes" ? "You report outstanding utilities." : "",
    ].filter(Boolean),
    missing: c.evidence
      .filter((e) => ["1", "6", "7"].includes(e.id) && e.status !== "present")
      .map((e) => `${e.type} (${e.status})`),
    action,
  };
}
export const rules: RuleReference[] = [
  {
    id: "rule1",
    title: "Damage or ordinary wear?",
    description:
      "This illustrative rule card asks how condition changed over the tenancy and what evidence supports the explanation.",
    sourceLabel: "RTB guidance — source placeholder",
    sourceUrl: null,
  },
  {
    id: "rule2",
    title: "Connect each cost to evidence",
    description:
      "This illustrative rule card asks for an itemised cost and documents supporting each deduction.",
    sourceLabel: "RTB guidance — source placeholder",
    sourceUrl: null,
  },
];
export const comparables: ComparableCase[] = [
  {
    id: "MOCK-001",
    name: "Painting after a long tenancy",
    similarity: "Shared issue: painting and condition",
    outcome: "Illustrative outcome: deduction reduced",
    reason: "Shows where dated condition evidence could matter.",
    sourceUrl: null,
  },
  {
    id: "MOCK-002",
    name: "Disputed cleaning charge",
    similarity: "Shared issue: unsupported cleaning cost",
    outcome: "Illustrative outcome: deposit partly returned",
    reason: "Shows why itemised costs could change the assessment.",
    sourceUrl: null,
  },
];
