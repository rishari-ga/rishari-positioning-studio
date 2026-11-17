import { useCallback, useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Discovery, Offer } from '../api';
import { ModuleAnswers } from '../client/ReviewPage';
import { NarrativeTab, FlagsTab, SourceApprovalTab, GuidanceEditor, ConnectionsTab } from './Narrative';
import { BriefingTab, StrategyTab, AiUsage } from './Strategy';
import { AdminShell } from './Shell';

export function AdminRoutes() {
  return (
    <AdminShell>
    <Routes>
      <Route index element={<ProjectList />} />
      <Route path="data-use" element={<DataUseEditor />} />
      <Route path="guidance" element={<GuidanceEditor />} />
      <Route path="p/:pid/*" element={<ProjectAdmin />} />
    </Routes>
    </AdminShell>
  );
}

type Row = { id: string; name: string; company_name: string | null; status: string; is_fictional: boolean; client_email: string | null; answer_count: number; submitted_version: number | null; created_at: string; last_active_at: string | null;
  core_total: number; core_answered: number; open_flags: number; stage: string };

const Bar = ({ value }: { value: number }) => <span className="meter-track" aria-hidden="true"><span style={{ width: `${value}%` }} /></span>;

export function Meter({ value, label }: { value: number; label?: string }) {
  return (
    <span className="meter" title={`${value}%`}>
      <span className="meter-track" aria-hidden="true"><span style={{ width: `${value}%` }} /></span>
      <span className="meter-num">{label ?? `${value}%`}</span>
    </span>
  );
}

// "Active now" means the client did something in the last 10 minutes.
const ACTIVE_MS = 10 * 60 * 1000;
export function LastActive({ at }: { at: string | null }) {
  if (!at) return <span className="muted">Not yet</span>;
  const ms = Date.now() - new Date(at).getTime();
  if (ms < ACTIVE_MS) return <span className="tag active">Active now</span>;
  const mins = Math.round(ms / 60000), hrs = Math.round(ms / 3600000), days = Math.round(ms / 86400000);
  return <span title={new Date(at).toLocaleString()}>{mins < 60 ? `${mins} min ago` : hrs < 24 ? `${hrs} hr ago` : `${days} day${days === 1 ? '' : 's'} ago`}</span>;
}

