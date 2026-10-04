"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  amountInDispute,
  createCase,
  injectLandlord,
  money,
  validate,
} from "../mocks/case-state";
import type {
  Case,
  Evidence,
  Party,
  Presence,
} from "../mocks/case-state";
import "./deposit-app.css";
import { submitAssessment } from "../lib/client/assessment";
import type { ConsumerResult } from "../agents/service";
import { VerifiedAssessment } from "./verified-assessment";

type Screen =
  | "home"
  | "situation"
  | "evidence"
  | "facts"
  | "assessment"
  | "update"
  | "action";
const steps: Screen[] = [
  "situation",
  "evidence",
  "facts",
  "assessment",
  "action",
];
const labels = [
  "Your situation",
  "Evidence",
  "Confirm facts",
  "Assessment",
  "Next action",
];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [c, setCase] = useState<Case>(() => createCase());
  const [result, setResult] = useState<ConsumerResult["assessment"] | null>(null);
  const [previous, setPrevious] = useState<ConsumerResult["assessment"] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const requestVersion = useRef(0);
  const [caseId, setCaseId] = useState(() => crypto.randomUUID());
  const [verified, setVerified] = useState<ConsumerResult | null>(null);
  const [jurisdiction, setJurisdiction] = useState<"IE" | "other">("IE");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [screen]);

  const go = (s: Screen) => {
    setErrors([]);
    setScreen(s);
  };
  const edit = (patch: Partial<Case>) =>
    setCase((old) => ({ ...old, ...patch, revision: old.revision + 1 }));
  const changeEvidence = (id: string, patch: Partial<Evidence>) =>
    edit({
      evidence: c.evidence.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  const start = (demo: boolean) => {
    requestVersion.current++;
    setBusy(false);
    setCaseId(crypto.randomUUID());
    setVerified(null);
    setJurisdiction("IE");
    setCase(createCase(demo));
    setResult(null);
    setPrevious(null);
    setDraft("");
    go("situation");
  };
  const review = () => {
    go("facts");
  };
  const run = async (snapshot: Case = c) => {
    const problems = validate(snapshot);
    if (problems.length) {
      setErrors(problems);
      return;
    }
    setBusy(true);
    const version = ++requestVersion.current;
    try {
      const response = await submitAssessment(snapshot, caseId, verified?.runId ?? null, jurisdiction);
      if (version !== requestVersion.current) return;
      setPrevious(result);
      setVerified(response);
      setResult(response.assessment);
      window.scrollTo({ top: 0 });
      go("assessment");
    } catch (error) {
      if (version === requestVersion.current) setErrors([error instanceof Error ? error.message : "Assessment could not complete."]);
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  };
  const input = (
    key: "location" | "deposit" | "returned" | "start" | "end" | "reason",
    label: string,
    type = "text"
  ) => (
    <Field label={label}>
      <input
        type={type}
        value={c[key]}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? ".01" : undefined}
        onChange={(e) => edit({ [key]: e.target.value })}
        required
      />
    </Field>
  );
  const intake = (
    <div className="form-grid">
      <Field label="Jurisdiction"><select value={jurisdiction} onChange={e => setJurisdiction(e.target.value as "IE" | "other")}><option value="IE">Ireland</option><option value="other">Outside Ireland</option></select></Field>
      {input("location", "County / property location")}
      {input("reason", "Landlord’s stated reason")}
      {input("deposit", "Deposit paid (€)", "number")}
      {input("returned", "Amount returned (€)", "number")}
      {input("start", "Tenancy start", "date")}
      {input("end", "Tenancy end", "date")}
      {(["rent", "utilities"] as const).map((key) => (
        <Field
          key={key}
          label={`${key === "rent" ? "Rent" : "Utilities"} outstanding`}
        >
          <select
            value={c[key]}
            onChange={(e) => edit({ [key]: e.target.value })}
          >
            <option>Unknown</option>
            <option>No</option>
            <option>Yes</option>
          </select>
        </Field>
      ))}
      <Field label="What happened?">
        <textarea
          rows={3}
          value={c.description}
          onChange={(e) => edit({ description: e.target.value })}
        />
      </Field>
      <div className="amount-box">
        <span>Amount in dispute</span>
        <strong>
          {c.deposit && c.returned && Number(c.returned) <= Number(c.deposit)
            ? money(amountInDispute(c))
            : "Enter deposit amounts"}
        </strong>
        <small>Deposit paid minus amount returned</small>
      </div>
    </div>
  );
  const evidence = (
    <div className="evidence-grid">
      {c.evidence.map((e) => (
        <article className="evidence-card" key={e.id}>
          <header>
            <h3>{e.type}</h3>
            <span className={`dot ${e.status}`} aria-label={e.status} />
          </header>
          <div className="two-fields">
            <Field label="Availability">
              <select
                value={e.status}
                onChange={(v) =>
                  changeEvidence(e.id, {
                    status: v.target.value as Presence,
                    ...(v.target.value !== "present"
                      ? { file: undefined, filename: undefined }
                      : {}),
                  })
                }
              >
                {["unknown", "present", "absent"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Source party">
              <select
                value={e.party}
                onChange={(v) =>
                  changeEvidence(e.id, { party: v.target.value as Party })
                }
              >
                <option>Tenant</option>
                <option>Landlord</option>
                <option>Unknown</option>
              </select>
            </Field>
          </div>
          <Field label="Optional note">
            <input
              value={e.note}
              onChange={(v) => changeEvidence(e.id, { note: v.target.value })}
            />
          </Field>
          <Field label="Select a file">
            <input
              type="file"
              onChange={(v) => {
                const file = v.target.files?.[0];
                if (file)
                  changeEvidence(e.id, {
                    file,
                    filename: file.name,
                    status: "present",
                  });
              }}
            />
          </Field>
          {e.filename && (
            <div className="file-name">
              {e.filename}
              <button
                className="text-button"
                onClick={() =>
                  changeEvidence(e.id, { file: undefined, filename: undefined })
                }
              >
                Remove file
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => go("home")}>
          <span className="brand-mark">d</span>depositcheck
        </button>
        <span className="prototype">Working prototype · Ireland</span>
      </header>
      {screen !== "home" && (
        <nav aria-label="Case progress" className="steps">
          {labels.map((label, i) => (
            <span
              className={
                steps[i] === screen || (screen === "update" && i === 1)
                  ? "active"
                  : ""
              }
              key={label}
            >
              <b>{i + 1}</b>
              {label}
            </span>
          ))}
        </nav>
      )}
      <main>
        {screen === "home" ? (
          <section className="landing">
            <div>
              <p className="eyebrow">A clearer way forward</p>
              <h1 ref={heading} tabIndex={-1}>
                Was your rental deposit withheld?
              </h1>
              <p className="lead">
                See what the evidence supports, what is missing and whether your
                case is worth pursuing.
              </p>
              <div className="buttons">
                <button className="primary" onClick={() => start(false)}>
                  Check my deposit <span>↗</span>
                </button>
                <button className="secondary" onClick={() => start(true)}>
                  Try an example case
                </button>
              </div>
              <p className="fine">
                No account needed. Files are processed on this computer; live interpretation sends their contents to OpenAI when you assess your case.
              </p>
            </div>
            <aside className="preview">
              <div className="preview-top">
                <span>Your deposit, made clearer</span>
                <span>Example case</span>
              </div>
              <div className="deposit-visual">
                <div>
                  <small>Deposit paid</small>
                  <strong>€1,500</strong>
                </div>
                <div>
                  <small>Returned</small>
                  <strong>€500</strong>
                </div>
              </div>
              <div className="bar">
                <i />
              </div>
              <div className="preview-dispute">
                <span>Still in dispute</span>
                <strong>€1,000</strong>
              </div>
              <div className="preview-path">
                <p>
                  <b>01</b> Set out the facts
                </p>
                <p>
                  <b>02</b> See what the evidence supports
                </p>
                <p>
                  <b>03</b> Choose your next step
                </p>
              </div>
              <small>
                Illustrative example. Results are computed from the supplied evidence.
              </small>
            </aside>
          </section>
        ) : (
          <>
            <div className="page-heading">
              <p className="eyebrow">
                {c.demo ? "Example case · Dublin" : "Your deposit case"}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {
                  (
                    {
                      situation: "Let’s start with the facts.",
                      evidence: "What evidence do you have?",
                      facts: "Does this look right?",
                      assessment: result
                        ? result.disputed === null ? "Amount needs clarification" : `${money(result.disputed)} is in dispute`
                        : "Your assessment",
                      update: "Add the next piece of evidence.",
                      action: "Make your next step count.",
                    } as Record<string, string>
                  )[screen]
                }
              </h1>
              <p className="subtitle">
                {
                  (
                    {
                      situation:
                        "A few details about your tenancy and the deduction.",
                      evidence:
                        "Mark what is available. You can continue with missing evidence.",
                      facts:
                        "Confirm your statements and itemised deductions. Documents will be interpreted when you assess the case.",
                      assessment:
                        "A structured view of your position, with the gaps made visible.",
                      update:
                        "Your previous assessment stays unchanged until you reassess.",
                      action:
                        "Follow the next step identified for your evidence.",
                    } as Record<string, string>
                  )[screen]
                }
              </p>
            </div>
            {!!errors.length && (
              <div className="error" role="alert">
                <strong>Check these details</strong>
                <ul>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {screen === "situation" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const problems = validate(c);
                  setErrors(problems);
                  if (!problems.length) go("evidence");
                }}
              >
                {intake}
                <div className="buttons footer-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => go("home")}
                  >
                    Back
                  </button>
                  <button className="primary">Continue to evidence</button>
                </div>
              </form>
            )}
            {(screen === "evidence" || screen === "update") && (
              <>
                {screen === "update" && c.demo && (
                  <div className="demo-banner">
                    <div>
                      <strong>Add landlord evidence</strong>
                      <p>
                        Load demo wall-damage photographs and a €700 painting
                        invoice.
                      </p>
                    </div>
                    <button
                      className="secondary"
                      disabled={c.evidence.some(
                        (e) => e.filename === "demo-painting-invoice.pdf"
                      )}
                      onClick={() => setCase(injectLandlord(c))}
                    >
                      Add landlord evidence
                    </button>
                  </div>
                )}
                {screen === "update" &&
                  result &&
                  c.revision !== result.revision && (
                    <p className="notice" role="status">
                      New evidence added or updated. Review the facts before
                      reassessing.
                    </p>
                  )}
                {evidence}
                <div className="buttons footer-actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      go(screen === "update" ? "assessment" : "situation")
                    }
                  >
                    Back
                  </button>
                  <button className="primary" onClick={review}>
                    Review my case
                  </button>
                </div>
              </>
            )}
            {screen === "facts" && (
              <>
                <section className="panel">
                  <h2>User statements</h2>
                  <p className="fine">
                    These are your entries, not independently verified facts.
                  </p>
                  {intake}
                  <h3>Itemised deductions</h3>
                  {c.claims.map((claim, i) => (
                    <div className="claim-row" key={claim.id}>
                      <Field label="Deduction">
                        <input
                          value={claim.label}
                          onChange={(e) =>
                            edit({
                              claims: c.claims.map((v, j) =>
                                j === i ? { ...v, label: e.target.value } : v
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label="Amount (€)">
                        <input
                          type="number"
                          min="0"
                          step=".01"
                          value={claim.amount}
                          onChange={(e) =>
                            edit({
                              claims: c.claims.map((v, j) =>
                                j === i
                                  ? { ...v, amount: Number(e.target.value) }
                                  : v
                              ),
                            })
                          }
                        />
                      </Field>
                      <button
                        className="text-button"
                        onClick={() =>
                          edit({ claims: c.claims.filter((_, j) => j !== i) })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    className="secondary"
                    onClick={() =>
                      edit({
                        claims: [
                          ...c.claims,
                          { id: crypto.randomUUID(), label: "", amount: 0 },
                        ],
                      })
                    }
                  >
                    Add deduction
                  </button>
                </section>
                <section className="panel">
                  <h2>Documents to interpret</h2>
                  <p className="fine">Availability is your statement. Only supplied files are interpreted. Extracted claims remain candidates; invoice face values are checked separately from liability.</p>
                  <div className="evidence-summary">
                    {c.evidence.map((e) => (
                      <div key={e.id}>
                        <span>{e.type}</span>
                        <strong>{e.status}</strong>
                      </div>
                    ))}
                  </div>
                  <button
                    className="secondary"
                    onClick={() => go(result ? "update" : "evidence")}
                  >
                    Edit evidence availability
                  </button>
                </section>
                <div className="buttons footer-actions">
                  <button className="primary" disabled={busy} onClick={() => run()}>
                    {busy
                      ? "Reviewing evidence and sources…"
                      : result
                      ? "Reassess my position"
                      : "Assess my position"}
                  </button>
                </div>
              </>
            )}
            {screen === "assessment" && verified && result && (
              <VerifiedAssessment value={verified} previous={previous} busy={busy} showAddLandlord={c.demo && !c.evidence.some(e => e.id === "6" && e.status === "present")} onAddLandlord={() => { const updated = injectLandlord(c); setCase(updated); void run(updated); }} onUpdate={() => go("update")} onAction={() => go("action")} />
            )}
            {screen === "action" && result && (
              <div className="action-layout">
                <section className="panel">
                  <h2>Your next step</h2><p>{result.action.description}</p>
                  {result.action.checklist.map(item => <label className="check" key={item}><input type="checkbox" />{item}</label>)}
                  <button className="primary" onClick={() => setDraft(`Hello,\n\nRegarding the deposit, I would like to clarify: ${result.action.description}.\n\nPlease provide the relevant supporting documents.\n\nThank you.`)}>Prepare a request</button>
                  <button className="text-button" onClick={() => go("assessment")}>Back to assessment</button>
                </section>
                <section className="panel"><h2>A request you can review</h2>
                  {draft ? <Field label="Edit before copying"><textarea rows={10} value={draft} onChange={e => setDraft(e.target.value)} /></Field> : <p>Prepare a message you can edit and copy. Nothing is sent automatically.</p>}
                  <h3>Escalation</h3><p>{result.action.escalation}</p>
                </section>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>depositcheck</span>
        <span>
          Local prototype · Assessments saved on this computer
        </span>
      </footer>
    </div>
  );
}
export default App;
