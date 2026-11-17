import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, hasContent, findAnswer, priorityPersonas } from '../api';
import type { Discovery, Module, Question, Offer, FocusOffer, Persona, CustomerGroup, SolutionLink } from '../api';
import { EVIDENCE_LABELS } from '@shared/content';
import { renderPrompt, fill, EVIDENCE_OPTIONS, PURCHASE_ROLES, FIT_OPTIONS, TERMS } from '@shared/narrative';
import { useDiscovery } from './ProjectRoutes';
import { useAutosave } from './useAutosave';
import type { Draft, SaveStatus } from './useAutosave';
import { FollowupBox } from './Followups';

export type Step =
  | { kind: 'fields'; questions: Question[] }
  | { kind: 'question'; question: Question; offer: FocusOffer | null; persona: Persona | null; probes: Question[] };

// Company questions in order. A run of persona questions repeats for each priority persona (persona by persona);
// a run of offer questions repeats for each focus offer. Probes ride on their core question's screen.
export function moduleSteps(m: Module, focus: FocusOffer[], personas: Persona[]): Step[] {
  const fields = m.questions.filter((q) => q.kind === 'field');
  const main = m.questions.filter((q) => q.kind !== 'field' && q.kind !== 'probe');
  const probesOf = (q: Question) => m.questions.filter((p) => p.kind === 'probe' && p.probe_of === q.key);
  const steps: Step[] = fields.length ? [{ kind: 'fields', questions: fields }] : [];
  const scopeOf = (q: Question) => (q.per_persona ? 'persona' : q.per_offer && focus.length ? 'offer' : 'company');
  for (let i = 0; i < main.length;) {
    const scope = scopeOf(main[i]);
    let j = i;
    while (j < main.length && scopeOf(main[j]) === scope && (scope !== 'company' || j === i)) j++;
    const run = main.slice(i, j);
    if (scope === 'persona') for (const p of personas) for (const q of run) steps.push({ kind: 'question', question: q, offer: null, persona: p, probes: probesOf(q) });
    else if (scope === 'offer') for (const o of focus) for (const q of run) steps.push({ kind: 'question', question: q, offer: o, persona: null, probes: probesOf(q) });
    else for (const q of run) steps.push({ kind: 'question', question: q, offer: null, persona: null, probes: probesOf(q) });
    i = j;
  }
  return steps;
}
const stepsFor = (d: Discovery, m: Module) => moduleSteps(m, d.focusOffers, priorityPersonas(d));

function stepDone(d: Discovery, s: Step): boolean {
  if (s.kind === 'fields') return true;
  const q = s.question;
  if (q.kind === 'offer_list') return d.offers.length > 0;
  if (q.kind === 'customer_groups') return d.customerGroups.length > 0;
  if (q.kind === 'personas') return d.personas.length > 0;
  if (q.kind === 'solution_links') return d.links.some((l) => (l.persona_id ?? null) === (s.persona?.id ?? null));
  if (q.kind === 'persona_fields') return priorityPersonas(d).some((p) => hasContent(findAnswer(d, q.id, null, p.id)));
  return hasContent(findAnswer(d, q.id, s.offer?.id ?? null, s.persona?.id ?? null));
}

function moduleState(d: Discovery, m: Module): 'none' | 'partial' | 'done' {
  const steps = stepsFor(d, m).filter((s) => s.kind === 'question');
  if (!steps.length) return 'none';
  const done = steps.filter((s) => stepDone(d, s)).length;
  return done === 0 ? 'none' : done === steps.length ? 'done' : 'partial';
}

