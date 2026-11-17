import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, hasContent, findAnswer } from '../api';
import type { Discovery, Module, Question, Offer, FocusOffer, Stakeholder } from '../api';
import { EVIDENCE_LABELS } from '@shared/content';
import { renderPrompt, EVIDENCE_OPTIONS, ROLE_OPTIONS } from '@shared/narrative';
import { useDiscovery } from './ProjectRoutes';
import { useAutosave } from './useAutosave';
import type { Draft, SaveStatus } from './useAutosave';

export type Step =
  | { kind: 'fields'; questions: Question[] }
  | { kind: 'question'; question: Question; offer: FocusOffer | null; probes: Question[] };

// Company questions first, then each focus offer's questions together. Probes ride on their core question's screen.
export function moduleSteps(m: Module, focus: FocusOffer[]): Step[] {
  const fields = m.questions.filter((q) => q.kind === 'field');
  const main = m.questions.filter((q) => q.kind !== 'field' && q.kind !== 'probe');
  const probesOf = (q: Question) => m.questions.filter((p) => p.kind === 'probe' && p.probe_of === q.key);
  const steps: Step[] = fields.length ? [{ kind: 'fields', questions: fields }] : [];
  for (const q of main.filter((x) => !x.per_offer || !focus.length)) steps.push({ kind: 'question', question: q, offer: null, probes: probesOf(q) });
  for (const o of focus) for (const q of main.filter((x) => x.per_offer)) steps.push({ kind: 'question', question: q, offer: o, probes: probesOf(q) });
  return steps;
}

function stepDone(d: Discovery, s: Step): boolean {
  if (s.kind === 'fields') return true;
  const q = s.question;
  if (q.kind === 'offer_list') return d.offers.length > 0;
  if (q.kind === 'stakeholder_map') return d.stakeholders.some((p) => (p.offer_id ?? null) === (s.offer?.id ?? null));
  return hasContent(findAnswer(d, q.id, s.offer?.id ?? null));
}

function moduleState(d: Discovery, m: Module): 'none' | 'partial' | 'done' {
  const steps = moduleSteps(m, d.focusOffers).filter((s) => s.kind === 'question');
  const done = steps.filter((s) => stepDone(d, s)).length;
  return done === 0 ? 'none' : done === steps.length ? 'done' : 'partial';
}

