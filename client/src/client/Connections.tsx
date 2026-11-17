import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Summary } from '../api';
import { useDiscovery } from './ProjectRoutes';
import { ChapterMap, SaveIndicator } from './ModulePage';
import type { SaveStatus } from './useAutosave';

// Section 9: one summary for the customer company and one per priority persona, so the client can see how everything connects.
export function ConnectionsPage() {
  const { d } = useDiscovery();
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [err, setErr] = useState('');
  const h1 = useRef<HTMLHeadingElement>(null);
  const load = () => api<Summary[]>(`/api/projects/${d.project.id}/connections`).then(setSummaries).catch((x) => setErr((x as Error).message));
  useEffect(() => { load(); h1.current?.focus(); }, [d.project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="layout">
      <aside><ChapterMap current="connections" /></aside>
      <main id="main">
        <p className="eyebrow">Before you submit</p>
        <h1 ref={h1} tabIndex={-1}>Check the connection</h1>
        <p className="lede">Here is how your answers fit together. Each summary links a goal and a problem to what you offer, the plan, and the result. Correct anything that is off, or mark it to talk through with Rishari.</p>
        {err && <p className="notice" role="alert">{err}</p>}
        {!summaries && !err && <p className="muted">Loading...</p>}
        {summaries?.map((s) => <SummaryCard key={s.personaId ?? 'company'} s={s} projectId={d.project.id} editable onSaved={load} />)}
        <div className="nav-row">
          <Link className="button secondary" to={`/p/${d.project.id}/m/${d.modules[d.modules.length - 1].key}/0`}>Back</Link>
          <Link className="button" to={`/p/${d.project.id}/review`}>Continue to check and submit</Link>
        </div>
      </main>
    </div>
  );
}

const Val = ({ v }: { v: string | null }) => (v ? <>{v}</> : <span className="muted">Not provided</span>);

export function SummaryCard({ s, projectId, editable, onSaved }: { s: Summary; projectId: string; editable?: boolean; onSaved?: () => void }) {
  const company = s.scope === 'company';
  const editLink = (key: string) => `/p/${projectId}/m/${key}/0`;
  return (
    <section className="card" aria-labelledby={`sum-${s.personaId ?? 'c'}`}>
      <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>{company ? 'Customer company' : 'Persona'}</p>
      <h2 id={`sum-${s.personaId ?? 'c'}`} style={{ marginTop: 0 }}>{s.title}</h2>
      {s.subtitle && <p className="small muted">{s.subtitle}</p>}
      <dl className="summary-grid">
        <dt>Goal</dt><dd><Val v={s.goal} /></dd>
        <dt>Problem</dt><dd><Val v={s.problem} />{s.problemDetail && <div className="small muted">{s.problemDetail}</div>}</dd>
        <dt>{company ? 'What addresses it' : 'What helps them'}</dt>
        <dd>{s.links.length ? s.links.map((l) => (
          <div key={l.id} style={{ marginBottom: '0.5rem' }}>
            <strong>{l.offerName ?? l.fitLabel}</strong>{l.offerName && <span className={`tag ${l.planned ? 'warn' : ''}`}>{l.fitLabel}</span>}
            {l.capability && <div className="small">{l.capability}</div>}
            {l.howItHelps && <div className="small">How: {l.howItHelps}</div>}
            {l.benefit && <div className="small">Intended benefit: {l.benefit}</div>}
            {l.outOfScope && <div className="small muted">Outside its scope: {l.outOfScope}</div>}
          </div>
        )) : <span className="muted">Not connected yet</span>}</dd>
        {s.plan.map((p) => <PlanRow key={p.label} label={p.label} v={p.value} />)}
        {s.success.map((p) => <PlanRow key={p.label} label={p.label} v={p.value} note={p.evidence} />)}
        {s.consequences.map((p) => <PlanRow key={p.label} label={p.label} v={p.value} note={p.evidence} />)}
      </dl>
      {(s.missing.length > 0 || s.uncertain.length > 0) && (
        <div className="card" style={{ background: 'var(--grey)', border: 0, marginTop: '1rem' }}>
          {s.missing.length > 0 && <p className="small" style={{ marginBottom: '0.3rem' }}><strong>Missing:</strong> {s.missing.join(', ')}</p>}
          {s.uncertain.length > 0 && <p className="small" style={{ margin: 0 }}><strong>Not certain yet:</strong> {s.uncertain.join('; ')}</p>}
          {editable && <p className="small" style={{ margin: '0.4rem 0 0' }}>It's fine to leave something unknown. You can <Link to={editLink(company ? 'customer_company' : 'problems')}>go back and add it</Link>, or mark this for discussion.</p>}
        </div>
      )}
      {editable ? <ReviewControls s={s} onSaved={onSaved} /> : s.review && (s.review.marked_for_discussion || s.review.correction) && (
        <p className="small" style={{ marginTop: '0.75rem' }}>{s.review.marked_for_discussion && <span className="tag warn">Marked for discussion</span>} {s.review.correction && <>Client correction: {s.review.correction}</>}</p>
      )}
    </section>
  );
}
const PlanRow = ({ label, v, note }: { label: string; v: string | null; note?: string | null }) => (
  <><dt>{label}</dt><dd><Val v={v} />{v && note && <span className="tag">{note}</span>}</dd></>
);

function ReviewControls({ s, onSaved }: { s: Summary; onSaved?: () => void }) {
  const { d } = useDiscovery();
  const [marked, setMarked] = useState(s.review?.marked_for_discussion ?? false);
  const [text, setText] = useState(s.review?.correction ?? '');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [err, setErr] = useState('');
  const id = `cr-${s.personaId ?? 'company'}`;
  const save = async (m: boolean, t: string) => {
    setStatus('saving');
    try { await api(`/api/projects/${d.project.id}/connection-review`, { method: 'PUT', json: { personaId: s.personaId, markedForDiscussion: m, correction: t || null } }); setStatus('saved'); setErr(''); onSaved?.(); }
    catch (x) { setStatus('failed'); setErr((x as Error).message); }
  };
  return (
    <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: '1rem', marginTop: '1rem' }}>
      <button type="button" className="quiet" aria-pressed={marked} onClick={() => { setMarked(!marked); save(!marked, text); }}>{marked ? 'Marked for discussion' : 'Mark for discussion'}</button>
      <div className="field" style={{ marginTop: '1rem', marginBottom: 0 }}>
        <label htmlFor={id}>Does this connect the right way? Tell us what to correct. (optional)</label>
        <textarea id={id} rows={2} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== (s.review?.correction ?? '')) save(marked, text); }} />
      </div>
      <SaveIndicator status={status} error={err} />
    </div>
  );
}
