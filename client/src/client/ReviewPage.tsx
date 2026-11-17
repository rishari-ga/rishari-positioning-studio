import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CONFIRMATION } from '@shared/content';
import { api } from '../api';
import { findAnswer } from '../api';
import type { Answer, Question, Discovery, Module, FocusOffer } from '../api';
import { renderPrompt, EVIDENCE_OPTIONS, PURCHASE_ROLES, FIT_OPTIONS } from '@shared/narrative';
import { priorityPersonas } from '../api';
import { ChapterSummary } from './Followups';
import type { Persona } from '../api';
import { useDiscovery } from './ProjectRoutes';
import { ChapterMap, SaveIndicator, stepIndexFor, ClarificationBanner } from './ModulePage';
import type { SaveStatus } from './useAutosave';

const STATUS_LABEL: Record<string, string> = { not_sure: 'Not sure yet', discuss: 'Discuss with Rishari', not_applicable: 'Not applicable' };
export const evidenceLabel = (v: string | null) => EVIDENCE_OPTIONS.find((o) => o.value === v)?.label ?? null;

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
        <ClarificationBanner />
        {d.submissions.length > 0 && <p className="ok">You submitted version {d.submissions[0].version} on {new Date(d.submissions[0].created_at).toLocaleDateString()}. Submitting again creates a new version. The earlier one is kept.</p>}

        {d.modules.map((m) => {
          const prog = d.progress.find((p) => p.module_id === m.id);
          return (
            <section key={m.id} className="card" aria-labelledby={`rv-${m.key}`}>
              <h2 id={`rv-${m.key}`}>{m.title}</h2>
              <ChapterSummary pid={d.project.id} moduleKey={m.key} />
              <ModuleAnswers d={d} m={m} linkBase={`/p/${d.project.id}`} />
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
          <div className="card" style={{ background: 'var(--grey)', border: 0, borderRadius: 'var(--radius-md)' }}>
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
    <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: '1rem' }}>
      <button type="button" className="quiet" aria-pressed={marked} onClick={() => save({ markedForDiscussion: !marked })}>
        {marked ? 'Marked for discussion' : 'Mark for discussion'}
      </button>
      <div className="field" style={{ marginTop: '1rem', marginBottom: 0 }}>
        <label htmlFor={`corr-${moduleKey}`}>Anything to correct in our summary, or to add for this chapter? (optional)</label>
        <textarea id={`corr-${moduleKey}`} rows={2} className="short" value={text} onChange={(e) => setText(e.target.value)}
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

// Original answers for one chapter: company questions, then each focus offer, then each priority persona.
// Shared by the client review and the admin view.
export function ModuleAnswers({ d, m, linkBase }: { d: Discovery; m: Module; linkBase?: string }) {
  const personas = priorityPersonas(d);
  const company = m.questions.filter((q) => !q.per_persona && (!q.per_offer || !d.focusOffers.length) && !(q.kind === 'solution_links' && q.per_persona));
  const companyQs = company.filter((q) => !(q.kind === 'solution_links' && q.key === 'sl_persona'));
  const perOffer = d.focusOffers.length ? m.questions.filter((q) => q.per_offer && !q.per_persona) : [];
  const perPersona = m.questions.filter((q) => q.per_persona || q.key === 'sl_persona');
  const offerName = (id: string | null) => d.offers.find((o) => o.id === id)?.name;
  const linkList = (personaId: string | null) => {
    const ls = d.links.filter((l) => (l.persona_id ?? null) === personaId);
    return ls.length ? ls.map((l) => (
      <div key={l.id} style={{ marginBottom: '0.5rem' }}>
        <strong>{offerName(l.offer_id) ?? FIT_OPTIONS.find((f) => f.value === l.fit)?.label}</strong> <span className="tag">{FIT_OPTIONS.find((f) => f.value === l.fit)?.label}</span>
        {l.capability && <div className="small">{l.capability}</div>}
        {l.how_it_helps && <div className="small">How: {l.how_it_helps}</div>}
        {l.benefit && <div className="small">Intended benefit: {l.benefit}</div>}
        {l.out_of_scope && <div className="small muted">Outside its scope: {l.out_of_scope}</div>}
        {l.evidence_status && <span className="tag">{evidenceLabel(l.evidence_status)}</span>}
      </div>
    )) : <p className="muted">Not connected yet.</p>;
  };
  const block = (q: Question, offer: FocusOffer | null, persona: Persona | null) => {
    const key = `${q.id}-${offer?.id}-${persona?.id}`;
    if (q.kind === 'offer_list') {
      return (
        <div className="answer-block" key={key}>
          <p className="q">{q.prompt}</p>
          {d.offers.length ? <ul className="squares">{d.offers.map((o) => <li key={o.id}>{o.name}{o.availability ? ` (${o.availability})` : ''}</li>)}</ul> : <p className="muted">No products or services listed.</p>}
        </div>
      );
    }
    if (q.kind === 'customer_groups') {
      return (
        <div className="answer-block" key={key}>
          <p className="q">{q.prompt}</p>
          {d.customerGroups.length ? <ul className="squares">{d.customerGroups.map((g) => <li key={g.id}>{g.name}{g.is_priority && <span className="tag">Focus first</span>}</li>)}</ul> : <p className="muted">Not answered.</p>}
        </div>
      );
    }
    if (q.kind === 'personas') {
      return (
        <div className="answer-block" key={key}>
          <p className="q">{q.prompt}</p>
          {d.personas.length ? d.personas.map((p) => (
            <div key={p.id} style={{ marginBottom: '0.6rem' }}>
              <strong>{p.role_title}</strong> <span className="small muted">{p.purchase_roles.map((r) => PURCHASE_ROLES.find((o) => o.value === r)?.label ?? r).join(', ')}</span>
              {!p.is_priority && <span className="tag">Not a priority</span>}{p.needs_confirmation && <span className="tag warn">Needs confirming</span>}
              {p.responsibility && <div className="small">Responsible for: {p.responsibility}</div>}
              {p.goal && <div className="small">Trying to achieve: {p.goal}</div>}
              {p.problem && <div className="small">Problem: {p.problem}</div>}
              {p.evidence_status && <span className="tag">{evidenceLabel(p.evidence_status)}</span>}
            </div>
          )) : <p className="muted">No personas yet.</p>}
        </div>
      );
    }
    if (q.kind === 'solution_links') return <div className="answer-block" key={key}><p className="q">{renderPrompt(q, offer, persona)}</p>{linkList(persona?.id ?? null)}</div>;
    if (q.kind === 'persona_fields') {
      return (
        <div className="answer-block" key={key}>
          <p className="q">{q.prompt}</p>
          {personas.map((p) => { const a = findAnswer(d, q.id, null, p.id); return <div key={p.id} className="small"><strong>{p.role_title}:</strong> {formatValue(q, a) ?? <span className="muted">Not answered.</span>}</div>; })}
        </div>
      );
    }
    const a = findAnswer(d, q.id, offer?.id ?? null, persona?.id ?? null);
    if (q.kind === 'probe' && (!a || a.status === 'empty')) return null;
    const text = formatValue(q, a);
    const at = linkBase ? stepIndexFor(d, q.key, offer?.id ?? null, persona?.id ?? null) : null;
    return (
      <div className="answer-block" key={key} style={q.kind === 'probe' ? { paddingLeft: '1rem' } : undefined}>
        <p className="q">{renderPrompt(q, offer, persona)}
          {a && STATUS_LABEL[a.status] && <span className="tag warn">{STATUS_LABEL[a.status]}</span>}
          {a?.evidence_status && <span className="tag">{evidenceLabel(a.evidence_status)}</span>}
          {a?.reused_from_key && <span className="tag">From an earlier answer</span>}
        </p>
        {text ? <p className="a">{text}</p> : a?.status === 'not_applicable' ? null : <p className="muted">Not answered.</p>}
        {at && <Link className="small" to={`${linkBase}/m/${at.moduleKey}/${at.index}`}>Return to this answer</Link>}
      </div>
    );
  };
  return (
    <>
      {companyQs.map((q) => block(q, null, null))}
      {d.focusOffers.map((o) => perOffer.length > 0 && (
        <div key={o.id} style={{ marginTop: '1rem' }}>
          <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>{o.name}{o.availability === 'planned' ? ' (planned)' : ''}</p>
          {perOffer.map((q) => block(q, o, null))}
        </div>
      ))}
      {perPersona.length > 0 && personas.map((p) => (
        <div key={p.id} style={{ marginTop: '1rem' }}>
          <p className="eyebrow" style={{ marginBottom: '0.25rem' }}>Persona: {p.role_title}</p>
          {perPersona.map((q) => block(q, null, p))}
        </div>
      ))}
    </>
  );
}
