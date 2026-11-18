import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Summary } from '../api';
import { useDiscovery } from './ProjectRoutes';
import { ChapterMap, ProgressStrip, SaveIndicator } from './ModulePage';
import type { SaveStatus } from './useAutosave';
import { Hero } from './Hero';

// Section 9: one summary for the customer company and one per priority persona, so the client can see how everything connects.
export function ConnectionsPage() {
  const { d } = useDiscovery();
  const [summaries, setSummaries] = useState<Summary[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => api<Summary[]>(`/api/projects/${d.project.id}/connections`).then(setSummaries).catch((x) => setErr((x as Error).message));
  useEffect(() => { load(); document.getElementById('hero-h')?.focus(); }, [d.project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
    <Hero eyebrow="Check the connection" line1="Every answer connects." line2="Check the chain.">
      <p>Each summary links a goal and a problem to what you offer and the result you expect. Dashed boxes are gaps. Fill them in, leave them open, or mark them to talk through with Rishari.</p>
    </Hero>
    <div className="mobile-strip"><ProgressStrip current="connections" title="Check the connection" /></div>
    <div className="layout has-strip">
      <aside><ChapterMap current="connections" /></aside>
      <main id="main">
        {err && <p className="notice" role="alert">{err}</p>}
        {!summaries && !err && <p className="muted">Loading...</p>}
        {summaries?.map((s) => <SummaryCard key={s.personaId ?? 'company'} s={s} projectId={d.project.id} editable onSaved={load} />)}
        <div className="nav-row">
          <Link className="button secondary" to={`/p/${d.project.id}/m/${d.modules[d.modules.length - 1].key}/0`}>Back</Link>
          <Link className="button" to={`/p/${d.project.id}/review`}>Continue to check and submit</Link>
        </div>
      </main>
    </div>
    </>
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
      <ConnectionFlow s={s} editHref={editable ? editLink : null} />
      <details className="flow-details">
        <summary className="small">See every detail</summary>
      <dl className="summary-grid" style={{ marginTop: '1rem' }}>
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
      </details>
      {(s.missing.length > 0 || s.uncertain.length > 0) && (
        <div className="card" style={{ background: 'var(--grey)', border: 0, marginTop: '1rem' }}>
          {!editable && s.missing.length > 0 && <p className="small" style={{ marginBottom: '0.3rem' }}><strong>Missing:</strong> {s.missing.join(', ')}</p>}
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
// The chain a strategist reads: goal, problem, what helps, the benefit, how success shows up, and the cost of
// doing nothing. A missing link is drawn with a dashed outline so gaps stand out without any reading.
type Node = { label: string; value: string | null; extra?: React.ReactNode; chapter: string; uncertain?: boolean };
function ConnectionFlow({ s, editHref }: { s: Summary; editHref: ((key: string) => string) | null }) {
  const company = s.scope === 'company';
  const first = (xs: { value: string | null }[]) => xs.find((x) => x.value && x.value !== 'Not applicable')?.value ?? null;
  const benefits = s.links.map((l) => (company ? l.howItHelps : l.benefit)).filter(Boolean).join(' ') || null;
  const unsure = (v: string | null) => !!v && /^(Not sure yet|To discuss with Rishari)$/.test(v);
  const nodes: Node[] = [
    { label: 'Goal', value: s.goal, chapter: company ? 'customer_company' : 'customer_personas' },
    { label: 'Problem', value: s.problem, chapter: company ? 'customer_company' : 'customer_personas' },
    {
      label: company ? 'What addresses it' : 'What helps them',
      value: s.links.length ? s.links.map((l) => l.offerName ?? l.fitLabel).join(', ') : null,
      extra: s.links.length ? <span className="flow-tags">{s.links.map((l) => <span key={l.id} className={`tag ${l.planned ? 'warn' : ''}`}>{l.fitLabel}</span>)}</span> : null,
      chapter: 'solution',
    },
    { label: company ? 'How it helps' : 'Intended benefit', value: benefits, chapter: 'solution' },
    { label: 'What success looks like', value: first(s.success), chapter: 'success' },
    { label: 'If nothing changes', value: first(s.consequences), chapter: 'nothing_changes' },
  ];
  const gaps = nodes.filter((n) => !n.value).length;
  return (
    <>
      <p className="flow-score small">{gaps === 0 ? 'Every link is connected.' : `${6 - gaps} of 6 links connected`}</p>
      <ol className="flow" aria-label={`How ${s.title} connects`}>
        {nodes.map((n) => {
          const state = !n.value ? 'missing' : unsure(n.value) || n.uncertain ? 'unsure' : 'ok';
          return (
            <li key={n.label} className={`flow-node ${state}`}>
              <span className="flow-label">{n.label}</span>
              {state === 'missing'
                ? <span className="flow-value muted">Missing{editHref && <> &middot; <Link to={editHref(n.chapter)}>Add it</Link></>}</span>
                : <span className="flow-value">{n.value}{n.extra}</span>}
            </li>
          );
        })}
      </ol>
    </>
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
        <textarea id={id} rows={2} className="short" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== (s.review?.correction ?? '')) save(marked, text); }} />
      </div>
      <SaveIndicator status={status} error={err} />
    </div>
  );
}
