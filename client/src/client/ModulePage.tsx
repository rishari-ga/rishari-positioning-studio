import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, hasContent } from '../api';
import type { Discovery, Module, Question, Offer } from '../api';
import { EVIDENCE_LABELS } from '@shared/content';
import { useDiscovery } from './ProjectRoutes';
import { useAutosave } from './useAutosave';
import type { Draft, SaveStatus } from './useAutosave';

type Step = { kind: 'fields'; questions: Question[] } | { kind: 'question'; question: Question };

export function moduleSteps(m: Module): Step[] {
  const fields = m.questions.filter((q) => q.kind === 'field');
  const rest = m.questions.filter((q) => q.kind !== 'field');
  return [...(fields.length ? [{ kind: 'fields' as const, questions: fields }] : []), ...rest.map((q) => ({ kind: 'question' as const, question: q }))];
}

function moduleState(d: Discovery, m: Module): 'none' | 'partial' | 'done' {
  const core = m.questions.filter((q) => q.kind !== 'field');
  const done = core.filter((q) => q.kind === 'offer_list' ? d.offers.length > 0 : hasContent(d.answers.find((a) => a.question_id === q.id))).length;
  return done === 0 ? 'none' : done === core.length ? 'done' : 'partial';
}

export function ChapterMap({ current }: { current?: string }) {
  const { d } = useDiscovery();
  const states = d.modules.map((m) => moduleState(d, m));
  const complete = states.filter((s) => s === 'done').length;
  return (
    <nav className="chapter-map" aria-label="Discovery chapters">
      <p className="progress-text">{complete} of {d.modules.length} chapters complete</p>
      <ol>
        {d.modules.map((m, i) => (
          <li key={m.key}>
            <Link to={`/p/${d.project.id}/m/${m.key}/0`} aria-current={current === m.key ? 'page' : undefined}>
              <span className={`dot ${states[i] === 'none' ? '' : states[i]}`} aria-hidden="true" />
              <span>{m.title}<span className="sr-only">{states[i] === 'done' ? ' (complete)' : states[i] === 'partial' ? ' (in progress)' : ''}</span></span>
            </Link>
          </li>
        ))}
        <li>
          <Link to={`/p/${d.project.id}/review`} aria-current={current === 'review' ? 'page' : undefined}>
            <span className="dot" aria-hidden="true" /><span>Check and submit</span>
          </Link>
        </li>
      </ol>
    </nav>
  );
}

export function ModulePage() {
  const { moduleKey, step } = useParams();
  const { d } = useDiscovery();
  const nav = useNavigate();
  const mi = d.modules.findIndex((m) => m.key === moduleKey);
  const m = d.modules[mi];
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [moduleKey, step]);
  if (!m) return <Navigate to={`/p/${d.project.id}`} replace />;
  const steps = moduleSteps(m);
  const si = Math.min(Math.max(Number(step) || 0, 0), steps.length - 1);
  const s = steps[si];
  const isLast = si === steps.length - 1;

  const next = () => {
    if (!isLast) nav(`/p/${d.project.id}/m/${m.key}/${si + 1}`);
    else if (mi < d.modules.length - 1) nav(`/p/${d.project.id}/m/${d.modules[mi + 1].key}/0`);
    else nav(`/p/${d.project.id}/review`);
  };
  const back = () => {
    if (si > 0) nav(`/p/${d.project.id}/m/${m.key}/${si - 1}`);
    else if (mi > 0) { const pm = d.modules[mi - 1]; nav(`/p/${d.project.id}/m/${pm.key}/${moduleSteps(pm).length - 1}`); }
  };

  return (
    <div className="layout">
      <aside><ChapterMap current={m.key} /></aside>
      <main id="main">
        <p className="eyebrow">Chapter {m.position} of {d.modules.length} &middot; Step {si + 1} of {steps.length}</p>
        <h1 ref={headingRef} tabIndex={-1}>{m.title}</h1>
        <p className="why">{m.why}</p>

        {s.kind === 'fields'
          ? s.questions.map((q) => <QuestionEditor key={q.id} q={q} compact />)
          : s.question.kind === 'offer_list' ? <OffersEditor q={s.question} />
          : <QuestionEditor key={s.question.id} q={s.question} />}

        {isLast && <ModuleAttachments moduleKey={m.key} />}

        <div className="nav-row">
          <button className="secondary" onClick={back} disabled={mi === 0 && si === 0}>Back</button>
          <button onClick={next}>{isLast && mi === d.modules.length - 1 ? 'Check your answers' : 'Continue'}</button>
        </div>
      </main>
    </div>
  );
}