function ProjectList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState({ name: '', companyName: '', isFictional: false });
  const [err, setErr] = useState('');
  const load = useCallback(() => api<Row[]>('/api/admin/projects').then(setRows), []);
  // Refresh every minute so "Active now" stays accurate while this page is open.
  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  return (
    <main className="page wide" id="main">
      <h1 className="admin-title">Every client. Every stage.</h1>
      <p className="muted">Where each project stands, who's active, and what needs you next.</p>
      {!rows ? <p className="muted">Loading...</p> : rows.length === 0 ? <p className="muted">No projects yet. Start one below.</p> : (
        <table>
          <thead><tr><th>Project</th><th>Stage</th><th>Discovery</th><th>Open flags</th><th>Last active</th><th>Client</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><Link className="row-title" to={`/admin/p/${r.id}`}>{r.company_name || r.name}</Link> {r.is_fictional && <span className="fictional">Fictional</span>}</td>
              <td><span className="pill">{r.stage}</span></td>
              <td><Meter value={r.core_total ? Math.round((r.core_answered / r.core_total) * 100) : 0} /></td>
              <td>{r.open_flags ? <span className="count">{r.open_flags}</span> : <span className="muted">0</span>}</td>
              <td><LastActive at={r.last_active_at} /></td>
              <td className="small">{r.client_email ?? <span className="muted">Not invited</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <h2 style={{ marginTop: '2.5rem' }}>New project</h2>
      <form className="card new-project" onSubmit={async (e) => {
        e.preventDefault(); setErr('');
        try { await api('/api/admin/projects', { method: 'POST', json: { name: form.name, companyName: form.companyName || undefined, isFictional: form.isFictional } }); setForm({ name: '', companyName: '', isFictional: false }); load(); }
        catch (x) { setErr((x as Error).message); }
      }}>
        <div className="field"><label htmlFor="np-name">Project name</label><input id="np-name" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="np-co">Client company (optional)</label><input id="np-co" type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
        <div className="np-actions">
          <label className="choice"><input type="checkbox" checked={form.isFictional} onChange={(e) => setForm({ ...form, isFictional: e.target.checked })} /><span>Fictional test project</span></label>
          <button type="submit">Create project</button>
        </div>
        {err && <p className="notice" role="alert" style={{ gridColumn: '1 / -1' }}>{err}</p>}
      </form>
    </main>
  );
}

type Overview = {
  project: { id: string; name: string; company_name: string | null; status: string; is_fictional: boolean };
  client: { email: string; display_name: string | null } | null;
  invitation: { email: string; expires_at: string; accepted_at: string | null } | null;
  acknowledgment: { ack_version: string; created_at: string } | null;
  snapshots: { id: string; version: number; kind: string; created_at: string }[];
};


function ProjectAdmin() {
  const { pid } = useParams();
  const [o, setO] = useState<Overview | null>(null);
  const load = useCallback(() => api<Overview>(`/api/admin/projects/${pid}`).then(setO), [pid]);
  useEffect(() => { load(); }, [load]);
  if (!o) return <p className="page muted">Loading...</p>;
  const base = `/admin/p/${pid}`;
  return (
    <main className="page wide" id="main">
      <h1 className="admin-title">{o.project.company_name || o.project.name} {o.project.is_fictional && <span className="fictional">Fictional</span>}</h1>
      <div className="admin-body">
      <Routes>
        <Route index element={<OverviewTab o={o} reload={load} />} />
        <Route path="answers" element={<AnswersTab />} />
        <Route path="connections" element={<ConnectionsTab />} />
        <Route path="narrative" element={<NarrativeTab />} />
        <Route path="flags" element={<FlagsTab />} />
        <Route path="approval" element={<SourceApprovalTab />} />
        <Route path="briefing" element={<BriefingTab />} />
        <Route path="strategy" element={<StrategyTab />} />
        <Route path="offers" element={<OffersTab />} />
        <Route path="notes" element={<NotesTab />} />
        <Route path="activity" element={<ActivityTab />} />
      </Routes>
      </div>
    </main>
  );
}

function OverviewTab({ o, reload }: { o: Overview; reload: () => void }) {
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [err, setErr] = useState('');
  return (
    <>
      <Dashboard pid={o.project.id} />
      <section className="card">
        <h2>Client</h2>
        {o.client ? <p>{o.client.display_name ? `${o.client.display_name}, ` : ''}{o.client.email}</p> : (
          <>
            {o.invitation && !o.invitation.accepted_at && <p className="small muted">Invitation pending for {o.invitation.email}, expires {new Date(o.invitation.expires_at).toLocaleDateString()}. Creating a new link replaces it.</p>}
            <form onSubmit={async (e) => {
              e.preventDefault(); setErr(''); setLink('');
              try { const r = await api<{ link: string }>(`/api/admin/projects/${o.project.id}/invitations`, { method: 'POST', json: { email } }); setLink(r.link); reload(); }
              catch (x) { setErr((x as Error).message); }
            }}>
              <div className="field"><label htmlFor="inv-email">Client email</label><input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <button type="submit">Create invitation link</button>
            </form>
            {err && <p className="notice" role="alert">{err}</p>}
            {link && (
              <div className="ok" style={{ marginTop: '1rem' }}>
                <p><strong>Invitation link created.</strong> Nothing has been sent. Copy this link and share it with the client yourself. It works once, for {email}, for 14 days.</p>
                <input type="text" readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.target.select()} />
              </div>
            )}
          </>
        )}
      </section>

      <AiUsage pid={o.project.id} />
      <DeleteProject o={o} />
    </>
  );
}

type Dash = {
  completion: { answered: number; total: number; pct: number }; coverage: { captured: number; total: number; pct: number };
  flags: { high: number; medium: number; low: number }; lastActive: string | null; ai: { cents: number; capCents: number };
  stages: { key: string; label: string; at: string | null }[];
};
function Dashboard({ pid }: { pid: string }) {
  const [d, setD] = useState<Dash | null>(null);
  useEffect(() => { api<Dash>(`/api/admin/projects/${pid}/dashboard`).then(setD).catch(() => setD(null)); }, [pid]);
  if (!d) return <div className="tiles skeleton" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="tile" />)}</div>;
  const openFlags = d.flags.high + d.flags.medium + d.flags.low;
  const currentIdx = d.stages.reduce((n, s, i) => (s.at ? i : n), -1);
  const next: Record<string, [string, string]> = {
    invited: ['Wait for the client to start.', ''], started: ['The client is in discovery. Let them work.', ''],
    submitted: ['Review the flags. Then approve the source.', 'flags'], source: ['Build the positioning options.', 'strategy'],
    direction: ['Draft the framework.', 'strategy'], draft: ['Refine the draft.', 'strategy'],
  };
  const step = currentIdx >= 0 ? next[d.stages[currentIdx].key] : ['Invite the client below.', ''];
  return (
    <>
      <div className="tiles">
        <div className="tile"><span className="tile-label">Answered</span><span className="tile-num">{d.completion.pct}%</span><Bar value={d.completion.pct} /><span className="tile-sub">{d.completion.answered} of {d.completion.total} core questions</span></div>
        <div className="tile"><span className="tile-label">Coverage</span><span className="tile-num">{d.coverage.pct}%</span><Bar value={d.coverage.pct} /><span className="tile-sub">{d.coverage.captured} of {d.coverage.total} key fields</span></div>
        <div className="tile"><span className="tile-label">Open flags</span><span className="tile-num">{openFlags}</span><span className="tile-sub">{d.flags.high} high &middot; {d.flags.medium} medium &middot; {d.flags.low} low</span></div>
        <div className="tile"><span className="tile-label">Client activity</span><span className="tile-num small-num"><LastActive at={d.lastActive} /></span></div>
        <div className="tile"><span className="tile-label">AI spend</span><span className="tile-num">${(d.ai.cents / 100).toFixed(2)}</span><span className="tile-sub">this month, of ${(d.ai.capCents / 100).toFixed(0)} cap</span></div>
      </div>
      <section className="card stage-card">
        <ol className="stages">
          {d.stages.map((s, i) => (
            <li key={s.key} className={s.at ? (i === currentIdx ? 'current' : 'done') : ''}>
              <span className="stage-dot" aria-hidden="true" />
              <span className="stage-name">{s.label}</span>
              <span className="stage-date">{s.at ? new Date(s.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
            </li>
          ))}
        </ol>
        <p className="small" style={{ margin: '1rem 0 0' }}><strong>Next:</strong> {step[1] ? <Link to={`/admin/p/${pid}/${step[1]}`}>{step[0]}</Link> : step[0]}</p>
      </section>
    </>
  );
}

// Permanent deletion, for client requests and the retention schedule. Typing the name guards against mistakes.
function DeleteProject({ o }: { o: Overview }) {
  const label = o.project.company_name || o.project.name;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  return (
    <section className="card danger" aria-labelledby="del-h">
      <h2 id="del-h">Delete this project</h2>
      <p className="small">Permanently deletes every answer, persona, upload (including the files), note, flag, submitted version, approval, and draft for this project. The client's sign-in record is anonymized if they have no other project. This can't be undone. Backup copies at Render age out within about 7 days.</p>
      {!open ? <button className="secondary" onClick={() => setOpen(true)}>Delete project...</button> : (
        <form onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr('');
          try { await api(`/api/admin/projects/${o.project.id}`, { method: 'DELETE', json: { confirmName: typed } }); nav('/admin'); }
          catch (x) { setErr((x as Error).message); setBusy(false); }
        }}>
          <div className="field">
            <label htmlFor="del-name">Type <strong>{label}</strong> to confirm</label>
            <input id="del-name" type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          {err && <p className="notice" role="alert">{err}</p>}
          <button type="submit" className="danger" disabled={busy || typed.trim() !== label.trim()}>{busy ? 'Deleting...' : 'Permanently delete'}</button>{' '}
          <button type="button" className="secondary" onClick={() => { setOpen(false); setTyped(''); }}>Cancel</button>
        </form>
      )}
    </section>
  );
}