export function stepIndexFor(d: Discovery, questionKey: string, offerId: string | null, personaId: string | null = null): { moduleKey: string; index: number } | null {
  for (const m of d.modules) {
    const steps = stepsFor(d, m);
    const i = steps.findIndex((s) => s.kind === 'fields'
      ? s.questions.some((q) => q.key === questionKey)
      : (s.question.key === questionKey || s.probes.some((p) => p.key === questionKey)) && (s.offer?.id ?? null) === offerId && (s.persona?.id ?? null) === personaId);
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
          <Link to={`/p/${d.project.id}/connections`} aria-current={current === 'connections' ? 'page' : undefined}>
            <span className="dot" aria-hidden="true" /><span>Check the connection</span>
          </Link>
        </li>
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
          const persona = d.personas.find((p) => p.id === c.persona_id) ?? null;
          const at = stepIndexFor(d, c.question_key, c.offer_id, c.persona_id);
          if (!q || !at) return null;
          return (
            <li key={c.id}>
              <Link to={`/p/${d.project.id}/m/${at.moduleKey}/${at.index}`}>{renderPrompt(q, offer, persona)}</Link>
              {persona && <span className="muted small"> ({persona.role_title})</span>}
              {c.note && <span className="muted small"> {c.note}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Section 2: plain definitions shown before the customer and persona chapters.
export function Definitions({ compact }: { compact?: boolean }) {
  const body = (
    <>
      <dl className="defs">
        {TERMS.definitions.map((t) => <div key={t.term}><dt>{t.term}</dt><dd>{t.text}</dd></div>)}
      </dl>
      <details>
        <summary className="small">See an example of personas</summary>
        <p className="small" style={{ marginTop: '0.5rem' }}>{TERMS.personaExample}</p>
        <p className="small muted">{TERMS.exampleNote}</p>
      </details>
    </>
  );
  if (compact) return <details className="card"><summary>What do these words mean?</summary><div style={{ marginTop: '0.75rem' }}>{body}</div></details>;
  return (
    <section className="card" style={{ background: 'var(--grey)', border: 0 }} aria-labelledby="terms-h">
      <h2 id="terms-h" style={{ marginTop: 0 }}>Before you start</h2>
      <p>{TERMS.intro}</p>
      {body}
    </section>
  );
}

// Shows what the client already told us about this persona or the company, so each screen stays connected.
function ContextBox({ persona, show }: { persona: Persona | null; show: ('goal' | 'problem' | 'offers' | 'benefit')[] }) {
  const { d } = useDiscovery();
  const company = !persona;
  const goal = company ? textOf(d, 'cc_goal') : persona!.goal;
  const problem = company ? textOf(d, 'cc_problem') : persona!.problem;
  const links = d.links.filter((l) => (l.persona_id ?? null) === (persona?.id ?? null));
  const offerName = (id: string | null) => d.offers.find((o) => o.id === id)?.name;
  const rows: [string, string | null][] = [];
  if (show.includes('goal')) rows.push(['Goal', goal]);
  if (show.includes('problem')) rows.push(['Problem', problem]);
  if (show.includes('offers')) rows.push(['Product or service', links.length ? links.map((l) => offerName(l.offer_id) ?? FIT_OPTIONS.find((f) => f.value === l.fit)?.label).join(', ') : null]);
  if (show.includes('benefit')) rows.push(['Intended benefit', links.map((l) => l.benefit).filter(Boolean).join('; ') || null]);
  return (
    <div className="card" style={{ background: 'var(--grey)', border: 0 }}>
      <p className="small" style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{company ? 'What you told us about the customer company' : `What you told us about the ${persona!.role_title} persona`}</p>
      {rows.map(([k, v]) => <p key={k} className="small" style={{ marginBottom: '0.2rem' }}><strong>{k}:</strong> {v ?? <span className="muted">Not answered yet</span>}</p>)}
      <p className="small" style={{ margin: '0.4rem 0 0' }}><Link to={`/p/${d.project.id}/m/${company ? 'customer_company' : 'customer_personas'}/0`}>Change this</Link></p>
    </div>
  );
}
function textOf(d: Discovery, key: string): string | null {
  const q = d.modules.flatMap((m) => m.questions).find((x) => x.key === key);
  const a = q ? findAnswer(d, q.id, null) : undefined;
  return a && typeof a.value === 'string' && a.value.trim() ? a.value : null;
}

const CONTEXT: Record<string, ('goal' | 'problem' | 'offers' | 'benefit')[]> = {
  pr_prevents: ['problem'], p_work: ['goal', 'problem'], sl_company: ['goal', 'problem'], sl_persona: ['goal', 'problem'],
  sc_company: ['goal', 'problem', 'offers'], sp_do: ['goal', 'problem', 'offers', 'benefit'], nc_keep: ['problem'], np_keep: ['problem'],
};

export function ModulePage() {
  const { moduleKey, step } = useParams();
  const { d } = useDiscovery();
  const nav = useNavigate();
  const mi = d.modules.findIndex((m) => m.key === moduleKey);
  const m = d.modules[mi];
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [moduleKey, step]);
  if (!m) return <Navigate to={`/p/${d.project.id}`} replace />;
  const steps = stepsFor(d, m);
  if (!steps.length) return <Navigate to={`/p/${d.project.id}/m/${d.modules[Math.min(mi + 1, d.modules.length - 1)].key}/0`} replace />;
  const si = Math.min(Math.max(Number(step) || 0, 0), steps.length - 1);
  const s = steps[si];
  const isLast = si === steps.length - 1;
  const needsPersonas = m.questions.some((q) => q.per_persona) && priorityPersonas(d).length === 0;

  const next = () => {
    if (!isLast) nav(`/p/${d.project.id}/m/${m.key}/${si + 1}`);
    else if (mi < d.modules.length - 1) nav(`/p/${d.project.id}/m/${d.modules[mi + 1].key}/0`);
    else nav(`/p/${d.project.id}/connections`);
  };
  const back = () => {
    if (si > 0) nav(`/p/${d.project.id}/m/${m.key}/${si - 1}`);
    else if (mi > 0) { const pm = d.modules[mi - 1]; nav(`/p/${d.project.id}/m/${pm.key}/${Math.max(0, stepsFor(d, pm).length - 1)}`); }
  };
  const persona = s.kind === 'question' ? s.persona : null;
  const offer = s.kind === 'question' ? s.offer : null;
  const heading = s.kind === 'question' && s.question.heading_template ? fill(s.question.heading_template, offer, persona) : null;

  return (
    <div className="focus">
      <ProgressStrip current={m.key} chapter={mi + 1} title={m.title} />
      <main id="main" className="focus-main">
        {si === 0 && mi === 0 && <ClarificationBanner />}
        <p className="eyebrow">Step {si + 1} of {steps.length}{offer ? <> &middot; {offer.name}</> : null}{persona ? <> &middot; {persona.role_title}</> : null}</p>
        <h1 ref={headingRef} tabIndex={-1} className="chapter-title">{m.title}</h1>
        {si === 0 ? <p className="why">{m.why}{m.opening ? <><br />{m.opening}</> : null}</p> : <p className="why-short">{m.why}</p>}
        {m.key === 'customer_company' && si === 0 && <Definitions />}
        {['customer_personas', 'problems', 'solution', 'success', 'nothing_changes'].includes(m.key) && si === 0 && <Definitions compact />}
        {needsPersonas && si === 0 && (
          <p className="notice">Questions for each persona appear here after you add personas in <Link to={`/p/${d.project.id}/m/customer_personas/0`}>Your customer personas</Link>.</p>
        )}
        {s.kind === 'question' && s.question.part_label && <p className="part-label">{s.question.part_label}</p>}
        {heading && <h2 className="persona-heading">{heading}</h2>}
        {s.kind === 'question' && CONTEXT[s.question.key] && <ContextBox persona={persona} show={CONTEXT[s.question.key]} />}

        {s.kind === 'fields'
          ? s.questions.map((q) => <QuestionEditor key={q.id} q={q} offer={null} persona={null} compact />)
          : s.question.kind === 'offer_list' ? <OffersEditor q={s.question} />
          : s.question.kind === 'customer_groups' ? <GroupsEditor q={s.question} />
          : s.question.kind === 'personas' ? <PersonasEditor q={s.question} />
          : s.question.kind === 'solution_links' ? <LinksEditor key={`${s.question.id}-${persona?.id}`} q={s.question} persona={persona} />
          : s.question.kind === 'persona_fields' ? <PersonaFields q={s.question} />
          : <>
              <QuestionEditor key={`${s.question.id}-${offer?.id}-${persona?.id}`} q={s.question} offer={offer} persona={persona} />
              <Probes key={`p-${s.question.id}-${offer?.id}-${persona?.id}`} core={s.question} probes={s.probes} offer={offer} persona={persona} />
            </>}

        {isLast && <ModuleAttachments moduleKey={m.key} />}

        <div className="nav-row sticky">
          <button className="secondary" onClick={back} disabled={mi === 0 && si === 0}>Back</button>
          <span className="small muted nav-hint">Your answers save as you type.</span>
          <button onClick={next}>{isLast && mi === d.modules.length - 1 ? 'Check the connection' : 'Continue'}</button>
        </div>
      </main>
    </div>
  );
}

// Overall progress across every question screen, with a rough time estimate.
function useOverallProgress() {
  const { d } = useDiscovery();
  const all = d.modules.flatMap((mod) => stepsFor(d, mod).filter((x) => x.kind === 'question'));
  const done = all.filter((x) => stepDone(d, x)).length;
  const left = all.length - done;
  // Most screens take about a minute; rounded so the estimate doesn't flicker.
  const mins = Math.max(5, Math.round(left / 5) * 5);
  const time = mins >= 60 ? `About ${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ''} left` : `About ${mins} min left`;
  return { pct: all.length ? Math.round((done / all.length) * 100) : 0, left, label: left === 0 ? 'All questions answered' : time };
}

// A slim strip above the question: where you are, how far along, and the full chapter list in a drawer.
function ProgressStrip({ current, chapter, title }: { current: string; chapter: number; title: string }) {
  const { d } = useDiscovery();
  const p = useOverallProgress();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { setOpen(false); }, [current]);
  return (
    <>
      <div className="progress-strip">
        <button ref={btn} type="button" className="chapters-toggle" aria-expanded={open} aria-controls="chapter-drawer" onClick={() => setOpen(true)}>
          <span className="burger" aria-hidden="true" />Chapters
        </button>
        <span className="strip-where"><strong><span className="strip-long">Chapter </span>{chapter} of {d.modules.length}</strong><span className="strip-title"> &middot; {title}</span></span>
        <span className="strip-left">{p.label}</span>
      </div>
      <div className="progress-bar" role="progressbar" aria-label="Discovery progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct}><span style={{ width: `${p.pct}%` }} /></div>
      {open && (
        <div className="drawer-wrap" onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); btn.current?.focus(); } }}>
          <div className="drawer" id="chapter-drawer" role="dialog" aria-modal="true" aria-label="All chapters" ref={panel}>
            <div className="drawer-head">
              <p className="eyebrow" style={{ margin: 0 }}>{p.pct}% complete</p>
              <button type="button" className="quiet" onClick={() => { setOpen(false); btn.current?.focus(); }}>Close</button>
            </div>
            <ChapterMap current={current} />
          </div>
        </div>
      )}
    </>
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
function Probes({ core, probes, offer, persona }: { core: Question; probes: Question[]; offer: FocusOffer | null; persona: Persona | null }) {
  const { d } = useDiscovery();
  if (!probes.length) return null;
  const coreAnswered = hasContent(findAnswer(d, core.id, offer?.id ?? null, persona?.id ?? null));
  const always = probes.filter((p) => p.probe_always);
  const optional = probes.filter((p) => !p.probe_always);
  const anyAnswered = optional.some((p) => hasContent(findAnswer(d, p.id, offer?.id ?? null, persona?.id ?? null)));
  return (
    <>
      {always.map((p) => <QuestionEditor key={`${p.id}-${offer?.id}-${persona?.id}`} q={p} offer={offer} persona={persona} compact />)}
      {optional.length > 0 && (coreAnswered || anyAnswered) && (
        <details className="card" open={anyAnswered}>
          <summary>Optional: a few questions to go further</summary>
          <p className="small muted" style={{ marginTop: '0.75rem' }}>Answer any that are useful. Skip the rest.</p>
          {optional.map((p) => <QuestionEditor key={`${p.id}-${offer?.id}-${persona?.id}`} q={p} offer={offer} persona={persona} compact />)}
        </details>
      )}
    </>
  );
}