export function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error?: string; onRetry?: () => void }) {
  return (
    <p className={`save-state ${status === 'failed' ? 'failed' : ''}`} role="status" aria-live="polite">
      {status === 'saving' && 'Saving...'}
      {status === 'saved' && 'Saved'}
      {status === 'failed' && (<>Couldn't save. {error} {onRetry && <button className="link" onClick={onRetry}>Try again</button>}</>)}
    </p>
  );
}

function QuestionEditor({ q, compact }: { q: Question; compact?: boolean }) {
  const { d, patchAnswer } = useDiscovery();
  const existing = d.answers.find((a) => a.question_id === q.id);
  const initial: Draft = { value: existing?.value ?? null, status: existing?.status ?? 'empty', contextNote: existing?.context_note ?? null };
  const onSaved = useCallback((rev: number, dr: Draft) => patchAnswer(q.id, rev, dr.value, dr.status, dr.contextNote), [patchAnswer, q.id]);
  const { draft, setDraft, status, error, flush, retry } = useAutosave(d.project.id, q.key, initial, existing?.revision ?? 0, onSaved);
  const id = `q-${q.key}`;
  const helpId = q.help_text ? `${id}-help` : undefined;

  const setValue = (value: unknown, immediate = false) => {
    const filled = typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) ? value.length > 0 : value != null;
    const st = draft.status === 'not_sure' || draft.status === 'discuss' ? draft.status : filled ? 'answered' : 'empty';
    setDraft({ ...draft, value, status: st }, immediate);
  };
  const toggle = (st: 'not_sure' | 'discuss') => {
    const filled = typeof draft.value === 'string' ? draft.value.trim() !== '' : Array.isArray(draft.value) ? draft.value.length > 0 : draft.value != null;
    setDraft({ ...draft, status: draft.status === st ? (filled ? 'answered' : 'empty') : st }, true);
  };

  const label = compact
    ? <label htmlFor={id}>{q.prompt}</label>
    : <label htmlFor={id} className="question-prompt">{q.prompt}</label>;

  let input: React.ReactElement;
  switch (q.input_type) {
    case 'short_text': case 'url':
      input = <input id={id} type={q.input_type === 'url' ? 'url' : 'text'} value={(draft.value as string) ?? ''} aria-describedby={helpId}
        onChange={(e) => setValue(e.target.value)} onBlur={() => flush()} />;
      break;
    case 'long_text':
      input = <textarea id={id} value={(draft.value as string) ?? ''} aria-describedby={helpId} rows={compact ? 3 : 7}
        onChange={(e) => setValue(e.target.value)} onBlur={() => flush()} />;
      break;
    case 'single_select':
      input = <select id={id} value={(draft.value as string) ?? ''} onChange={(e) => setValue(e.target.value || null, true)} aria-describedby={helpId}>
        <option value="">Choose one</option>{q.options.map((o) => <option key={o}>{o}</option>)}
      </select>;
      break;
    case 'multi_select': {
      const vals = (draft.value as string[]) ?? [];
      return (
        <fieldset className="field" aria-describedby={helpId}>
          <legend>{q.prompt}</legend>
          {q.help_text && <p className="help" id={helpId}>{q.help_text}</p>}
          <div className="choices">
            {q.options.map((o) => (
              <label key={o} className="choice">
                <input type="checkbox" checked={vals.includes(o)} onChange={(e) => setValue(e.target.checked ? [...vals, o] : vals.filter((v) => v !== o), true)} />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <SaveIndicator status={status} error={error} onRetry={retry} />
        </fieldset>
      );
    }
    case 'labeled_examples':
      input = <ExamplesInput id={id} value={(draft.value as { text: string; label: string }[]) ?? []} onChange={(v) => setValue(v.length ? v : null)} onBlur={() => flush()} />;
      break;
    default:
      input = <p className="muted">This question is answered elsewhere.</p>;
  }

  return (
    <div className="field">
      {label}
      {q.help_text && <p className="help" id={helpId}>{q.help_text}</p>}
      {!compact && q.thinking_prompts?.length > 0 && <p className="thinking">{q.thinking_prompts.join(' ')}</p>}
      {input}
      {q.allow_not_sure && (
        <div className="alt-actions">
          <button type="button" className="quiet" aria-pressed={draft.status === 'not_sure'} onClick={() => toggle('not_sure')}>I'm not sure yet</button>
          {q.kind === 'core' && <button type="button" className="quiet" aria-pressed={draft.status === 'discuss'} onClick={() => toggle('discuss')}>Discuss with Rishari</button>}
        </div>
      )}
      <SaveIndicator status={status} error={error} onRetry={retry} />
    </div>
  );
}

function ExamplesInput({ id, value, onChange, onBlur }: { id: string; value: { text: string; label: string }[]; onChange: (v: { text: string; label: string }[]) => void; onBlur: () => void }) {
  const rows = value.length ? value : [{ text: '', label: 'Observed' }];
  const update = (i: number, patch: Partial<{ text: string; label: string }>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)).filter((r, j) => r.text.trim() !== '' || j === i));
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} className="card">
          <label htmlFor={`${id}-${i}`} className="sr-only">Example {i + 1}</label>
          <textarea id={i === 0 ? id : `${id}-${i}`} rows={5} value={r.text} onChange={(e) => update(i, { text: e.target.value })} onBlur={onBlur} />
          <div className="field" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            <label htmlFor={`${id}-${i}-label`}>Where does this example come from?</label>
            <select id={`${id}-${i}-label`} value={r.label} onChange={(e) => update(i, { label: e.target.value })}>
              {EVIDENCE_LABELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
          {rows.length > 1 && <button type="button" className="link small" onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove this example</button>}
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => onChange([...rows.filter((r) => r.text.trim()), { text: '', label: 'Observed' }])}>Add another example</button>
    </div>
  );
}

