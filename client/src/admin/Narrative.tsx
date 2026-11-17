import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Summary } from '../api';
import { SummaryCard } from '../client/Connections';
import { EVIDENCE_OPTIONS } from '@shared/narrative';

type Field = { key: string; label: string; important: boolean; optional: boolean; status: string; reason: string; overridden: boolean; questionKey: string | null; prompt: string | null; value: unknown; evidenceStatus: string | null };
type Scope = { offer: { id: string; name: string; availability: string | null } | null; persona: { id: string; name: string } | null; fields: Field[] };
type Section = { key: string; title: string; scope: 'company' | 'persona' | 'offer'; scopes: Scope[] };
const scopeKey = (sc: Scope) => sc.persona?.id ?? sc.offer?.id ?? 'company';
const ScopeLabel = ({ sc }: { sc: Scope }) => (sc.persona ? <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>Persona: {sc.persona.name}</p> : sc.offer ? <p className="eyebrow" style={{ marginBottom: '0.4rem' }}>{sc.offer.name}{sc.offer.availability === 'planned' ? ' (planned)' : ''}</p> : null);
type Clar = { id: string; question_key: string; offer_id: string | null; persona_id: string | null; note: string | null; status: string; created_at: string };

const STATUS: Record<string, string> = {
  not_asked: 'Not asked', captured: 'Captured', needs_clarification: 'Needs clarification', hypothesis: 'Hypothesis to test', not_applicable: 'Not applicable',
};
const evidence = (v: string | null) => EVIDENCE_OPTIONS.find((o) => o.value === v)?.label ?? null;
const excerpt = (v: unknown) => {
  const t = typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : (x as { text?: string }).text ?? '')).join('; ') : '';
  return t.length > 160 ? `${t.slice(0, 160)}...` : t;
};

