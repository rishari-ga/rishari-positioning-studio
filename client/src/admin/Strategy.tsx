import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

// ---------------------------------------------------------------- shared

function useRun() {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const run = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label); setMsg('');
    try { await fn(); if (done) setMsg(done); }
    catch (x) { setMsg((x as Error).message); }
    finally { setBusy(''); }
  };
  return { busy, msg, run, setMsg };
}
const Status = ({ busy, msg }: { busy: string; msg: string }) => (
  <p role="status" className="small" style={{ minHeight: '1.2em' }}>{busy ? `${busy} You can leave this page; the result is saved when it finishes.` : msg}</p>
);
// Plain markdown: paragraphs, lists, bold. Rendered as text, never as HTML.
function Md({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((p, i) => (p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : p));
  return <>{blocks.map((b, i) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*] /.test(l))) return <ul key={i} className="squares">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ''))}</li>)}</ul>;
    if (/^#{1,4} /.test(b)) return <h4 key={i} style={{ margin: '0.75rem 0 0.25rem' }}>{inline(b.replace(/^#{1,4} /, ''))}</h4>;
    return <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{inline(b)}</p>;
  })}</>;
}
const EVIDENCE: Record<string, string> = { documented: 'Documented', founder_reported: 'Founder-reported', reviewer_interpretation: 'Reviewer interpretation', hypothesis: 'Hypothesis to test' };

// ---------------------------------------------------------------- AI usage (on Overview)

