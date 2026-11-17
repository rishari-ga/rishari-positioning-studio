import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONFIRMATION } from '@shared/content';
import { api } from '../api';
import type { Answer, Question } from '../api';
import { useDiscovery } from './ProjectRoutes';
import { ChapterMap, SaveIndicator, moduleSteps } from './ModulePage';
import type { SaveStatus } from './useAutosave';

const STATUS_LABEL: Record<string, string> = { not_sure: "Not sure yet", discuss: 'Discuss with Rishari' };

export function formatValue(q: Pick<Question, 'input_type'>, a: Answer | undefined): string | null {
  if (!a || a.value == null) return null;
  if (q.input_type === 'multi_select' && Array.isArray(a.value)) return (a.value as string[]).join(', ');
  if (q.input_type === 'labeled_examples' && Array.isArray(a.value)) return (a.value as { text: string; label: string }[]).map((e) => `[${e.label}] ${e.text}`).join('\n\n');
  return typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
}

export function ReviewPage() {
  const { d, reload } = useDiscovery();
  const nav = useNavigate();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // One key per visit to this page, so a retried submit cannot create a duplicate snapshot.
  const idemKey = useMemo(() => crypto.randomUUID(), []);
  const h1 = useRef<HTMLHeadingElement>(null);
  useEffect(() => { h1.current?.focus(); }, []);

  return (
    <div className="layout">
      <aside><ChapterMap current="review" /></aside>
      <main id="main">
        <p className="eyebrow">Before you submit</p>
        <h1 ref={h1} tabIndex={-1}>{CONFIRMATION.heading}</h1>
        <p className="lede">Here's everything you shared, in your own words. Correct anything that's off, and mark any chapter you'd like to talk through.</p>
        {d.submissions.length > 0 && <p className="ok">You submitted version {d.submissions[0].version} on {new Date(d.submissions[0].created_at).toLocaleDateString()}. Submitting again creates a new version. The earlier one is kept.</p>}

        {d.modules.map((m) => {
          const prog = d.progress.find((p) => p.module_id === m.id);
          const steps = moduleSteps(m);
          return (
            <section key={m.id} className="card" aria-labelledby={`rv-${m.key}`}>
              <h2 id={`rv-${m.key}`}>{m.title}</h2>
              <p className="small muted">Summary: an organized summary will appear here once AI-assisted review is turned on. Your original answers below are what we'll review.</p>
              {m.questions.map((q) => {
                if (q.kind === 'offer_list') {
                  return (
                    <div className="answer-block" key={q.id}>
                      <p className="q">{q.prompt}</p>
                      {d.offers.length ? <ul className="plain">{d.offers.map((o) => <li key={o.id}>{o.name}{o.availability ? ` (${o.availability})` : ''}</li>)}</ul> : <p className="muted">No offers listed.</p>}
                    </div>
                  );
                }
                const a = d.answers.find((x) => x.question_id === q.id);
                const text = formatValue(q, a);
                const stepIndex = steps.findIndex((s) => s.kind === 'fields' ? s.questions.some((x) => x.id === q.id) : s.question.id === q.id);
                return (
                  <div className="answer-block" key={q.id}>
                    <p className="q">{q.prompt}{a && STATUS_LABEL[a.status] && <span className="tag warn">{STATUS_LABEL[a.status]}</span>}</p>
                    {text ? <p className="a">{text}</p> : <p className="muted">Not answered.</p>}
                    <Link className="small" to={`/p/${d.project.id}/m/${m.key}/${stepIndex}`}>Return to this answer</Link>
                  </div>
                );
              })}
              <ModuleControls moduleKey={m.key} marked={prog?.marked_for_discussion ?? false} correction={prog?.client_correction ?? ''} onChange={reload} />
            </section>
          );
        })}

        <form onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setErr('');
          try {
            await api(`/api/projects/${d.project.id}/submit`, { method: 'POST', json: { confirmed: true, idempotencyKey: idemKey } });
            await reload(); nav(`/p/${d.project.id}/done`);
          } catch (x) { setErr((x as Error).message); setBusy(false); }
        }}>
          <div className="card" style={{ background: 'var(--grey)', border: 0 }}>
            <label className="choice" htmlFor="confirm">
              <input id="confirm" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>{CONFIRMATION.checkbox}</span>
            </label>
          </div>
          {err && <p className="notice" role="alert">{err}</p>}
          <button type="submit" disabled={!confirmed || busy}>{busy ? 'Submitting...' : 'Submit'}</button>
        </form>
      </main>
    </div>
  );
}

function ModuleControls({ moduleKey, marked, correction, onChange }: { moduleKey: string; marked: boolean; correction: string; onChange: () => void }) {
  const { d } = useDiscovery();
  const [text, setText] = useState(correction);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [err, setErr] = useState('');
  const save = async (body: object) => {
    setStatus('saving');
    try { await api(`/api/projects/${d.project.id}/modules/${moduleKey}/progress`, { method: 'PUT', json: body }); setStatus('saved'); setErr(''); onChange(); }
    catch (x) { setStatus('failed'); setErr((x as Error).message); }
  };
  return (
    <div style={{ borderTop: '1px solid var(--brand-line)', paddingTop: '1rem' }}>
      <button type="button" className="quiet" aria-pressed={marked} onClick={() => save({ markedForDiscussion: !marked })}>
        {marked ? 'Marked for discussion' : 'Mark for discussion'}
      </button>
      <div className="field" style={{ marginTop: '1rem', marginBottom: 0 }}>
        <label htmlFor={`corr-${moduleKey}`}>Anything to correct or add for this chapter? (optional)</label>
        <textarea id={`corr-${moduleKey}`} rows={2} value={text} onChange={(e) => setText(e.target.value)}
          onBlur={() => { if (text !== correction) save({ clientCorrection: text || null }); }} />
      </div>
      <SaveIndicator status={status} error={err} />
    </div>
  );
}

export function DonePage() {
  return (
    <main className="page" id="main">
      <p className="eyebrow">Discovery complete</p>
      <h1 className="display">{CONFIRMATION.completion[0]}</h1>
      <p className="lede">{CONFIRMATION.completion[1]}</p>
    </main>
  );
}