// Coverage by narrative element and offer (Section 14). No scores: each field has a plain status.
export function NarrativeTab() {
  const { pid } = useParams();
  const [data, setData] = useState<{ coverage: Section[]; clarifications: Clar[] } | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api<{ coverage: Section[]; clarifications: Clar[] }>(`/api/admin/projects/${pid}/narrative`).then(setData), [pid]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p className="muted">Loading...</p>;
  const open = data.clarifications.filter((c) => c.status === 'open');
  return (
    <>
      <p className="muted small">What the discovery has captured for the customer company, each priority persona, and each focus offer. Missing customer proof is not an error. Ask the client only for what you need; nothing is sent until you share the link yourself.</p>
      {msg && <p className="ok" role="status">{msg}</p>}
      {open.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Open requests to the client ({open.length})</h2>
          <ul className="squares">{open.map((c) => (
            <li key={c.id}>{c.question_key}{c.note ? `: ${c.note}` : ''} <button className="link small" onClick={async () => { await api(`/api/admin/projects/${pid}/clarifications/${c.id}/withdraw`, { method: 'POST' }); load(); }}>Withdraw</button></li>
          ))}</ul>
          <p className="small muted" style={{ marginBottom: 0 }}>The client sees these at the top of their discovery. Let them know there's something to answer.</p>
        </section>
      )}
      {data.coverage.map((sec) => (
        <section key={sec.key} className="card">
          <h2 style={{ marginTop: 0 }}>{sec.title}</h2>
          {sec.scopes.length === 0 && <p className="muted small">No priority personas yet.</p>}
          {sec.scopes.map((sc) => (
            <div key={scopeKey(sc)} style={{ marginBottom: '1rem' }}>
              <ScopeLabel sc={sc} />
              <table>
                <thead><tr><th style={{ width: '24%' }}>Element</th><th style={{ width: '18%' }}>Status</th><th>What we have</th><th style={{ width: '22%' }}>Action</th></tr></thead>
                <tbody>{sc.fields.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}{f.important && <span className="tag">Key</span>}{f.optional && <span className="tag">Optional</span>}</td>
                    <td><strong>{STATUS[f.status]}</strong><div className="small muted">{f.reason}</div></td>
                    <td className="small">{excerpt(f.value) || <span className="muted">Nothing yet.</span>}{f.evidenceStatus && <div><span className="tag">{evidence(f.evidenceStatus)}</span></div>}</td>
                    <td>
                      <label className="sr-only" htmlFor={`ov-${f.key}-${scopeKey(sc)}`}>Set status for {f.label}</label>
                      <select id={`ov-${f.key}-${scopeKey(sc)}`} value={f.overridden ? f.status : ''} style={{ fontSize: '0.85rem', padding: '0.35rem' }} onChange={async (e) => {
                        await api(`/api/admin/projects/${pid}/coverage`, { method: 'PUT', json: { fieldKey: f.key, offerId: sc.offer?.id ?? null, personaId: sc.persona?.id ?? null, status: e.target.value || null } }); load();
                      }}>
                        <option value="">Automatic</option>
                        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      {f.questionKey && f.status !== 'captured' && f.status !== 'not_applicable' && (
                        <button className="link small" style={{ display: 'block', marginTop: '0.4rem' }} onClick={async () => {
                          await api(`/api/admin/projects/${pid}/clarifications`, { method: 'POST', json: { questionKey: f.questionKey, offerId: sc.offer?.id ?? null, personaId: sc.persona?.id ?? null } });
                          setMsg(`Added "${f.label}" to the client's requests.`); load();
                        }}>Ask the client</button>
                      )}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

type Flag = {
  id: string; issue: string; priority: string; source_refs: { questionKey: string; offerId: string | null; prompt: string }[]; noticed: string; suggested_action: string;
  example: string | null; why: string | null; client_question: string | null; decision: string | null; reviewer_note: string | null; offer_name: string | null; persona_name: string | null; check_key: string | null; origin?: 'rule' | 'ai';
};
const DECISIONS: [string, string][] = [['accepted', 'Accept'], ['agenda', 'Add to agenda'], ['clarification_requested', 'Request clarification'], ['assumption', 'Mark as assumption'], ['resolved', 'Resolve'], ['dismissed', 'Dismiss']];

export function FlagsTab() {
  const { pid } = useParams();
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api<Flag[]>(`/api/admin/projects/${pid}/flags`).then(setFlags), [pid]);
  useEffect(() => { load(); }, [load]);
  if (!flags) return <p className="muted">Loading...</p>;
  return (
    <>
      <p className="muted small">Run the checks after the client submits, or any time you want a fresh look. <strong>Rule checks</strong> follow fixed rules and use no AI. <strong>AI review</strong> reads the latest submitted version for contradictions, vague or unsupported claims, and missing links. Both only point to answers worth a closer look; a strategist decides what each one means.</p>
      <p>
        <button onClick={async () => { setMsg('Running rule checks...'); const r = await api<{ found: number; created: number }>(`/api/admin/projects/${pid}/checks`, { method: 'POST' }); setMsg(`Rule checks found ${r.found} item${r.found === 1 ? '' : 's'}; ${r.created} new.`); load(); }}>Run rule checks</button>{' '}
        <button className="secondary" onClick={async () => {
          setMsg('AI review running. This can take up to a minute...');
          try { const r = await api<{ found: number; created: number }>(`/api/admin/projects/${pid}/ai-review`, { method: 'POST' }); setMsg(`AI review found ${r.found} item${r.found === 1 ? '' : 's'}; ${r.created} new.`); load(); }
          catch (x) { setMsg((x as Error).message); }
        }}>Run AI review</button>{' '}
        <span role="status" className="small">{msg}</span>
      </p>
      {flags.length === 0 && <p className="muted">No flags yet.</p>}
      {flags.map((f) => (
        <article key={f.id} className="card" style={f.decision === 'dismissed' || f.decision === 'resolved' ? { opacity: 0.6 } : undefined}>
          <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>{f.origin === 'ai' ? 'AI review · ' : ''}{f.priority} priority{f.persona_name ? ` · Persona: ${f.persona_name}` : ''}{f.offer_name ? ` · ${f.offer_name}` : ''}</p>
          <h2 style={{ marginTop: 0 }}>{f.issue}{f.decision && <span className="tag">{DECISIONS.find((d) => d[0] === f.decision)?.[1] ?? f.decision}</span>}</h2>
          <p><strong>What we noticed.</strong> {f.noticed}</p>
          <p><strong>Suggested action.</strong> {f.suggested_action}</p>
          {f.example && <p><strong>Example.</strong> {f.example}</p>}
          {f.why && <p><strong>Why it matters.</strong> {f.why}</p>}
          {f.client_question && <p><strong>Suggested client question.</strong> "{f.client_question}"</p>}
          {f.source_refs.length > 0 && <p className="small muted"><strong>Sources:</strong> {f.source_refs.map((r) => r.prompt).join(' | ')}</p>}
          {f.reviewer_note && <p className="small"><strong>Reviewer note:</strong> {f.reviewer_note}</p>}
          <div className="alt-actions">
            {DECISIONS.map(([k, label]) => (
              <button key={k} className="quiet" aria-pressed={f.decision === k} onClick={async () => {
                try { await api(`/api/admin/projects/${pid}/flags/${f.id}`, { method: 'PATCH', json: { decision: k } }); setMsg(''); load(); }
                catch (x) { setMsg((x as Error).message); }
              }}>{label}</button>
            ))}
          </div>
        </article>
      ))}
    </>
  );
}

type Basis = {
  snapshot: { id: string; version: number; createdAt: string };
  coverage: Section[];
  connections: Summary[];
  assumptions: { id: string; kind: string; text: string; scopeName: string | null }[];
};
type Approval = { id: string; target_version: string; stale: boolean; created_at: string; actor_email: string; accepted_assumptions: { id: string; text: string }[] };

// Checkpoint C. Unknown fields don't block approval, but every important assumption must be accepted explicitly.
export function SourceApprovalTab() {
  const { pid } = useParams();
  const [data, setData] = useState<{ basis: Basis | null; approvals: Approval[] } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api<{ basis: Basis | null; approvals: Approval[] }>(`/api/admin/projects/${pid}/source-approval`).then((r) => { setData(r); setAccepted(new Set()); }), [pid]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p className="muted">Loading...</p>;
  const { basis, approvals } = data;
  if (!basis) return <p className="muted">The client hasn't submitted discovery yet.</p>;
  const current = approvals.find((a) => !a.stale && a.target_version === String(basis.snapshot.version));
  const all = basis.assumptions.every((a) => accepted.has(a.id));
  return (
    <>
      <p className="muted small">Approving confirms that submitted version {basis.snapshot.version} is the source for strategy work. Drafts will use exactly this version. A newer submission makes this approval stale.</p>
      {current && <p className="ok">Version {basis.snapshot.version} was approved by {current.actor_email} on {new Date(current.created_at).toLocaleString()}.</p>}
      <h2>How it connects</h2>
      <p className="muted small">The same summaries the client checked. Missing and uncertain connections are listed first under open assumptions.</p>
      {basis.connections.map((s) => <SummaryCard key={s.personaId ?? 'company'} s={s} projectId={pid!} />)}
      <SourceBrief pid={pid!} />
      <h2>Coverage</h2>
      {basis.coverage.map((sec) => (
        <section key={sec.key} className="card">
          <h2 style={{ marginTop: 0 }}>{sec.title}</h2>
          {sec.scopes.map((sc) => (
            <div key={scopeKey(sc)}>
              <ScopeLabel sc={sc} />
              {sc.fields.map((f) => (
                <div className="answer-block" key={f.key}>
                  <p className="q">{f.label} <span className="tag">{STATUS[f.status]}</span>{f.evidenceStatus && <span className="tag">{evidence(f.evidenceStatus)}</span>}</p>
                  <p className="a small">{excerpt(f.value) || <span className="muted">{f.reason}</span>}</p>
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Open assumptions ({basis.assumptions.length})</h2>
        {basis.assumptions.length === 0 ? <p className="muted">None. Every key element is captured or marked not applicable.</p> : (
          <>
            <p className="small muted">Accept each one to proceed with it as a stated assumption, or resolve it first (ask the client, or update its flag or coverage).</p>
            {basis.assumptions.map((a) => (
              <label key={a.id} className="choice" style={{ marginBottom: '0.6rem' }}>
                <input type="checkbox" checked={accepted.has(a.id)} onChange={(e) => { const n = new Set(accepted); if (e.target.checked) n.add(a.id); else n.delete(a.id); setAccepted(n); }} />
                <span>{a.scopeName ? <strong>{a.scopeName}: </strong> : null}{a.text}</span>
              </label>
            ))}
          </>
        )}
        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="ap-note">Approval note (optional)</label>
          <textarea id="ap-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {msg && <p className="notice" role="alert">{msg}</p>}
        <button disabled={!all} onClick={async () => {
          try { await api(`/api/admin/projects/${pid}/source-approval`, { method: 'POST', json: { snapshotVersion: basis.snapshot.version, acceptedAssumptions: [...accepted], note: note || null } }); setMsg(''); load(); }
          catch (x) { setMsg((x as Error).message); }
        }}>Approve version {basis.snapshot.version} as the source</button>
      </section>
      {approvals.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Approval history</h2>
          <table><thead><tr><th>Version</th><th>By</th><th>When</th><th>Assumptions accepted</th><th>State</th></tr></thead>
            <tbody>{approvals.map((a) => <tr key={a.id}><td>v{a.target_version}</td><td>{a.actor_email}</td><td>{new Date(a.created_at).toLocaleString()}</td><td>{a.accepted_assumptions.length}</td><td>{a.stale ? 'Stale' : 'Current'}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}

// The connected source brief: what strategy work will use. Built by fixed rules from the approved version; blanks stay blank.
function SourceBrief({ pid }: { pid: string }) {
  const [b, setB] = useState<{ version: number; approved: boolean; markdown: string } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api<{ version: number; approved: boolean; markdown: string }>(`/api/admin/projects/${pid}/source-brief`).then(setB).catch(() => setB(null)); }, [pid]);
  if (!b) return null;
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Connected source brief</h2>
      <p className="small muted">Version {b.version}{b.approved ? ', approved' : ', not approved yet'}. This is the material strategy drafts will start from.</p>
      <button className="secondary" onClick={() => setOpen(!open)}>{open ? 'Hide brief' : 'Show brief'}</button>{' '}
      <button className="secondary" onClick={() => {
        const url = URL.createObjectURL(new Blob([b.markdown], { type: 'text/markdown' }));
        const el = document.createElement('a'); el.href = url; el.download = `source-brief-v${b.version}.md`; el.click(); URL.revokeObjectURL(url);
      }}>Download</button>
      {open && <pre className="brief">{b.markdown}</pre>}
    </section>
  );
}

// Section 9 in admin: the same connected summaries the client sees, read-only, with their corrections.
export function ConnectionsTab() {
  const { pid } = useParams();
  const [s, setS] = useState<Summary[] | null>(null);
  useEffect(() => { api<Summary[]>(`/api/projects/${pid}/connections`).then(setS); }, [pid]);
  if (!s) return <p className="muted">Loading...</p>;
  return (
    <>
      <p className="muted small">One summary for the customer company and one for each priority persona. Client corrections and discussion marks appear at the bottom of each.</p>
      {s.map((x) => <SummaryCard key={x.personaId ?? 'company'} s={x} projectId={pid!} />)}
    </>
  );
}

type Guidance = { key: string; issue: string; action: string; example: string; why: string; client_question: string };

export function GuidanceEditor() {
  const [rows, setRows] = useState<Guidance[] | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => { api<Guidance[]>('/api/admin/guidance').then(setRows); }, []);
  if (!rows) return <p className="page muted">Loading...</p>;
  const set = (i: number, k: keyof Guidance, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <main className="page wide" id="main">
      <p className="eyebrow"><Link to="/admin" style={{ color: 'inherit' }}>All projects</Link></p>
      <h1>Guidance library</h1>
      <p className="muted">The explanations, examples, and client questions that flags use. Edits apply to new flags.</p>
      {rows.map((g, i) => (
        <form key={g.key} className="card" onSubmit={async (e) => {
          e.preventDefault();
          try { await api(`/api/admin/guidance/${g.key}`, { method: 'PUT', json: { issue: g.issue, action: g.action, example: g.example, why: g.why, clientQuestion: g.client_question } }); setMsg({ ...msg, [g.key]: 'Saved.' }); }
          catch (x) { setMsg({ ...msg, [g.key]: (x as Error).message }); }
        }}>
          <p className="eyebrow">{g.key.replaceAll('_', ' ')}</p>
          {(['issue', 'action', 'example', 'why', 'client_question'] as const).map((k) => (
            <div className="field" key={k}>
              <label htmlFor={`g-${g.key}-${k}`}>{{ issue: 'Issue', action: 'Suggested action', example: 'Example', why: 'Why it matters', client_question: 'Suggested client question' }[k]}</label>
              <textarea id={`g-${g.key}-${k}`} rows={k === 'example' ? 3 : 2} value={g[k]} onChange={(e) => set(i, k, e.target.value)} />
            </div>
          ))}
          <button type="submit">Save</button> <span role="status" className="small">{msg[g.key]}</span>
        </form>
      ))}
    </main>
  );
}