export function stepIndexFor(d: Discovery, questionKey: string, offerId: string | null): { moduleKey: string; index: number } | null {
  for (const m of d.modules) {
    const steps = moduleSteps(m, d.focusOffers);
    const i = steps.findIndex((s) => s.kind === 'fields'
      ? s.questions.some((q) => q.key === questionKey)
      : (s.question.key === questionKey || s.probes.some((p) => p.key === questionKey)) && (s.offer?.id ?? null) === offerId);
    if (i >= 0) return { moduleKey: m.key, index: i };
  }
  return null;
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

export function ClarificationBanner() {
  const { d } = useDiscovery();
  if (!d.clarifications.length) return null;
  const qByKey = new Map(d.modules.flatMap((m) => m.questions).map((q) => [q.key, q]));
  return (
    <section className="ok" aria-labelledby="clar-h">
      <h2 id="clar-h" style={{ marginTop: 0, fontSize: '1rem' }}>Rishari asked for a little more detail</h2>
      <ul className="squares" style={{ marginBottom: 0 }}>
        {d.clarifications.map((c) => {
          const q = qByKey.get(c.question_key);
          const offer = d.focusOffers.find((o) => o.id === c.offer_id) ?? null;
          const at = stepIndexFor(d, c.question_key, c.offer_id);
          if (!q || !at) return null;
          return (
            <li key={c.id}>
              <Link to={`/p/${d.project.id}/m/${at.moduleKey}/${at.index}`}>{renderPrompt(q, offer)}</Link>
              {c.note && <span className="muted small"> {c.note}</span>}
            </li>
          );
        })}
      </ul>
    </section>
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
  const steps = moduleSteps(m, d.focusOffers);
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
    else if (mi > 0) { const pm = d.modules[mi - 1]; nav(`/p/${d.project.id}/m/${pm.key}/${moduleSteps(pm, d.focusOffers).length - 1}`); }
  };

  return (
    <div className="layout">
      <aside><ChapterMap current={m.key} /></aside>
      <main id="main">
        {si === 0 && mi === 0 && <ClarificationBanner />}
        <p className="eyebrow">Chapter {m.position} of {d.modules.length} &middot; Step {si + 1} of {steps.length}{s.kind === 'question' && s.offer ? <> &middot; {s.offer.name}</> : null}</p>
        <h1 ref={headingRef} tabIndex={-1}>{m.title}</h1>
        <p className="why">{m.why}</p>

        {s.kind === 'fields'
          ? s.questions.map((q) => <QuestionEditor key={q.id} q={q} offer={null} compact />)
          : s.question.kind === 'offer_list' ? <OffersEditor q={s.question} />
          : s.question.kind === 'stakeholder_map' ? <StakeholderMap key={`${s.question.id}-${s.offer?.id}`} q={s.question} offer={s.offer} />
          : <>
              <QuestionEditor key={`${s.question.id}-${s.offer?.id}`} q={s.question} offer={s.offer} />
              <Probes key={`p-${s.question.id}-${s.offer?.id}`} core={s.question} probes={s.probes} offer={s.offer} />
            </>}

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

// Optional probes appear once the main question has something in it (or straight away for companion fields).
function Probes({ core, probes, offer }: { core: Question; probes: Question[]; offer: FocusOffer | null }) {
  const { d } = useDiscovery();
  if (!probes.length) return null;
  const coreAnswered = hasContent(findAnswer(d, core.id, offer?.id ?? null));
  const always = probes.filter((p) => p.probe_always);
  const optional = probes.filter((p) => !p.probe_always);
  const anyAnswered = optional.some((p) => hasContent(findAnswer(d, p.id, offer?.id ?? null)));
  return (
    <>
      {always.map((p) => <QuestionEditor key={`${p.id}-${offer?.id}`} q={p} offer={offer} compact />)}
      {optional.length > 0 && (coreAnswered || anyAnswered) && (
        <details className="card" open={anyAnswered}>
          <summary>Optional: a few prompts to go further</summary>
          <p className="small muted" style={{ marginTop: '0.75rem' }}>Answer any that are useful. Skip the rest.</p>
          {optional.map((p) => <QuestionEditor key={`${p.id}-${offer?.id}`} q={p} offer={offer} compact />)}
        </details>
      )}
    </>
  );
}

const filled = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null);

function QuestionEditor({ q, offer, compact }: { q: Question; offer: FocusOffer | null; compact?: boolean }) {
  const { d, patchAnswer } = useDiscovery();
  const offerId = q.per_offer && d.focusOffers.length ? offer?.id ?? null : null;
  const existing = findAnswer(d, q.id, offerId);
  const initial: Draft = { value: existing?.value ?? null, status: existing?.status ?? 'empty', contextNote: existing?.context_note ?? null, evidenceStatus: existing?.evidence_status ?? null, reusedFromKey: existing?.reused_from_key ?? null };
  const onSaved = useCallback((rev: number, dr: Draft) => patchAnswer({ questionId: q.id, offerId, revision: rev, value: dr.value, status: dr.status, contextNote: dr.contextNote, evidenceStatus: dr.evidenceStatus ?? null, reusedFromKey: dr.reusedFromKey ?? null }), [patchAnswer, q.id, offerId]);
  const { draft, setDraft, status, error, flush, retry } = useAutosave(d.project.id, q.key, offerId, initial, existing?.revision ?? 0, onSaved);
  const [reuseDismissed, setReuseDismissed] = useState(false);
  const id = `q-${q.key}${offerId ? `-${offerId.slice(0, 8)}` : ''}`;
  const helpId = q.help_text ? `${id}-help` : undefined;
  const prompt = renderPrompt(q, offer);
  const special = draft.status === 'not_sure' || draft.status === 'discuss' || draft.status === 'not_applicable';

  const setValue = (value: unknown, immediate = false) => {
    const st = special && draft.status !== 'not_applicable' ? draft.status : filled(value) ? 'answered' : 'empty';
    setDraft({ ...draft, value, status: st, reusedFromKey: null }, immediate);
  };
  const toggle = (st: 'not_sure' | 'discuss' | 'not_applicable') => {
    setDraft({ ...draft, status: draft.status === st ? (filled(draft.value) ? 'answered' : 'empty') : st }, true);
  };

  // An earlier, company-level answer that may already cover this question. Shown for confirmation, never copied silently.
  const reuse = !reuseDismissed && !filled(draft.value) && draft.status === 'empty'
    ? (q.reuse_from ?? []).map((k) => {
        const src = d.modules.flatMap((mm) => mm.questions).find((x) => x.key === k);
        const a = src ? findAnswer(d, src.id, null) : undefined;
        return src && a && typeof a.value === 'string' && a.value.trim() ? { key: k, prompt: src.prompt, text: a.value } : null;
      }).find(Boolean)
    : null;

  const label = compact
    ? <label htmlFor={id}>{prompt}</label>
    : <label htmlFor={id} className="question-prompt">{prompt}</label>;

  let input: React.ReactElement;
  switch (q.input_type) {
    case 'short_text': case 'url':
      input = <input id={id} type={q.input_type === 'url' ? 'url' : 'text'} value={(draft.value as string) ?? ''} aria-describedby={helpId}
        onChange={(e) => setValue(e.target.value)} onBlur={() => flush()} disabled={draft.status === 'not_applicable'} />;
      break;
    case 'long_text':
      input = <textarea id={id} value={(draft.value as string) ?? ''} aria-describedby={helpId} rows={compact ? 3 : 7}
        onChange={(e) => setValue(e.target.value)} onBlur={() => flush()} disabled={draft.status === 'not_applicable'} />;
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
          <legend>{prompt}</legend>
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
      {reuse && (
        <div className="card" style={{ background: 'var(--grey)', border: 0 }}>
          <p className="small" style={{ marginBottom: '0.4rem' }}><strong>You may have covered this already.</strong> Earlier, for "{reuse.prompt}", you wrote:</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{reuse.text}</p>
          <button type="button" className="quiet" onClick={() => setDraft({ ...draft, value: reuse.text, status: 'answered', reusedFromKey: reuse.key }, true)}>Yes, that covers it</button>{' '}
          <button type="button" className="quiet" onClick={() => setReuseDismissed(true)}>I'll answer separately</button>
        </div>
      )}
      {draft.reusedFromKey && <p className="small muted">Carried over from an earlier answer at your request. Edit it if anything is different here.</p>}
      {input}
      {q.asks_evidence && filled(draft.value) && draft.status === 'answered' && (
        <div className="field" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          <label htmlFor={`${id}-ev`} style={{ fontWeight: 500, fontSize: '0.875rem' }}>How do you know this? (optional)</label>
          <select id={`${id}-ev`} value={draft.evidenceStatus ?? ''} onChange={(e) => setDraft({ ...draft, evidenceStatus: e.target.value || null }, true)} style={{ maxWidth: '20rem' }}>
            <option value="">Choose one</option>
            {EVIDENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
      {(q.allow_not_sure || q.allow_not_applicable) && (
        <div className="alt-actions">
          {q.allow_not_sure && <button type="button" className="quiet" aria-pressed={draft.status === 'not_sure'} onClick={() => toggle('not_sure')}>I'm not sure yet</button>}
          {q.kind === 'core' && q.allow_not_sure && <button type="button" className="quiet" aria-pressed={draft.status === 'discuss'} onClick={() => toggle('discuss')}>Discuss with Rishari</button>}
          {q.allow_not_applicable && <button type="button" className="quiet" aria-pressed={draft.status === 'not_applicable'} onClick={() => toggle('not_applicable')}>{q.na_label ?? 'Not applicable'}</button>}
        </div>
      )}
      <SaveIndicator status={status} error={error} onRetry={retry} />
    </div>
  );
}

// Stakeholder map (Section 13): start with the main buyer; add people only when their needs differ.
function StakeholderMap({ q, offer }: { q: Question; offer: FocusOffer | null }) {
  const { d, reload } = useDiscovery();
  const offerId = d.focusOffers.length ? offer?.id ?? null : null;
  const people = d.stakeholders.filter((p) => (p.offer_id ?? null) === offerId);
  const [editing, setEditing] = useState<Partial<Stakeholder> | null>(people.length ? null : { label: '', roles: ['primary_buyer'] });
  const roleLabel = (r: string) => ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r;
  return (
    <div className="field">
      <h2 className="question-prompt">{renderPrompt(q, offer)}</h2>
      {q.help_text && <p className="help">{q.help_text}</p>}
      {people.map((p) => editing?.id === p.id ? null : (
        <div className="card" key={p.id}>
          <h3>{p.label}</h3>
          <p className="small muted">{p.roles.map(roleLabel).join(' · ') || 'No role chosen'}</p>
          {p.desired_outcome && <p className="small"><strong>Wants:</strong> {p.desired_outcome}</p>}
          {p.wants_to_prevent && <p className="small"><strong>Wants to prevent:</strong> {p.wants_to_prevent}</p>}
          {p.needs_to_believe && <p className="small"><strong>Needs to believe:</strong> {p.needs_to_believe}</p>}
          <button className="quiet" onClick={() => setEditing(p)}>Edit</button>{' '}
          <button className="quiet" onClick={async () => { await api(`/api/projects/${d.project.id}/stakeholders/${p.id}`, { method: 'DELETE' }); await reload(); }}>Remove</button>
        </div>
      ))}
      {editing
        ? <StakeholderForm person={editing} offerId={offerId} onDone={async () => { setEditing(null); await reload(); }} />
        : <button className="secondary" onClick={() => setEditing({ label: '', roles: [] })}>Add someone whose needs differ</button>}
    </div>
  );
}

function StakeholderForm({ person, offerId, onDone }: { person: Partial<Stakeholder>; offerId: string | null; onDone: () => void }) {
  const { d } = useDiscovery();
  const [f, setF] = useState({ label: person.label ?? '', roles: person.roles ?? [], desired_outcome: person.desired_outcome ?? '', wants_to_prevent: person.wants_to_prevent ?? '', needs_to_believe: person.needs_to_believe ?? '', decision_role: person.decision_role ?? '', evidence_status: person.evidence_status ?? '' });
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [err, setErr] = useState('');
  const text = (k: keyof typeof f, label: string, long = true) => (
    <div className="field">
      <label htmlFor={`sh-${k}`}>{label}</label>
      {long ? <textarea id={`sh-${k}`} rows={2} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        : <input id={`sh-${k}`} type="text" value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </div>
  );
  return (
    <form className="card" onSubmit={async (e) => {
      e.preventDefault(); setStatus('saving'); setErr('');
      const body = { offerId, label: f.label.trim(), roles: f.roles, desiredOutcome: f.desired_outcome || null, wantsToPrevent: f.wants_to_prevent || null, needsToBelieve: f.needs_to_believe || null, decisionRole: f.decision_role || null, evidenceStatus: f.evidence_status || null };
      try { await api(`/api/projects/${d.project.id}/stakeholders${person.id ? `/${person.id}` : ''}`, { method: person.id ? 'PUT' : 'POST', json: body }); setStatus('saved'); onDone(); }
      catch (x) { setStatus('failed'); setErr((x as Error).message); }
    }}>
      {text('label', 'Who is this? A role or title is enough', false)}
      <fieldset className="field">
        <legend>What part do they play? Choose all that apply.</legend>
        <div className="choices">
          {ROLE_OPTIONS.map((r) => (
            <label key={r.value} className="choice">
              <input type="checkbox" checked={f.roles.includes(r.value)} onChange={(e) => setF({ ...f, roles: e.target.checked ? [...f.roles, r.value] : f.roles.filter((x) => x !== r.value) })} />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {text('desired_outcome', 'What do they want to happen?')}
      {text('wants_to_prevent', 'What do they want to prevent?')}
      {text('needs_to_believe', 'What do they need to believe to say yes?')}
      {text('decision_role', 'What is their role in the decision?', false)}
      <div className="field">
        <label htmlFor="sh-ev">How do you know this?</label>
        <select id="sh-ev" value={f.evidence_status} onChange={(e) => setF({ ...f, evidence_status: e.target.value })} style={{ maxWidth: '20rem' }}>
          <option value="">Choose one</option>
          {EVIDENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <SaveIndicator status={status} error={err} />
      <button type="submit" disabled={!f.label.trim() || status === 'saving'}>Save</button>{' '}
      <button type="button" className="secondary" onClick={onDone}>Cancel</button>
    </form>
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
  const [removing, setRemoving] = useState<string | null>(null);
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
          {removing === o.id
            ? <><button className="quiet" onClick={async () => { await api(`/api/projects/${d.project.id}/offers/${o.id}`, { method: 'DELETE' }); setRemoving(null); await reload(); }}>Yes, remove it</button>{' '}<button className="quiet" onClick={() => setRemoving(null)}>Keep it</button></>
            : <button className="quiet" onClick={() => setRemoving(o.id)}>Remove</button>}
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