const filled = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null);

// An earlier answer that may already cover this question: one from this discovery, or from a question an update retired.
function useReuse(q: Question) {
  const { d } = useDiscovery();
  for (const k of q.reuse_from ?? []) {
    const src = d.modules.flatMap((mm) => mm.questions).find((x) => x.key === k);
    const a = src ? d.answers.find((x) => x.question_id === src.id && typeof x.value === 'string' && (x.value as string).trim()) : undefined;
    if (src && a) return { key: k, prompt: src.prompt, text: a.value as string };
    const e = d.earlierAnswers.find((x) => x.question_key === k && typeof x.value === 'string' && (x.value as string).trim());
    if (e) return { key: k, prompt: fill(e.prompt, e.offer_name ? { id: '', name: e.offer_name, availability: null } : null), text: e.value as string };
  }
  return null;
}

function QuestionEditor({ q, offer, persona, compact }: { q: Question; offer: FocusOffer | null; persona: Persona | null; compact?: boolean }) {
  const { d, patchAnswer } = useDiscovery();
  const offerId = q.per_offer && d.focusOffers.length ? offer?.id ?? null : null;
  const personaId = q.per_persona ? persona?.id ?? null : null;
  const existing = findAnswer(d, q.id, offerId, personaId);
  const initial: Draft = { value: existing?.value ?? null, status: existing?.status ?? 'empty', contextNote: existing?.context_note ?? null, evidenceStatus: existing?.evidence_status ?? null, reusedFromKey: existing?.reused_from_key ?? null };
  const onSaved = useCallback((rev: number, dr: Draft) => patchAnswer({ questionId: q.id, offerId, personaId, revision: rev, value: dr.value, status: dr.status, contextNote: dr.contextNote, evidenceStatus: dr.evidenceStatus ?? null, reusedFromKey: dr.reusedFromKey ?? null }), [patchAnswer, q.id, offerId, personaId]);
  const { draft, setDraft, status, error, flush, retry } = useAutosave(d.project.id, q.key, offerId, personaId, initial, existing?.revision ?? 0, onSaved);
  const [reuseDismissed, setReuseDismissed] = useState(false);
  const [ask, setAsk] = useState(0);
  const wantsFollowups = q.kind === 'core' && q.input_type === 'long_text';
  // After the client finishes an answer (leaves the box), save it, then see whether one more detail would help.
  const doneEditing = async () => { await flush(); if (wantsFollowups) setAsk((n) => n + 1); };
  const found = useReuse(q);
  const id = `q-${q.key}${offerId ? `-${offerId.slice(0, 8)}` : ''}${personaId ? `-${personaId.slice(0, 8)}` : ''}`;
  const helpId = q.help_text ? `${id}-help` : undefined;
  const prompt = renderPrompt(q, offer, persona);
  const special = draft.status === 'not_sure' || draft.status === 'discuss' || draft.status === 'not_applicable';

  const setValue = (value: unknown, immediate = false) => {
    const st = special && draft.status !== 'not_applicable' ? draft.status : filled(value) ? 'answered' : 'empty';
    setDraft({ ...draft, value, status: st, reusedFromKey: null }, immediate);
  };
  const toggle = (st: 'not_sure' | 'discuss' | 'not_applicable') => {
    setDraft({ ...draft, status: draft.status === st ? (filled(draft.value) ? 'answered' : 'empty') : st }, true);
  };
  const reuse = !reuseDismissed && !filled(draft.value) && draft.status === 'empty' ? found : null;

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
        onChange={(e) => setValue(e.target.value)} onBlur={() => { void doneEditing(); }} disabled={draft.status === 'not_applicable'} />;
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
          <p className="small" style={{ marginBottom: '0.4rem' }}><strong>You may have answered this already.</strong> Earlier, for "{reuse.prompt}", you wrote:</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{reuse.text}</p>
          <button type="button" className="quiet" onClick={() => setDraft({ ...draft, value: reuse.text, status: 'answered', reusedFromKey: reuse.key }, true)}>Yes, use this</button>{' '}
          <button type="button" className="quiet" onClick={() => setReuseDismissed(true)}>I'll answer again</button>
        </div>
      )}
      {draft.reusedFromKey && <p className="small muted">Copied from an earlier answer at your request. Edit it if anything is different here.</p>}
      {input}
      {q.asks_evidence && filled(draft.value) && draft.status === 'answered' && (
        <fieldset className="evidence">
          <legend>How do you know this? <span className="muted">(optional)</span></legend>
          <div className="chips">
            {EVIDENCE_OPTIONS.map((o) => (
              <button key={o.value} type="button" className="chip" aria-pressed={draft.evidenceStatus === o.value}
                onClick={() => setDraft({ ...draft, evidenceStatus: draft.evidenceStatus === o.value ? null : o.value }, true)}>{o.label}</button>
            ))}
          </div>
        </fieldset>
      )}
      {(q.allow_not_sure || q.allow_not_applicable) && (
        <div className="alt-actions">
          {q.allow_not_sure && <button type="button" className="quiet" aria-pressed={draft.status === 'not_sure'} onClick={() => toggle('not_sure')}>I'm not sure yet</button>}
          {q.kind === 'core' && q.allow_not_sure && <button type="button" className="quiet" aria-pressed={draft.status === 'discuss'} onClick={() => toggle('discuss')}>Discuss with Rishari</button>}
          {q.allow_not_applicable && <button type="button" className="quiet" aria-pressed={draft.status === 'not_applicable'} onClick={() => toggle('not_applicable')}>{q.na_label ?? 'Not applicable'}</button>}
        </div>
      )}
      <SaveIndicator status={status} error={error} onRetry={retry} />
      {wantsFollowups && draft.status === 'answered' && <FollowupBox pid={d.project.id} questionKey={q.key} offerId={offerId} personaId={personaId} ask={ask} />}
    </div>
  );
}

