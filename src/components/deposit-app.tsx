"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  action,
  amountInDispute,
  assess,
  comparables,
  createCase,
  extract,
  injectLandlord,
  money,
  rules,
  validate,
} from "../mocks/case-state";
import type {
  Assessment,
  Case,
  Evidence,
  Party,
  Presence,
} from "../mocks/case-state";
import "./deposit-app.css";

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
  const [result, setResult] = useState<Assessment | null>(null);
  const [previous, setPrevious] = useState<Assessment | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [screen]);
  useEffect(() => () => clearTimeout(timer.current), []);
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
    setCase(createCase(demo));
    setResult(null);
    setPrevious(null);
    setDraft("");
    go("situation");
  };
  const review = () => {
    setCase(extract(c));
    go("facts");
  };
  const run = () => {
    const problems = validate(c);
    if (problems.length) {
      setErrors(problems);
      return;
    }
    setBusy(true);
    timer.current = setTimeout(() => {
      setPrevious(result);
      setResult(assess(c));
      setBusy(false);
      go("assessment");
    }, 450);
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
                No account needed. Files stay in this browser session.
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
                Illustrative assessment. No legal analysis runs in this
                prototype.
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
                        ? `${money(result.disputed)} is in dispute`
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
                        "Correct any detail below. Document extraction is mocked and must be checked.",
                      assessment:
                        "A structured view of your position, with the gaps made visible.",
                      update:
                        "Your previous assessment stays unchanged until you reassess.",
                      action:
                        "Start by asking for the documents behind the deduction.",
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
                  <h2>Evidence-backed facts</h2>
                  <p className="fine">
                    Development mock extraction. Selecting a file does not
                    verify its contents.
                  </p>
                  {c.facts.length ? (
                    c.facts.map((f) => (
                      <Field
                        key={f.id}
                        label={`${f.label} · ${
                          c.evidence.find((e) => e.id === f.evidenceId)?.type
                        }`}
                      >
                        <input
                          value={f.value}
                          onChange={(e) =>
                            edit({
                              facts: c.facts.map((v) =>
                                v.id === f.id
                                  ? { ...v, value: e.target.value }
                                  : v
                              ),
                            })
                          }
                        />
                      </Field>
                    ))
                  ) : (
                    <p>
                      No extracted facts yet. Your evidence remains a checklist
                      until document parsing is implemented.
                    </p>
                  )}
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
                  <button className="primary" disabled={busy} onClick={run}>
                    {busy
                      ? "Preparing mock assessment…"
                      : result
                      ? "Reassess my position"
                      : "Assess my position"}
                  </button>
                </div>
              </>
            )}
            {screen === "assessment" && result && (
              <>
                {c.revision !== result.revision && (
                  <p className="notice">
                    Your case has edits. This assessment shows the last reviewed
                    version.
                    <button className="text-button" onClick={review}>
                      Review and reassess
                    </button>
                  </p>
                )}
                {previous && (
                  <div className="notice" role="status">
                    <strong>
                      {previous.position !== result.position
                        ? "New evidence changed the assessment"
                        : "Reassessment complete"}
                    </strong>
                    <p>
                      {previous.position} → {result.position}
                    </p>
                  </div>
                )}
                <div className="assessment-layout">
                  <div>
                    <div className="badges">
                      <span
                        className={`badge ${
                          result.position === "Uncertain" ? "amber" : "green"
                        }`}
                      >
                        {result.position}
                      </span>
                      <span className="badge neutral">
                        Confidence: {result.confidence}
                      </span>
                    </div>
                    <p className="fine">
                      {c.demo
                        ? "Scripted demo assessment — not a legal conclusion."
                        : "Placeholder assessment — no analysis has been performed on your case."}
                    </p>
                    <section className="question">
                      <p className="eyebrow">The question that matters</p>
                      <h2>{result.question}</h2>
                    </section>
                    <div className="factor-grid">
                      {[
                        ["What supports your position", result.supports],
                        ["What could support the landlord", result.adverse],
                        ["What is missing", result.missing],
                      ].map(([title, items]) => (
                        <section className="factor" key={title as string}>
                          <h3>{title as string}</h3>
                          <ul>
                            {(items as string[]).length ? (
                              (items as string[]).map((item) => (
                                <li key={item}>{item}</li>
                              ))
                            ) : (
                              <li>
                                {title === "What is missing"
                                  ? "Listed documents are marked present. Their contents still need verification."
                                  : "No factors recorded in this mock."}
                              </li>
                            )}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </div>
                  <aside className="next-card">
                    <p className="eyebrow">Recommended next action</p>
                    <h2>Ask for the evidence.</h2>
                    <p>{result.action.description}</p>
                    <button className="primary" onClick={() => go("action")}>
                      See my next steps
                    </button>
                    <div className="divider" />
                    <small>Escalation</small>
                    <p>Residential Tenancies Board</p>
                  </aside>
                </div>
                <div className="update-banner">
                  <div>
                    <h2>A case can change.</h2>
                    <p>
                      Add new documents, check the facts and reassess your
                      position.
                    </p>
                  </div>
                  <button className="secondary" onClick={() => go("update")}>
                    Add new evidence
                  </button>
                </div>
                <h2 className="section-title">Rules that matter</h2>
                <p className="mock-label">
                  DEVELOPMENT MOCK DATA — illustrative rules, sources not yet
                  connected
                </p>
                <div className="source-grid">
                  {rules.map((rule) => (
                    <article className="source" key={rule.id}>
                      <h3>{rule.title}</h3>
                      <p>{rule.description}</p>
                      <small>{rule.sourceLabel}</small>
                      <p className="fine">Source URL: pending</p>
                    </article>
                  ))}
                </div>
                <h2 className="section-title">Similar RTB cases</h2>
                <div className="source-grid">
                  {comparables.map((item) => (
                    <article className="source" key={item.id}>
                      <p className="mock-label">DEVELOPMENT MOCK DATA</p>
                      <small>{item.id} · fictional example</small>
                      <h3>{item.name}</h3>
                      <p>{item.similarity}</p>
                      <strong>{item.outcome}</strong>
                      <p>{item.reason}</p>
                      <small>
                        Source URL: placeholder — no published case linked
                      </small>
                    </article>
                  ))}
                </div>
              </>
            )}
            {screen === "action" && (
              <div className="action-layout">
                <section className="panel">
                  <h2>Before escalating, ask for:</h2>
                  {action.checklist.map((item) => (
                    <label className="check" key={item}>
                      <input type="checkbox" />
                      {item}
                    </label>
                  ))}
                  <button
                    className="primary"
                    onClick={() =>
                      setDraft(
                        `Hello,\n\nRegarding the ${money(
                          amountInDispute(c)
                        )} retained from my deposit, please provide an itemised breakdown of deductions, supporting photographs, invoices or estimates, and the move-in condition evidence.\n\nPlease also return any undisputed deposit and clarify the reason for each deduction.\n\nThank you.`
                      )
                    }
                  >
                    Prepare evidence request
                  </button>
                  <button
                    className="text-button"
                    onClick={() => go("assessment")}
                  >
                    Back to assessment
                  </button>
                </section>
                <section className="panel">
                  <h2>
                    {draft
                      ? "Your evidence request"
                      : "A request you can review"}
                  </h2>
                  {draft ? (
                    <>
                      <Field label="Edit before copying">
                        <textarea
                          rows={12}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                        />
                      </Field>
                      <p className="fine">
                        Select and copy the text above. Nothing is sent
                        automatically.
                      </p>
                    </>
                  ) : (
                    <p>
                      Prepare an editable message asking for the missing
                      documents.
                    </p>
                  )}
                  <hr />
                  <h3>Escalation</h3>
                  <p>{action.escalation}</p>
                </section>
              </div>
            )}
          </>
        )}
      </main>
      <footer className="site-footer">
        <span>depositcheck</span>
        <span>
          Mock UI only · No AI or document parsing · Refresh clears your case
        </span>
      </footer>
    </div>
  );
}
export default App;