type Job = { id: string; task: string; status: string; model: string; cost_cents: number | null; created_at: string; prompt_key: string; prompt_version: number; source_version: number | null; error: string | null; quality_issues: { detail: string }[] };
type AiOverview = { enabled: boolean; intakeModel: string; strategyModel: string; dataUseReviewed: boolean; fictional: boolean; usage: { projectCents: number; projectCapCents: number; totalCents: number; totalCapCents: number }; jobs: Job[] };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function AiUsage({ pid }: { pid: string }) {
  const [o, setO] = useState<AiOverview | null>(null);
  useEffect(() => { api<AiOverview>(`/api/admin/projects/${pid}/ai`).then(setO).catch(() => setO(null)); }, [pid]);
  if (!o) return null;
  return (
    <section className="card">
      <h2>AI assistance</h2>
      {!o.enabled ? <p className="small">AI features are <strong>off</strong>. Clients won't see follow-ups or summaries, and review and strategy tools are unavailable. Answers are unaffected.</p>
        : !o.fictional && !o.dataUseReviewed ? <p className="small notice">AI is on, but this real client project won't use it until the <Link to="/admin/data-use">data-use page</Link> is marked reviewed.</p>
        : <p className="small">AI is on. Intake tasks use <code>{o.intakeModel}</code>; strategy tasks use <code>{o.strategyModel}</code>.</p>}
      <p className="small">This month: {usd(o.usage.projectCents)} of {usd(o.usage.projectCapCents)} for this project · {usd(o.usage.totalCents)} of {usd(o.usage.totalCapCents)} for the studio. Costs are estimates from token counts.</p>
      {o.jobs.length > 0 && (
        <details>
          <summary className="small">Recent AI jobs ({o.jobs.length})</summary>
          <table className="small" style={{ marginTop: '0.5rem' }}>
            <thead><tr><th>When</th><th>Task</th><th>Status</th><th>Model</th><th>Prompt</th><th>Source</th><th>Cost</th></tr></thead>
            <tbody>{o.jobs.map((j) => (
              <tr key={j.id}>
                <td>{new Date(j.created_at).toLocaleString()}</td><td>{j.task}</td>
                <td>{j.status}{j.quality_issues?.length ? ` (${j.quality_issues.length} writing note${j.quality_issues.length === 1 ? '' : 's'})` : ''}{j.error ? `: ${j.error}` : ''}</td>
                <td>{j.model}</td><td>{j.prompt_key} v{j.prompt_version}</td><td>{j.source_version ? `v${j.source_version}` : '-'}</td><td>{j.cost_cents != null ? usd(j.cost_cents) : '-'}</td>
              </tr>
            ))}</tbody>
          </table>
        </details>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Briefing

type Briefing = {
  businessSnapshot: string; offers: { name: string; note: string }[]; audience: string; usefulLanguage: { quote: string; questionKey: string }[];
  evidence: string; limitations: string; contradictions: string[]; openDecisions: string[]; priorities: { title: string; why: string; questionKeys: string[] }[];
};
type BriefingRow = { id: string; content: Briefing; created_at: string; updated_at: string; edited_by: string | null; source_version: number; latest_version: number };

export function BriefingTab() {
  const { pid } = useParams();
  const [b, setB] = useState<BriefingRow | null | undefined>(undefined);
  const [draft, setDraft] = useState<Briefing | null>(null);
  const { busy, msg, run, setMsg } = useRun();
  const load = useCallback(() => api<BriefingRow | null>(`/api/admin/projects/${pid}/briefing`).then((r) => { setB(r); setDraft(r?.content ?? null); }), [pid]);
  useEffect(() => { load(); }, [load]);
  if (b === undefined) return <p className="muted">Loading...</p>;
  const save = (c: Briefing) => run('Saving...', () => api(`/api/admin/projects/${pid}/briefing/${b!.id}`, { method: 'PUT', json: { content: c } }).then(load), 'Saved.');
  const move = (i: number, d: -1 | 1) => { if (!draft) return; const p = [...draft.priorities]; const j = i + d; if (j < 0 || j >= p.length) return; [p[i], p[j]] = [p[j], p[i]]; const next = { ...draft, priorities: p }; setDraft(next); save(next); };
  const text = (k: 'businessSnapshot' | 'audience' | 'evidence' | 'limitations', label: string) => (
    <div className="field">
      <label htmlFor={`br-${k}`}>{label}</label>
      <textarea id={`br-${k}`} rows={3} value={draft![k]} onChange={(e) => setDraft({ ...draft!, [k]: e.target.value })} onBlur={() => { if (draft![k] !== b!.content[k]) save(draft!); }} />
    </div>
  );
  const list = (k: 'contradictions' | 'openDecisions', label: string) => (
    <div className="field">
      <label htmlFor={`br-${k}`}>{label} <span className="small muted">(one per line)</span></label>
      <textarea id={`br-${k}`} rows={3} value={draft![k].join('\n')} onChange={(e) => setDraft({ ...draft!, [k]: e.target.value.split('\n') })}
        onBlur={() => { const clean = { ...draft!, [k]: draft![k].map((x) => x.trim()).filter(Boolean) }; setDraft(clean); save(clean); }} />
    </div>
  );
  return (
    <>
      <p className="muted small">An internal briefing for your call. The client never sees it. It's prepared by an AI-assisted tool from the latest submitted answers, open flags, and your notes. Edit anything, and reorder the priorities.</p>
      <p><button disabled={!!busy} onClick={() => { setMsg(''); run('Preparing the briefing (under a minute)...', () => api(`/api/admin/projects/${pid}/briefing`, { method: 'POST' }).then(load), 'Briefing ready.'); }}>{b ? 'Prepare a fresh briefing' : 'Prepare briefing'}</button></p>
      <Status busy={busy} msg={msg} />
      {!b || !draft ? <p className="muted">No briefing yet.</p> : (
        <>
          <p className="small muted">From submitted version v{b.source_version}{b.latest_version > b.source_version ? <strong> · The client has submitted a newer version (v{b.latest_version}). Prepare a fresh briefing.</strong> : null}{b.edited_by ? ' · Edited by Rishari' : ''}</p>
          <section className="card">
            <h2>Priority discussion items</h2>
            <ol>{draft.priorities.map((p, i) => (
              <li key={i} style={{ marginBottom: '0.75rem' }}>
                <input type="text" aria-label={`Priority ${i + 1} title`} value={p.title} onChange={(e) => { const x = [...draft.priorities]; x[i] = { ...p, title: e.target.value }; setDraft({ ...draft, priorities: x }); }} onBlur={() => save(draft)} />
                <textarea aria-label={`Priority ${i + 1} reason`} rows={2} value={p.why} onChange={(e) => { const x = [...draft.priorities]; x[i] = { ...p, why: e.target.value }; setDraft({ ...draft, priorities: x }); }} onBlur={() => save(draft)} style={{ marginTop: '0.3rem' }} />
                <div className="small">
                  {p.questionKeys.length > 0 && <span className="muted">Sources: {p.questionKeys.join(', ')} · </span>}
                  <button className="link" onClick={() => move(i, -1)} disabled={i === 0}>Move up</button> · <button className="link" onClick={() => move(i, 1)} disabled={i === draft.priorities.length - 1}>Move down</button> · <button className="link" onClick={() => { const next = { ...draft, priorities: draft.priorities.filter((_, j) => j !== i) }; setDraft(next); save(next); }}>Remove</button>
                </div>
              </li>
            ))}</ol>
          </section>
          <section className="card">
            <h2>Briefing</h2>
            {text('businessSnapshot', 'Business snapshot')}
            <p style={{ fontWeight: 600, marginBottom: '0.3rem' }}>In-scope offers</p>
            <ul className="squares">{draft.offers.map((o, i) => <li key={i}><strong>{o.name}:</strong> {o.note}</li>)}</ul>
            {text('audience', 'Audience and buying roles')}
            <p style={{ fontWeight: 600, marginBottom: '0.3rem' }}>Useful exact language</p>
            {draft.usefulLanguage.length ? <ul className="squares">{draft.usefulLanguage.map((u, i) => <li key={i}>"{u.quote}" <span className="small muted">({u.questionKey})</span></li>)}</ul> : <p className="small muted">None found. Only words that appear exactly in the client's answers are kept.</p>}
            {text('evidence', 'Evidence')}
            {text('limitations', 'Limitations')}
            {list('contradictions', 'Contradictions')}
            {list('openDecisions', 'Open decisions')}
            <p className="small"><Link to={`/admin/p/${pid}/answers`}>Open the original answers</Link></p>
          </section>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Strategy

type Option = {
  name: string; summary: string; primaryCustomer: string; problemFraming: string; alternative: string; differentiation: string;
  valueProposition: string; whyItCouldWork: string; risks: string; evidenceStrength: string; sourceRefs: string[]; unresolvedDecisions?: string[];
};
type OptionRow = { id: string; content: Option; edited_content: Option | null; chosen: boolean; batch: number; source_version: number };
type Section = { id: string; key: string; content: { title: string; body: string; claims: { text: string; evidenceStatus: string; sourceRefs: string[] }[] }; locked: boolean; model: string | null; review: { severity: string; comment: string }[]; edited: boolean };
type StrategyState = {
  sourceApproved: { version: number } | null; options: OptionRow[]; directionCurrent: boolean;
  direction: { option_id: string; stale: boolean; created_at: string; actor_email: string } | null;
  version: { id: string; version: number; status: string; created_at: string; source_version: number } | null; sections: Section[]; versions: { version: number; created_at: string }[];
};
const FIELDS: [keyof Option, string][] = [
  ['summary', 'The bet'], ['primaryCustomer', 'Primary customer'], ['problemFraming', 'Problem framing'], ['alternative', 'What they do instead'],
  ['differentiation', 'Why this company'], ['valueProposition', 'Value proposition'], ['whyItCouldWork', 'Why it could work'], ['risks', 'Risks'],
];

export function StrategyTab() {
  const { pid } = useParams();
  const [st, setSt] = useState<StrategyState | null>(null);
  const { busy, msg, run } = useRun();
  const load = useCallback(() => api<StrategyState>(`/api/admin/projects/${pid}/strategy`).then(setSt), [pid]);
  useEffect(() => { load(); }, [load]);
  if (!st) return <p className="muted">Loading...</p>;
  const latestBatch = Math.max(0, ...st.options.map((o) => o.batch));
  const current = st.options.filter((o) => o.batch === latestBatch);
  const chosen = st.options.find((o) => o.id === st.direction?.option_id);
  return (
    <>
      <p className="muted small">Strategy follows four steps: approved source, positioning options, your chosen direction, then the framework draft. Every generation is a button you press. Nothing is shared with the client from here.</p>
      <ol className="steps small">
        <li className={st.sourceApproved ? 'done' : ''}>Source approved {st.sourceApproved ? `(v${st.sourceApproved.version})` : <>: <Link to={`/admin/p/${pid}/approval`}>approve it first</Link></>}</li>
        <li className={current.length ? 'done' : ''}>Positioning options</li>
        <li className={st.directionCurrent ? 'done' : ''}>Direction approved{st.direction?.stale || (st.direction && !st.directionCurrent) ? ' (out of date)' : ''}</li>
        <li className={st.version ? 'done' : ''}>Framework drafted{st.version ? ` (v${st.version.version})` : ''}</li>
      </ol>
      <Status busy={busy} msg={msg} />

      <section className="card">
        <h2>1. Positioning options</h2>
        <p className="small muted">Two or three distinct directions, drafted from the approved source only.</p>
        <button disabled={!st.sourceApproved || !!busy} onClick={() => run('Developing options (about 2 minutes)...', () => api(`/api/admin/projects/${pid}/strategy/options`, { method: 'POST' }).then(load), 'Options ready.')}>{current.length ? 'Develop new options' : 'Develop options'}</button>
        {current[0]?.content.unresolvedDecisions?.length ? (
          <div className="card" style={{ background: 'var(--grey)', border: 0, marginTop: '1rem' }}>
            <p className="small" style={{ fontWeight: 600, marginBottom: '0.3rem' }}>Unresolved decisions</p>
            <ul className="squares small">{current[0].content.unresolvedDecisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </div>
        ) : null}
        {st.directionCurrent && chosen && current.some((o) => o.id === chosen.id) ? (
          <>
            <OptionCard o={chosen} chosenId={chosen.id} sourceVersion={st.sourceApproved?.version ?? null} onApproved={load} />
            <details className="card" style={{ background: 'var(--grey)', border: 0 }}>
              <summary className="small">Other options ({current.length - 1})</summary>
              <div style={{ marginTop: '1rem' }}>{current.filter((o) => o.id !== chosen.id).map((o) => <OptionCard key={o.id} o={o} chosenId={chosen.id} sourceVersion={st.sourceApproved?.version ?? null} onApproved={load} />)}</div>
            </details>
          </>
        ) : current.map((o) => <OptionCard key={o.id} o={o} chosenId={st.direction?.option_id ?? null} sourceVersion={st.sourceApproved?.version ?? null} onApproved={load} />)}
      </section>

      <section className="card">
        <h2>2. Framework</h2>
        {chosen && <p className="small">Direction: <strong>{(chosen.edited_content ?? chosen.content).name}</strong>, approved by {st.direction!.actor_email} on {new Date(st.direction!.created_at).toLocaleDateString()}{!st.directionCurrent && <strong> · Out of date: choose a direction again.</strong>}</p>}
        <p>
          <button disabled={!st.directionCurrent || !!busy} onClick={() => run('Drafting the framework: three passes, then a review (about 10 minutes)...', () => api(`/api/admin/projects/${pid}/strategy/draft`, { method: 'POST' }).then(load), 'Draft ready.')}>{st.version ? 'Draft a new version' : 'Draft framework'}</button>{' '}
          {st.version && <button className="secondary" disabled={!st.directionCurrent || !!busy} onClick={() => run('Reviewing the draft (about 1 minute)...', () => api(`/api/admin/projects/${pid}/strategy/check`, { method: 'POST' }).then(load), 'Review done.')}>Re-run consistency review</button>}
        </p>
        {st.version && <p className="small muted">Version {st.version.version} from source v{st.version.source_version}, {new Date(st.version.created_at).toLocaleString()}. Locked sections are kept as-is when you draft a new version. Draft, not shared.</p>}
      </section>
      {st.sections.length > 0 && (
        <div className="doc-layout">
          <nav className="doc-toc" aria-label="Framework sections">
            <p className="side-label">Framework v{st.version?.version}</p>
            <ol>
              {st.sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#sec-${s.key}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${s.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                    <span className="toc-num">{i + 1}</span><span className="toc-title">{s.content.title}</span>
                    {s.review.length > 0 && <span className="toc-flag" title={`${s.review.length} review note${s.review.length === 1 ? '' : 's'}`} aria-label="Has review notes" />}
                    {s.locked && <span className="toc-lock" aria-label="Locked">Locked</span>}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="doc">
            <header className="doc-head">
              <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>Draft &middot; not shared</p>
              <h2 style={{ margin: 0 }}>Positioning and messaging framework</h2>
              <p className="small muted" style={{ margin: '0.4rem 0 0' }}>Version {st.version?.version}, from approved source v{st.version?.source_version}{chosen ? <> &middot; Direction: {(chosen.edited_content ?? chosen.content).name}</> : null}</p>
            </header>
            {st.sections.map((s, i) => <SectionCard key={s.id} pid={pid!} s={s} n={i + 1} canRevise={st.directionCurrent} onChange={load} />)}
          </article>
        </div>
      )}
    </>
  );
}

function OptionCard({ o, chosenId, sourceVersion, onApproved }: { o: OptionRow; chosenId: string | null; sourceVersion: number | null; onApproved: () => void }) {
  const { pid } = useParams();
  const base = o.edited_content ?? o.content;
  const [edit, setEdit] = useState<Option | null>(null);
  const [err, setErr] = useState('');
  const isChosen = chosenId === o.id;
  return (
    <article className="card" style={isChosen ? { borderColor: '#00ccff' } : undefined}>
      <h3 style={{ marginTop: 0 }}>{base.name}{isChosen && <span className="tag active">Approved direction</span>}<span className="tag">{EVIDENCE[base.evidenceStrength] ?? base.evidenceStrength}</span></h3>
      {!edit ? (
        <>
          <dl className="summary-grid">{FIELDS.map(([k, label]) => <div key={k} style={{ display: 'contents' }}><dt>{label}</dt><dd>{String(base[k] ?? '')}</dd></div>)}</dl>
          {base.sourceRefs?.length > 0 && <p className="small muted">Sources: {base.sourceRefs.join(', ')}</p>}
          <button className="secondary" disabled={o.source_version !== sourceVersion} onClick={() => setEdit({ ...base })}>{isChosen ? 'Edit and re-approve' : 'Choose this direction...'}</button>
          {o.source_version !== sourceVersion && <p className="small muted">From an older source version.</p>}
        </>
      ) : (
        <form onSubmit={async (e) => {
          e.preventDefault(); setErr('');
          const { unresolvedDecisions: _u, ...edited } = edit; void _u;
          try { await api(`/api/admin/projects/${pid}/strategy/direction`, { method: 'POST', json: { optionId: o.id, edited } }); setEdit(null); onApproved(); }
          catch (x) { setErr((x as Error).message); }
        }}>
          <div className="field"><label htmlFor={`on-${o.id}`}>Name</label><input id={`on-${o.id}`} type="text" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          {FIELDS.map(([k, label]) => (
            <div className="field" key={k}><label htmlFor={`o-${o.id}-${k}`}>{label}</label>
              <textarea id={`o-${o.id}-${k}`} rows={2} value={String(edit[k] ?? '')} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></div>
          ))}
          <p className="small">Approving records this exact wording as the direction for source v{sourceVersion}. The framework will follow it.</p>
          {err && <p className="notice" role="alert">{err}</p>}
          <button type="submit">Approve this direction</button>{' '}<button type="button" className="secondary" onClick={() => setEdit(null)}>Cancel</button>
        </form>
      )}
    </article>
  );
}

function SectionCard({ pid, s, n, canRevise, onChange }: { pid: string; s: Section; n: number; canRevise: boolean; onChange: () => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'revise'>('view');
  const [body, setBody] = useState(s.content.body);
  const [instruction, setInstruction] = useState('');
  const { busy, msg, run } = useRun();
  useEffect(() => { setBody(s.content.body); }, [s.content.body]);
  const put = (json: object) => api(`/api/admin/projects/${pid}/strategy/sections/${s.id}`, { method: 'PUT', json });
  return (
    <section className={`doc-section${s.locked ? ' locked' : ''}`} id={`sec-${s.key}`} aria-labelledby={`h-${s.key}`}>
      <div className="doc-section-head">
        <h3 id={`h-${s.key}`}><span className="doc-num">{n}</span>{s.content.title}</h3>
        <div className="doc-tools small">
          {s.locked && <span className="tag">Locked</span>}{s.edited && <span className="tag">Edited</span>}
          {mode === 'view' && <>
            <button className="link" disabled={s.locked} onClick={() => setMode('edit')}>Edit</button>
            <button className="link" disabled={s.locked || !canRevise} onClick={() => setMode('revise')}>Regenerate</button>
            <button className="link" onClick={() => run('', () => put({ locked: !s.locked }).then(onChange))}>{s.locked ? 'Unlock' : 'Lock'}</button>
          </>}
        </div>
      </div>
      {s.review.length > 0 && (
        <aside className="review-note">
          <p className="review-label">Review note{s.review.length === 1 ? '' : 's'}</p>
          {s.review.map((r, i) => <p key={i}><span className={`sev sev-${r.severity}`}>{r.severity}</span> {r.comment}</p>)}
        </aside>
      )}
      {mode === 'edit' ? (
        <>
          <label className="sr-only" htmlFor={`sb-${s.id}`}>Section text</label>
          <textarea id={`sb-${s.id}`} rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
          <p style={{ marginTop: '0.75rem' }}><button onClick={() => run('Saving...', () => put({ body }).then(() => { setMode('view'); onChange(); }))}>Save</button>{' '}<button className="secondary" onClick={() => { setBody(s.content.body); setMode('view'); }}>Cancel</button></p>
        </>
      ) : <div className="doc-body"><Md text={s.content.body} /></div>}
      {mode === 'revise' && (
        <div className="field">
          <label htmlFor={`ri-${s.id}`}>What should change?</label>
          <textarea id={`ri-${s.id}`} rows={2} className="short" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="For example: lead with the cost of late files, and keep it under 60 words." />
          <p style={{ marginTop: '0.75rem' }}><button disabled={instruction.trim().length < 3 || !!busy} onClick={() => run('Rewriting this section (about 1 minute)...', () => api(`/api/admin/projects/${pid}/strategy/sections/${s.id}/revise`, { method: 'POST', json: { instruction } }).then(() => { setMode('view'); setInstruction(''); onChange(); }))}>Regenerate section</button>{' '}<button className="secondary" onClick={() => setMode('view')}>Cancel</button></p>
        </div>
      )}
      {s.content.claims.length > 0 && (
        <details className="evidence-list">
          <summary className="small">Evidence behind this section ({s.content.claims.length})</summary>
          <ul>{s.content.claims.map((c, i) => (
            <li key={i}><span className={`ev ev-${c.evidenceStatus}`}>{EVIDENCE[c.evidenceStatus] ?? c.evidenceStatus}</span> {c.text}{c.sourceRefs.length ? <span className="muted"> &middot; {c.sourceRefs.join(', ')}</span> : null}</li>
          ))}</ul>
          <p className="small muted" style={{ margin: '0.4rem 0 0' }}>External use is not confirmed for any claim yet.</p>
        </details>
      )}
      {(busy || msg) && <Status busy={busy} msg={msg} />}
    </section>
  );
}