// One textarea per priority persona: "What does each relevant persona need to do?"
function PersonaFields({ q }: { q: Question }) {
  const { d } = useDiscovery();
  const ps = priorityPersonas(d);
  return (
    <div className="field">
      <h2 className="question-prompt">{q.prompt}</h2>
      {q.help_text && <p className="help">{q.help_text}</p>}
      {ps.length === 0 && <p className="muted">Add personas first in <Link to={`/p/${d.project.id}/m/customer_personas/0`}>Your customer personas</Link>.</p>}
      {ps.map((p) => <QuestionEditor key={`${q.id}-${p.id}`} q={{ ...q, prompt: p.role_title, per_persona: true, input_type: 'long_text', help_text: null }} offer={null} persona={p} compact />)}
    </div>
  );
}

function GroupsEditor({ q }: { q: Question }) {
  const { d, reload } = useDiscovery();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const found = useReuse(q);
  const groups = d.customerGroups;
  return (
    <div className="field">
      <h2 className="question-prompt">{q.prompt}</h2>
      {q.help_text && <p className="help">{q.help_text}</p>}
      {found && !groups.length && <div className="card" style={{ background: 'var(--grey)', border: 0 }}><p className="small" style={{ marginBottom: '0.3rem' }}><strong>You may have answered this already.</strong> Earlier, for "{found.prompt}", you wrote:</p><p style={{ whiteSpace: 'pre-wrap', marginBottom: '0.5rem' }}>{found.text}</p><button type="button" className="quiet" onClick={() => setName(found.text.slice(0, 300))}>Use this as a starting point</button></div>}
      {groups.length > 0 && (
        <fieldset className="field">
          <legend>Which type should we focus on first?</legend>
          <div className="choices">
            {groups.map((g: CustomerGroup) => (
              <div key={g.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <label className="choice" style={{ flex: 1 }}>
                  <input type="radio" name="priority-group" checked={g.is_priority} onChange={async () => { await api(`/api/projects/${d.project.id}/customer-groups/${g.id}`, { method: 'PUT', json: { name: g.name, isPriority: true } }); await reload(); }} />
                  <span>{g.name}{g.is_priority && <span className="tag">Focus first</span>}</span>
                </label>
                <button type="button" className="link small" onClick={async () => { await api(`/api/projects/${d.project.id}/customer-groups/${g.id}`, { method: 'DELETE' }); await reload(); }}>Remove</button>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      <form onSubmit={async (e) => {
        e.preventDefault(); setErr('');
        try { await api(`/api/projects/${d.project.id}/customer-groups`, { method: 'POST', json: { name: name.trim() } }); setName(''); await reload(); }
        catch (x) { setErr((x as Error).message); }
      }}>
        <label htmlFor="cg-name" className="sr-only">Type of customer company</label>
        <input id="cg-name" type="text" value={name} placeholder={groups.length ? 'Add another type of customer company' : 'For example: small accounting firms'} onChange={(e) => setName(e.target.value)} />
        <p style={{ marginTop: '0.6rem' }}><button type="submit" className="secondary" disabled={!name.trim()}>Add</button></p>
        {err && <p className="notice" role="alert">{err}</p>}
      </form>
    </div>
  );
}

const roleLabel = (r: string) => PURCHASE_ROLES.find((o) => o.value === r)?.label ?? r;

function PersonasEditor({ q }: { q: Question }) {
  const { d, reload } = useDiscovery();
  const [editing, setEditing] = useState<Partial<Persona> | null>(d.personas.length ? null : { role_title: '', purchase_roles: [] });
  return (
    <div className="field">
      <h2 className="question-prompt">{q.prompt}</h2>
      {q.help_text && <p className="help">{q.help_text}</p>}
      {d.personas.map((p) => editing?.id === p.id ? null : (
        <div className="card" key={p.id}>
          <h3>{p.role_title}{!p.is_priority && <span className="tag">Not a priority</span>}{p.needs_confirmation && <span className="tag warn">Please confirm</span>}</h3>
          {p.needs_confirmation && <p className="small">We carried this persona over from your earlier answers. Open it, check it, and save to confirm.</p>}
          <p className="small muted">{p.purchase_roles.map(roleLabel).join(' · ') || 'No part in the purchase chosen yet'}</p>
          {p.responsibility && <p className="small"><strong>Responsible for:</strong> {p.responsibility}</p>}
          {p.goal && <p className="small"><strong>Trying to achieve:</strong> {p.goal}</p>}
          {p.problem && <p className="small"><strong>Problem:</strong> {p.problem}</p>}
          <button className="quiet" onClick={() => setEditing(p)}>{p.needs_confirmation ? 'Check and confirm' : 'Edit'}</button>{' '}
          <button className="quiet" onClick={async () => { await api(`/api/projects/${d.project.id}/personas/${p.id}`, { method: 'DELETE' }); await reload(); }}>Remove</button>
        </div>
      ))}
      {editing
        ? <PersonaForm persona={editing} onDone={async () => { setEditing(null); await reload(); }} />
        : <button className="secondary" onClick={() => setEditing({ role_title: '', purchase_roles: [] })}>Add a persona</button>}
    </div>
  );
}

function PersonaForm({ persona, onDone }: { persona: Partial<Persona>; onDone: () => void }) {
  const { d } = useDiscovery();
  const [f, setF] = useState({ role_title: persona.role_title ?? '', responsibility: persona.responsibility ?? '', purchase_roles: persona.purchase_roles ?? [], goal: persona.goal ?? '', problem: persona.problem ?? '', is_priority: persona.is_priority ?? true, evidence_status: persona.evidence_status ?? '' });
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [err, setErr] = useState('');
  const field = (k: 'role_title' | 'responsibility' | 'goal' | 'problem', label: string, long = true) => (
    <div className="field">
      <label htmlFor={`pf-${k}`}>{label}</label>
      {long ? <textarea id={`pf-${k}`} rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        : <input id={`pf-${k}`} type="text" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
    </div>
  );
  return (
    <form className="card" onSubmit={async (e) => {
      e.preventDefault(); setStatus('saving'); setErr('');
      const body = { roleTitle: f.role_title.trim(), responsibility: f.responsibility || null, purchaseRoles: f.purchase_roles, goal: f.goal || null, problem: f.problem || null, isPriority: f.is_priority, evidenceStatus: f.evidence_status || null };
      try { await api(`/api/projects/${d.project.id}/personas${persona.id ? `/${persona.id}` : ''}`, { method: persona.id ? 'PUT' : 'POST', json: body }); setStatus('saved'); onDone(); }
      catch (x) { setStatus('failed'); setErr((x as Error).message); }
    }}>
      {field('role_title', "What is this persona's role or job title?", false)}
      {field('responsibility', 'What are they responsible for?')}
      <fieldset className="field">
        <legend>How are they involved in the purchase? Choose all that apply.</legend>
        <div className="choices">
          {PURCHASE_ROLES.map((r) => (
            <label key={r.value} className="choice">
              <input type="checkbox" checked={f.purchase_roles.includes(r.value)} onChange={(e) => setF({ ...f, purchase_roles: e.target.checked ? [...f.purchase_roles, r.value] : f.purchase_roles.filter((x) => x !== r.value) })} />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {field('goal', 'What are they trying to achieve?')}
      {field('problem', 'What problem makes that difficult?')}
      <div className="field">
        <label htmlFor="pf-ev">How do you know this? (optional)</label>
        <select id="pf-ev" value={f.evidence_status} onChange={(e) => setF({ ...f, evidence_status: e.target.value })} style={{ maxWidth: '20rem' }}>
          <option value="">Choose one</option>
          {EVIDENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <label className="choice" style={{ marginBottom: '1rem' }}><input type="checkbox" checked={f.is_priority} onChange={(e) => setF({ ...f, is_priority: e.target.checked })} /><span>Focus on this persona now. We'll ask a few more questions about them.</span></label>
      <SaveIndicator status={status} error={err} />
      <button type="submit" disabled={!f.role_title.trim() || status === 'saving'}>Save persona</button>{' '}
      <button type="button" className="secondary" onClick={onDone}>Cancel</button>
    </form>
  );
}

// Connections from a problem to the products or services that address it. Many to many; "nothing fits" is allowed.
function LinksEditor({ q, persona }: { q: Question; persona: Persona | null }) {
  const { d, reload } = useDiscovery();
  const links = d.links.filter((l) => (l.persona_id ?? null) === (persona?.id ?? null));
  const [editing, setEditing] = useState<Partial<SolutionLink> | null>(links.length ? null : { fit: 'direct' });
  const offerName = (id: string | null) => d.offers.find((o) => o.id === id)?.name;
  const company = !persona;
  return (
    <div className="field">
      <h2 className="question-prompt">{q.prompt}</h2>
      {q.help_text && <p className="help">{q.help_text}</p>}
      {d.offers.length === 0 && <p className="notice">List your products and services first in <Link to={`/p/${d.project.id}/m/offers/0`}>Your products and services</Link>.</p>}
      {links.map((l) => editing?.id === l.id ? null : (
        <div className="card" key={l.id}>
          <h3>{offerName(l.offer_id) ?? FIT_OPTIONS.find((f) => f.value === l.fit)?.label}<span className="tag">{FIT_OPTIONS.find((f) => f.value === l.fit)?.label}</span></h3>
          {l.capability && <p className="small"><strong>{company ? 'What it does:' : 'Part that addresses their problem:'}</strong> {l.capability}</p>}
          {l.how_it_helps && <p className="small"><strong>{company ? 'How it addresses the problem:' : 'How it changes the way they work:'}</strong> {l.how_it_helps}</p>}
          {l.benefit && <p className="small"><strong>Intended benefit:</strong> {l.benefit}</p>}
          {l.out_of_scope && <p className="small"><strong>Outside its scope:</strong> {l.out_of_scope}</p>}
          <button className="quiet" onClick={() => setEditing(l)}>Edit</button>{' '}
          <button className="quiet" onClick={async () => { await api(`/api/projects/${d.project.id}/links/${l.id}`, { method: 'DELETE' }); await reload(); }}>Remove</button>
        </div>
      ))}
      {editing
        ? <LinkForm link={editing} persona={persona} onDone={async () => { setEditing(null); await reload(); }} />
        : <button className="secondary" onClick={() => setEditing({ fit: 'direct' })}>{links.length ? 'Add another connection' : 'Add a connection'}</button>}
    </div>
  );
}

function LinkForm({ link, persona, onDone }: { link: Partial<SolutionLink>; persona: Persona | null; onDone: () => void }) {
  const { d } = useDiscovery();
  const company = !persona;
  const [f, setF] = useState({ offer_id: link.offer_id ?? '', fit: link.fit ?? 'direct', capability: link.capability ?? '', how_it_helps: link.how_it_helps ?? '', benefit: link.benefit ?? '', out_of_scope: link.out_of_scope ?? '', evidence_status: link.evidence_status ?? '' });
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [err, setErr] = useState('');
  const noOffer = f.fit === 'none';
  const chosen = d.offers.find((o) => o.id === f.offer_id);
  const area = (k: 'capability' | 'how_it_helps' | 'benefit' | 'out_of_scope', label: string) => (
    <div className="field"><label htmlFor={`lf-${k}`}>{label}</label><textarea id={`lf-${k}`} rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <form className="card" onSubmit={async (e) => {
      e.preventDefault(); setStatus('saving'); setErr('');
      const body = { personaId: persona?.id ?? null, offerId: noOffer ? null : f.offer_id || null, fit: f.fit, capability: f.capability || null, howItHelps: f.how_it_helps || null, benefit: f.benefit || null, outOfScope: f.out_of_scope || null, evidenceStatus: f.evidence_status || null };
      try { await api(`/api/projects/${d.project.id}/links${link.id ? `/${link.id}` : ''}`, { method: link.id ? 'PUT' : 'POST', json: body }); setStatus('saved'); onDone(); }
      catch (x) { setStatus('failed'); setErr((x as Error).message); }
    }}>
      <div className="field">
        <label htmlFor="lf-fit">How well does it fit?</label>
        <select id="lf-fit" value={f.fit} onChange={(e) => setF({ ...f, fit: e.target.value })} style={{ maxWidth: '22rem' }}>
          {FIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {!noOffer && (
        <div className="field">
          <label htmlFor="lf-offer">{company ? 'Which product or service addresses this company problem?' : 'Which product or service helps this persona?'}</label>
          <select id="lf-offer" value={f.offer_id} onChange={(e) => setF({ ...f, offer_id: e.target.value })} style={{ maxWidth: '22rem' }}>
            <option value="">{f.fit === 'unknown' ? 'Not sure yet' : 'Choose one'}</option>
            {d.offers.map((o) => <option key={o.id} value={o.id}>{o.name}{o.availability === 'planned' ? ' (planned)' : ''}</option>)}
          </select>
          {chosen?.availability === 'planned' && f.fit !== 'planned' && <p className="small" style={{ marginTop: '0.4rem' }}>This one is planned. Choose "Planned, not available yet" above so we don't describe it as available.</p>}
        </div>
      )}
      {!noOffer && (company ? <>
        {area('capability', 'What does it do?')}
        {area('how_it_helps', 'How does that address the problem?')}
        {area('out_of_scope', 'What is outside its scope?')}
      </> : <>
        {area('capability', 'Which part of it addresses their problem?')}
        {area('how_it_helps', 'How does that change the way they work?')}
        {area('benefit', 'What benefit is this intended to create for them?')}
      </>)}
      {noOffer && <p className="small muted">That's useful to know. We'll note that nothing you offer fits this {company ? 'problem' : 'persona'} directly yet.</p>}
      {!noOffer && (
        <div className="field">
          <label htmlFor="lf-ev">How do you know this? (optional)</label>
          <select id="lf-ev" value={f.evidence_status} onChange={(e) => setF({ ...f, evidence_status: e.target.value })} style={{ maxWidth: '20rem' }}>
            <option value="">Choose one</option>
            {EVIDENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
      {err && <p className="notice" role="alert">{err}</p>}
      <SaveIndicator status={status} error={undefined} />
      <button type="submit" disabled={status === 'saving' || (!noOffer && f.fit !== 'unknown' && !f.offer_id)}>Save connection</button>{' '}
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
      {d.offers.length === 0 && !editing && <p className="muted">Nothing added yet.</p>}
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
      {editing ? <OfferForm offer={editing} onDone={async () => { setEditing(null); await reload(); }} /> : <button className="secondary" onClick={() => setEditing(emptyOffer)}>Add a product or service</button>}
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
      {txt('name', 'Name of the product or service')}
      {txt('description', 'Describe it in plain words', true)}
      {txt('intended_customer', 'Who is it for?')}
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
      <button type="submit" disabled={!f.name.trim() || status === 'saving'}>Save</button>{' '}
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