function AnswersTab() {
  const { pid } = useParams();
  const [d, setD] = useState<Discovery | null>(null);
  useEffect(() => { api<Discovery>(`/api/admin/projects/${pid}/answers`).then(setD); }, [pid]);
  if (!d) return <p className="muted">Loading...</p>;
  return (
    <>
      <p className="muted small">Live answers in the client's own words. Submitted versions are frozen separately.</p>
      {d.modules.map((m) => {
        const prog = d.progress.find((p) => p.module_id === m.id);
        const files = d.attachments.filter((a) => a.module_id === m.id);
        return (
          <section key={m.id} className="card">
            <h2>{m.title} {prog?.marked_for_discussion && <span className="tag warn">Marked for discussion</span>}</h2>
            <ModuleAnswers d={d} m={m} />
            {prog?.client_correction && <p><strong>Client correction:</strong> {prog.client_correction}</p>}
            {files.length > 0 && <p className="small">Attachments: {files.map((f) => <AttachmentLink key={f.id} pid={pid!} id={f.id} name={f.original_name} />)}</p>}
            <NoteForm topicType="module" topicId={m.id} />
          </section>
        );
      })}
      {d.earlierAnswers.length > 0 && (
        <section className="card">
          <h2>Earlier answers to retired questions</h2>
          <p className="small muted">These questions were replaced in an update. The answers are kept and offered back to the client where they fit.</p>
          {d.earlierAnswers.map((e, i) => (
            <div className="answer-block" key={i}>
              <p className="q">{e.prompt.replaceAll('{offer}', e.offer_name ?? 'this offer')}</p>
              <p className="a">{typeof e.value === 'string' ? e.value : e.value == null ? e.status.replace('_', ' ') : JSON.stringify(e.value)}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function AttachmentLink({ pid, id, name }: { pid: string; id: string; name: string }) {
  return <button className="link" style={{ marginRight: '0.75rem' }} onClick={async () => {
    const r = await api<{ url: string }>(`/api/projects/${pid}/attachments/${id}/link`);
    window.location.href = r.url;
  }}>{name}</button>;
}

function OffersTab() {
  const { pid } = useParams();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const load = useCallback(() => api<Offer[]>(`/api/admin/projects/${pid}/offers`).then(setOffers), [pid]);
  useEffect(() => { load(); }, [load]);
  if (!offers) return <p className="muted">Loading...</p>;
  return (
    <>
      <p className="muted small">The client lists every offer. Only you decide which ones are in scope for strategy work. Adding offers never expands scope on its own.</p>
      {offers.length === 0 ? <p className="muted">No offers yet.</p> : (
        <table>
          <thead><tr><th>Offer</th><th>Status</th><th>Priority</th><th>In scope</th></tr></thead>
          <tbody>{offers.map((o) => (
            <tr key={o.id}>
              <td><strong>{o.name}</strong>{o.description && <><br /><span className="small">{o.description}</span></>}</td>
              <td>{o.availability ?? '-'}</td><td>{o.priority ?? '-'}</td>
              <td><label className="choice"><input type="checkbox" checked={!!o.in_scope} onChange={async (e) => { await api(`/api/admin/projects/${pid}/offers/${o.id}/scope`, { method: 'PUT', json: { inScope: e.target.checked } }); load(); }} /><span className="sr-only">In scope: {o.name}</span></label></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

type Note = { id: string; topic_type: string; topic_id: string | null; note_type: string; body: string; author_email: string; author_name: string | null; created_at: string };

function NoteForm({ topicType, topicId, onAdded }: { topicType: string; topicId?: string; onAdded?: () => void }) {
  const { pid } = useParams();
  const [body, setBody] = useState('');
  const [noteType, setNoteType] = useState('interpretation');
  const [msg, setMsg] = useState('');
  const fid = `note-${topicId ?? 'project'}`;
  return (
    <details style={{ marginTop: '0.75rem' }}>
      <summary className="small">Add a review note</summary>
      <form onSubmit={async (e) => {
        e.preventDefault(); setMsg('');
        try { await api(`/api/admin/projects/${pid}/notes`, { method: 'POST', json: { topicType, topicId: topicId ?? null, noteType, body } }); setBody(''); setMsg('Note saved.'); onAdded?.(); }
        catch (x) { setMsg((x as Error).message); }
      }}>
        <div className="field"><label htmlFor={`${fid}-type`}>Type</label>
          <select id={`${fid}-type`} value={noteType} onChange={(e) => setNoteType(e.target.value)}>
            <option value="confirmed">Confirmed information</option><option value="interpretation">Interpretation</option><option value="assumption">Assumption</option>
          </select></div>
        <div className="field"><label htmlFor={fid}>Note</label><textarea id={fid} rows={3} required value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <button type="submit">Save note</button> <span className="small muted" role="status">{msg}</span>
      </form>
    </details>
  );
}

function NotesTab() {
  const { pid } = useParams();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [mods, setMods] = useState<Discovery['modules']>([]);
  const load = useCallback(() => api<Note[]>(`/api/admin/projects/${pid}/notes`).then(setNotes), [pid]);
  useEffect(() => { load(); api<Discovery>(`/api/admin/projects/${pid}/answers`).then((d) => setMods(d.modules)); }, [load, pid]);
  if (!notes) return <p className="muted">Loading...</p>;
  const topic = (n: Note) => n.topic_type === 'module' ? mods.find((m) => m.id === n.topic_id)?.title ?? 'Chapter' : n.topic_type === 'project' ? 'Whole project' : n.topic_type;
  const typeLabel: Record<string, string> = { confirmed: 'Confirmed', interpretation: 'Interpretation', assumption: 'Assumption' };
  return (
    <>
      <p className="muted small">Private to Rishari reviewers. Clients never see these notes.</p>
      <NoteForm topicType="project" onAdded={load} />
      {notes.length === 0 ? <p className="muted" style={{ marginTop: '1.5rem' }}>No notes yet.</p> : notes.map((n) => (
        <div className="card" key={n.id} style={{ marginTop: '1rem' }}>
          <p className="small muted">{topic(n)} <span className="tag">{typeLabel[n.note_type]}</span> &middot; {n.author_name ?? n.author_email}, {new Date(n.created_at).toLocaleString()}</p>
          <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{n.body}</p>
        </div>
      ))}
    </>
  );
}

function ActivityTab() {
  const { pid } = useParams();
  const [rows, setRows] = useState<{ action: string; actor_email: string | null; created_at: string }[] | null>(null);
  useEffect(() => { api<typeof rows>(`/api/admin/projects/${pid}/activity`).then(setRows); }, [pid]);
  if (!rows) return <p className="muted">Loading...</p>;
  return (
    <table>
      <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.actor_email ?? 'System'}</td><td>{r.action}</td></tr>)}</tbody>
    </table>
  );
}

function DataUseEditor() {
  const [v, setV] = useState<{ reviewed: boolean; sections: { heading: string; body: string }[] } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api<{ value: NonNullable<typeof v> }>('/api/admin/data-use').then((r) => setV(r.value)); }, []);
  if (!v) return <p className="page muted">Loading...</p>;
  return (
    <main className="page" id="main">
      <h1 className="admin-title">Data-use page</h1>
      <p className="muted">Clients see this before starting. AI features stay off for client content until this page is marked as reviewed. Don't state legal terms, retention periods, certifications, or data residency you haven't verified.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setMsg('');
        try { await api('/api/admin/data-use', { method: 'PUT', json: v }); setMsg('Saved.'); } catch (x) { setMsg((x as Error).message); }
      }}>
        {v.sections.map((s, i) => (
          <div className="card" key={i}>
            <div className="field"><label htmlFor={`du-h-${i}`}>Heading</label>
              <input id={`du-h-${i}`} type="text" value={s.heading} onChange={(e) => setV({ ...v, sections: v.sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) })} /></div>
            <div className="field"><label htmlFor={`du-b-${i}`}>Text</label>
              <textarea id={`du-b-${i}`} rows={5} value={s.body} onChange={(e) => setV({ ...v, sections: v.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} /></div>
          </div>
        ))}
        <label className="choice"><input type="checkbox" checked={v.reviewed} onChange={(e) => setV({ ...v, reviewed: e.target.checked })} /><span>I've reviewed this page and it is accurate.</span></label>
        <p><button type="submit">Save</button> <span role="status" className="small">{msg}</span></p>
        <p className="small"><Link to="/data-use">View the client version</Link></p>
      </form>
    </main>
  );
}