const emptyOffer = { name: '', description: '', intended_customer: '', availability: null, pricing_approach: '', delivery_model: '', priority: null } as unknown as Offer;

function OffersEditor({ q }: { q: Question }) {
  const { d, reload } = useDiscovery();
  const [editing, setEditing] = useState<Offer | null>(null);
  return (
    <div className="field">
      <h2 className="question-prompt">{q.prompt}</h2>
      {q.help_text && <p className="help">{q.help_text}</p>}
      {d.offers.length === 0 && !editing && <p className="muted">No offers added yet.</p>}
      {d.offers.map((o) => editing?.id === o.id ? null : (
        <div className="card" key={o.id}>
          <h3>{o.name}</h3>
          {o.description && <p>{o.description}</p>}
          <p className="small muted">{[o.availability && { available: 'Available now', pilot: 'Pilot', planned: 'Planned' }[o.availability], o.priority && `Priority ${o.priority}`].filter(Boolean).join(' · ')}</p>
          <button className="quiet" onClick={() => setEditing(o)}>Edit</button>{' '}
          <button className="quiet" onClick={async () => { if (confirm(`Remove "${o.name}"?`)) { await api(`/api/projects/${d.project.id}/offers/${o.id}`, { method: 'DELETE' }); await reload(); } }}>Remove</button>
        </div>
      ))}
      {editing ? <OfferForm offer={editing} onDone={async () => { setEditing(null); await reload(); }} /> : <button className="secondary" onClick={() => setEditing(emptyOffer)}>Add an offer</button>}
    </div>
  );
}

