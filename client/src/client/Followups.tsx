import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { SaveStatus } from './useAutosave';

export type Followup = { id: string; question_key: string; offer_id: string | null; persona_id: string | null; round: number; question: string; answer: string | null; status: string };

// One shared load per project, so each question doesn't fetch the list separately.
const cache = new Map<string, Promise<Followup[]>>();
const load = (pid: string) => {
  if (!cache.has(pid)) cache.set(pid, api<Followup[]>(`/api/projects/${pid}/followups`).catch(() => []));
  return cache.get(pid)!;
};

const STATUS_LABEL: Record<string, string> = { not_sure: "I'm not sure yet", discuss: 'Discuss with Rishari', skipped: 'Skipped' };

// Shows up to two short follow-up questions under a core answer, one at a time.
// `ask` changes each time the client finishes editing the answer; that is the only time we check for a new one.
export function FollowupBox({ pid, questionKey, offerId, personaId, ask }: { pid: string; questionKey: string; offerId: string | null; personaId: string | null; ask: number }) {
  const [items, setItems] = useState<Followup[]>([]);
  const [checking, setChecking] = useState(false);
  const mine = (f: Followup) => f.question_key === questionKey && (f.offer_id ?? null) === offerId && (f.persona_id ?? null) === personaId;
  useEffect(() => { let live = true; load(pid).then((all) => { if (live) setItems(all.filter(mine)); }); return () => { live = false; }; }, [pid, questionKey, offerId, personaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastAsk = useRef(0);
  useEffect(() => {
    if (!ask || ask === lastAsk.current) return;
    lastAsk.current = ask;
    if (items.some((f) => f.status === 'open') || items.length >= 2) return;
    setChecking(true);
    api<{ followup: Followup | null }>(`/api/projects/${pid}/followups/next`, { method: 'POST', json: { questionKey, offerId, personaId } })
      .then((r) => { if (r.followup) { const f = { ...r.followup, question_key: questionKey, offer_id: offerId, persona_id: personaId }; setItems((cur) => [...cur.filter((x) => x.id !== f.id), f]); cache.delete(pid); } })
      .catch(() => { /* follow-ups are optional; the client keeps going */ })
      .finally(() => setChecking(false));
  }, [ask]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (f: Followup) => { setItems((cur) => cur.map((x) => (x.id === f.id ? { ...x, ...f } : x))); cache.delete(pid); };
  if (!items.length && !checking) return null;
  return (
    <div className="followups" aria-live="polite">
      {items.map((f) => f.status === 'open'
        ? <OpenFollowup key={f.id} pid={pid} f={f} onDone={update} />
        : (
          <div key={f.id} className="followup done">
            <p className="small" style={{ marginBottom: '0.2rem' }}><strong>Follow-up:</strong> {f.question}</p>
            <p className="small" style={{ margin: 0 }}>{f.answer?.trim() || <span className="muted">{STATUS_LABEL[f.status] ?? ''}</span>}</p>
          </div>
        ))}
      {checking && <p className="small muted" style={{ margin: '0.5rem 0 0' }}>Checking whether one more detail would help...</p>}
    </div>
  );
}

function OpenFollowup({ pid, f, onDone }: { pid: string; f: Followup; onDone: (f: Followup) => void }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [err, setErr] = useState('');
  const send = async (st: 'answered' | 'skipped' | 'not_sure' | 'discuss') => {
    setStatus('saving'); setErr('');
    try {
      const r = await api<Followup>(`/api/projects/${pid}/followups/${f.id}`, { method: 'PUT', json: { answer: st === 'answered' ? text : text || null, status: st } });
      setStatus('saved'); onDone({ ...f, answer: r.answer, status: r.status });
    } catch (x) { setStatus('failed'); setErr((x as Error).message); }
  };
  const id = `fu-${f.id}`;
  return (
    <div className="followup">
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>One more detail (optional)</p>
      <label htmlFor={id} style={{ fontWeight: 600 }}>{f.question}</label>
      <textarea id={id} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="alt-actions">
        <button type="button" onClick={() => send('answered')} disabled={!text.trim() || status === 'saving'}>Save</button>
        <button type="button" className="quiet" onClick={() => send('not_sure')}>I'm not sure yet</button>
        <button type="button" className="quiet" onClick={() => send('discuss')}>Discuss with Rishari</button>
        <button type="button" className="quiet" onClick={() => send('skipped')}>Skip</button>
      </div>
      {status === 'failed' && <p className="save-state failed" role="alert">Couldn't save. {err}</p>}
    </div>
  );
}

// AI chapter summary for the "Check that we've understood you" screen. Interpretations are labeled as such.
export type ChapterSummaryData = { status: 'ready' | 'empty' | 'missing' | 'outdated' | 'unavailable'; summary: { summary: string; interpretations: string[]; openQuestions: string[] } | null };
export function ChapterSummary({ pid, moduleKey }: { pid: string; moduleKey: string }) {
  const [s, setS] = useState<ChapterSummaryData | null>(null);
  useEffect(() => {
    let live = true;
    api<ChapterSummaryData>(`/api/projects/${pid}/summaries/${moduleKey}?generate=1`).then((r) => live && setS(r)).catch(() => live && setS({ status: 'unavailable', summary: null }));
    return () => { live = false; };
  }, [pid, moduleKey]);
  if (!s) return <p className="small muted">Preparing a short summary of this chapter...</p>;
  if (s.status === 'empty') return null;
  if (!s.summary || s.status === 'unavailable') return <p className="small muted">A summary isn't available right now. Your original answers below are what we'll review.</p>;
  return (
    <div className="summary-box">
      <p className="small" style={{ fontWeight: 600, marginBottom: '0.3rem' }}>Our summary</p>
      <p style={{ marginBottom: s.summary.interpretations.length || s.summary.openQuestions.length ? '0.75rem' : 0 }}>{s.summary.summary}</p>
      {s.summary.interpretations.length > 0 && (
        <>
          <p className="small" style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Our interpretation (please check)</p>
          <ul className="squares small">{s.summary.interpretations.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}
      {s.summary.openQuestions.length > 0 && (
        <>
          <p className="small" style={{ fontWeight: 600, marginBottom: '0.2rem' }}>Still open</p>
          <ul className="squares small">{s.summary.openQuestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}
      <p className="small muted" style={{ margin: '0.5rem 0 0' }}>An AI-assisted tool prepared this summary from your answers. Rishari's team reads your original answers before any strategy work. If something is off, tell us below.</p>
    </div>
  );
}
