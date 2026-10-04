"use client";
import type { ConsumerResult } from "./../agents/service";

type Props = { value: ConsumerResult; previous: ConsumerResult["assessment"] | null; busy: boolean; showAddLandlord: boolean; onAddLandlord: () => void; onUpdate: () => void; onAction: () => void };
export function VerifiedAssessment({ value, previous, busy, showAddLandlord, onAddLandlord, onUpdate, onAction }: Props) {
  const r = value.assessment;
  const changed = previous && previous.position !== r.position;
  return <>
    {previous && <section className="assessment-change" role="status" aria-live="polite">
      <p className="eyebrow">{changed ? "New evidence changed the assessment" : "Reassessment complete"}</p>
      <div className="change-stages"><div><small>BEFORE</small><strong>{previous.position}</strong><span>Confidence: {previous.confidence}</span></div><div className="change-arrow"><span>New landlord evidence</span><b aria-hidden="true">→</b></div><div><small>AFTER</small><strong>{r.position}</strong><span>Confidence: {r.confidence}</span></div></div>
      <ul>{value.changes.changedFactors.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}</ul>
    </section>}
    <div className="assessment-layout"><div>
      <div className="badges"><span className={`badge ${r.position === "Uncertain" ? "amber" : "green"}`}>{r.position}</span><span className="badge neutral">Confidence: {r.confidence}</span></div>
      <p className="fine">{value.notice}</p>
      <section className="question"><p className="eyebrow">The question that matters</p><h2>{r.question}</h2></section>
      <div className="factor-grid">{[["What supports your position", r.supports], ["What could support the landlord", r.adverse], ["What is missing", r.missing]].map(([title, items]) => <section className="factor" key={title as string}><h3>{title}</h3><ul>{(items as string[]).length ? (items as string[]).slice(0, 4).map((item, i) => <li key={i}>{item}</li>) : <li>No further factors established for this assessment.</li>}</ul></section>)}</div>
    </div><aside className="next-card"><p className="eyebrow">Recommended next action</p><h2>{r.action.description}</h2><button className="primary" disabled={busy} onClick={onAction}>See my next steps</button><div className="divider" /><small>Escalation</small><p>{r.action.escalation}</p></aside></div>
    {showAddLandlord ? <div className="update-banner demo-proof"><div><h2>What if new evidence arrives?</h2><p>Add a €700 painting invoice and landlord damage photographs.</p></div><button className="primary" disabled={busy} onClick={onAddLandlord}>{busy ? "Reassessing evidence…" : "Add landlord evidence"}</button></div> : <div className="update-banner"><div><h2>A case can change.</h2><p>Add documents and reassess against the updated evidence.</p></div><button className="secondary" disabled={busy} onClick={onUpdate}>{busy ? "Reassessing evidence…" : "Add new evidence"}</button></div>}
    <h2 className="section-title">Sources used</h2><p className="fine">Genuine RTB guidance and published reports. Prior cases provide context, not a prediction.</p>
    <div className="source-grid demo-sources">
      {value.rules.map(rule => <article className="source" key={rule.id}><small>Residential Tenancies Board · guidance</small><h3>{rule.title}</h3><p>{rule.section}</p><details><summary>View source passage</summary><blockquote>{rule.text}</blockquote></details><a href={rule.url} target="_blank" rel="noreferrer">Read the original source ↗</a></article>)}
      {value.cases.map(item => <article className="source" key={item.id}><small>Residential Tenancies Board · published report</small><h3>{item.caseId}</h3><p>{item.section}{item.page ? ` · page ${item.page}` : ""}</p><details><summary>View retrieved passage</summary><blockquote>{item.text}</blockquote></details><a href={item.url} target="_blank" rel="noreferrer">Read the original report ↗</a></article>)}
    </div>
    {!value.rules.length && !value.cases.length && <p>No verified public sources are available for this assessment.</p>}
  </>;
}