function OfferForm({ offer, onDone }: { offer: Offer; onDone: () => void }) {
  const { d } = useDiscovery();
  const [f, setF] = useState({ ...offer });
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [err, setErr] = useState('');
  const set = (k: keyof Offer, v: unknown) => setF({ ...f, [k]: v });
  const txt = (k: keyof Offer, label: string, long = false, help?: string) => (
    <div className="field">
      <label htmlFor={`of-${k}`}>{label}</label>
      {help && <p className="help">{help}</p>}
      {long
        ? <textarea id={`of-${k}`} rows={3} value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} />
        : <input id={`of-${k}`} type="text" value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value)} required={k === 'name'} />}
    </div>
  );
  return (
    <form className="card" onSubmit={async (e) => {
      e.preventDefault(); setStatus('saving'); setErr('');
      const body = {
        name: f.name.trim(), description: f.description || null, intendedCustomer: f.intended_customer || null,
        availability: f.availability || null, pricingApproach: f.pricing_approach || null, deliveryModel: f.delivery_model || null,
        priority: f.priority ? Number(f.priority) : null,
      };
      try {
        await api(`/api/projects/${d.project.id}/offers${offer.id ? `/${offer.id}` : ''}`, { method: offer.id ? 'PUT' : 'POST', json: body });
        setStatus('saved'); onDone();
      } catch (x) { setStatus('failed'); setErr((x as Error).message); }
    }}>
      {txt('name', 'Offer name')}
      {txt('description', 'Plain-English description', true)}
      {txt('intended_customer', 'Intended customer')}
      <div className="field">
        <label htmlFor="of-availability">Status</label>
        <select id="of-availability" value={f.availability ?? ''} onChange={(e) => set('availability', e.target.value || null)}>
          <option value="">Choose one</option><option value="available">Available now</option><option value="pilot">Pilot</option><option value="planned">Planned</option>
        </select>
      </div>
      {txt('pricing_approach', 'Pricing approach (optional)')}
      {txt('delivery_model', 'How it is delivered')}
      <div className="field">
        <label htmlFor="of-priority">Priority</label>
        <p className="help">1 is the most important right now.</p>
        <input id="of-priority" type="text" inputMode="numeric" value={f.priority ?? ''} onChange={(e) => set('priority', e.target.value.replace(/\D/g, '') || null)} />
      </div>
      <SaveIndicator status={status} error={err} />
      <button type="submit" disabled={!f.name.trim() || status === 'saving'}>Save offer</button>{' '}
      <button type="button" className="secondary" onClick={onDone}>Cancel</button>
    </form>
  );
}

function ModuleAttachments({ moduleKey }: { moduleKey: string }) {
  const { d, reload } = useDiscovery();
  const mod = d.modules.find((m) => m.key === moduleKey)!;
  const files = d.attachments.filter((a) => a.module_id === mod.id);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [err, setErr] = useState('');
  return (
    <details className="card" open={files.length > 0}>
      <summary>Supporting documents (optional)</summary>
      <p className="small muted" style={{ marginTop: '0.75rem' }}>PDF, DOCX, or TXT. Please don't include passwords or sensitive personal information.</p>
      {files.length > 0 && <ul className="plain">{files.map((f) => (
        <li key={f.id}>{f.original_name} <button className="link small" onClick={async () => { await api(`/api/projects/${d.project.id}/attachments/${f.id}`, { method: 'DELETE' }); await reload(); }}>Remove</button></li>
      ))}</ul>}
      <label htmlFor={`file-${moduleKey}`} className="sr-only">Upload a document</label>
      <input id={`file-${moduleKey}`} type="file" accept=".pdf,.docx,.txt" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setStatus('saving'); setErr('');
        const fd = new FormData(); fd.append('file', file); fd.append('moduleKey', moduleKey);
        try {
          const r = await fetch(`/api/projects/${d.project.id}/attachments`, { method: 'POST', body: fd, credentials: 'include' });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.message ?? 'Upload failed.');
          setStatus('saved'); await reload();
        } catch (x) { setStatus('failed'); setErr((x as Error).message); }
        e.target.value = '';
      }} />
      <SaveIndicator status={status} error={err} />
    </details>
  );
}
