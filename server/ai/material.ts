import { buildSourceBrief, EVIDENCE_OPTIONS, FIT_OPTIONS, PURCHASE_ROLES, type Content } from '../../shared/narrative.js';

const ev = (v: string | null) => (v ? EVIDENCE_OPTIONS.find((o) => o.value === v)?.label ?? v : null);
export const valueText = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' && 'text' in x ? `${(x as { text: string }).text}${'label' in x ? ` (${(x as { label: string }).label})` : ''}` : JSON.stringify(x))).join('; ');
  return JSON.stringify(v);
};
const STATUS: Record<string, string> = { not_sure: 'Not sure yet', discuss: 'Wants to discuss with Rishari', not_applicable: 'Not applicable' };

// Every answer in a snapshot as plain text, each line tagged with its question key in square brackets
// so AI output can point back to the exact source. Unanswered questions are listed as such.
export function materialText(c: Content, opts: { company: string; includeBrief?: boolean; version?: number } = { company: '' }): string {
  const out: string[] = [];
  const persona = (id: string | null | undefined) => (id ? c.personas?.find((p) => p.id === id)?.role_title : null);
  const offer = (id: string | null | undefined) => (id ? c.offers.find((o) => o.id === id)?.name : null);
  out.push(`Company: ${opts.company}`);
  out.push(`In-scope offers: ${c.focusOffers.map((o) => `${o.name}${o.availability === 'planned' ? ' (planned, not available yet)' : ''}`).join('; ') || 'None marked'}`);
  out.push(`All offers listed: ${c.offers.map((o) => `${o.name}${o.availability ? ` (${o.availability})` : ''}`).join('; ') || 'None'}`);
  if (c.customerGroups?.length) out.push(`Customer company types: ${c.customerGroups.map((g) => `${g.name}${g.is_priority ? ' (focus first)' : ''}`).join('; ')}`);
  for (const p of c.personas ?? []) {
    out.push(`Persona "${p.role_title}"${p.is_priority ? ' (priority)' : ''}: roles ${p.purchase_roles.map((r) => PURCHASE_ROLES.find((x) => x.value === r)?.label ?? r).join(', ') || 'not given'}; goal: ${p.goal ?? 'not given'}; problem: ${p.problem ?? 'not given'}${p.evidence_status ? ` [${ev(p.evidence_status)}]` : ''}`);
  }
  for (const l of c.links ?? []) {
    out.push(`Connection for ${persona(l.persona_id) ?? 'the customer company'}: ${offer(l.offer_id) ?? 'no offer'} (${FIT_OPTIONS.find((f) => f.value === l.fit)?.label ?? l.fit}); what: ${l.capability ?? '-'}; how: ${l.how_it_helps ?? '-'}; benefit: ${l.benefit ?? '-'}${l.out_of_scope ? `; outside scope: ${l.out_of_scope}` : ''}`);
  }
  out.push('', 'Answers:');
  for (const m of c.modules) {
    for (const e of m.answers) {
      const scope = [offer(e.offerId), persona(e.personaId)].filter(Boolean).join(', ');
      const v = valueText(e.value).trim();
      const st = STATUS[e.status];
      if (!v && !st) continue;
      out.push(`[${e.questionKey}${scope ? ` | ${scope}` : ''}] ${e.prompt}\n  ${v || ''}${st ? ` (${st})` : ''}${e.evidenceStatus ? ` [${ev(e.evidenceStatus)}]` : ''}`);
      for (const f of (c.followups ?? []).filter((x) => x.questionKey === e.questionKey && (x.offerId ?? null) === (e.offerId ?? null) && (x.personaId ?? null) === (e.personaId ?? null))) {
        out.push(`  Follow-up ${f.round}: ${f.question}\n  ${f.answer?.trim() || STATUS[f.status] || 'Skipped'}`);
      }
    }
  }
  for (const s of c.summaries ?? []) if (s.clientCorrection) out.push(`Client correction to the "${s.moduleKey}" summary: ${s.clientCorrection}`);
  for (const r of c.connectionReviews ?? []) if (r.correction) out.push(`Client correction to the ${persona(r.persona_id) ?? 'customer company'} connection summary: ${r.correction}`);
  if (opts.includeBrief) out.push('', buildSourceBrief(c, { company: opts.company, version: opts.version ?? 0 }));
  return out.join('\n');
}

export const allKeys = (c: Content) => new Set(c.modules.flatMap((m) => m.answers.map((a) => a.questionKey)));
export const allAnswerText = (c: Content) => [
  ...c.modules.flatMap((m) => m.answers.map((a) => valueText(a.value))),
  ...(c.followups ?? []).map((f) => f.answer ?? ''),
  ...(c.personas ?? []).flatMap((p) => [p.goal ?? '', p.problem ?? '', p.responsibility ?? '']),
  ...(c.links ?? []).flatMap((l) => [l.capability ?? '', l.how_it_helps ?? '', l.benefit ?? '']),
].join('\n');
