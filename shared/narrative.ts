// Pure discovery logic shared by the server and the in-browser preview: prompt rendering, the
// connected structure (company and personas), coverage, deterministic checks, and the source brief.
// No database, no AI.

export type FocusOffer = { id: string; name: string; availability: string | null };
export type Persona = {
  id: string; role_title: string; responsibility: string | null; purchase_roles: string[]; goal: string | null; problem: string | null;
  is_priority: boolean; evidence_status: string | null; needs_confirmation: boolean; customer_group_id: string | null;
};
export type CustomerGroup = { id: string; name: string; description: string | null; is_priority: boolean };
export type SolutionLink = {
  id: string; persona_id: string | null; offer_id: string | null; fit: string; capability: string | null; how_it_helps: string | null;
  benefit: string | null; out_of_scope: string | null; evidence_status: string | null;
};
export type ConnectionReview = { persona_id: string | null; marked_for_discussion: boolean; correction: string | null };

// Puts real names into a question: the offer's name and the persona's role. Picks planned wording for planned offers.
export function renderPrompt(q: { prompt: string; planned_prompt?: string | null }, offer: FocusOffer | null, persona?: { role_title: string } | null): string {
  const template = offer?.availability === 'planned' && q.planned_prompt ? q.planned_prompt : q.prompt;
  return fill(template, offer, persona);
}
export function fill(template: string, offer: FocusOffer | null, persona?: { role_title: string } | null): string {
  return template.split('{offer}').join(offer ? offer.name : 'what you offer').split('{persona}').join(persona ? persona.role_title : 'this persona');
}

export const TERMS = {
  intro: "First, we'll describe the customer company. Then we'll identify the people involved, called personas. For each, we'll connect the problem to your product or service and describe what success would look like.",
  definitions: [
    { term: 'Your company', text: 'The business you are completing this discovery for.' },
    { term: 'Customer company', text: 'The business that buys or uses your products or services.' },
    { term: 'Persona', text: 'A type of person involved in buying or using your product or service. A persona describes their role, goals, problems, and part in the decision.' },
    { term: 'Product or service', text: 'What you sell to help the customer solve a problem.' },
  ],
  personaExample: 'A finance director may approve the budget, while an operations manager uses the service and is responsible for making it work.',
  exampleNote: 'Examples show what we mean. They are not suggested answers.',
};

export const EVIDENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'observed', label: "I've seen it happen" },
  { value: 'customer_reported', label: 'Customers have told us' },
  { value: 'founder_belief', label: "It's my belief" },
  { value: 'planned', label: "It's planned, not yet true" },
  { value: 'unknown', label: "I don't know yet" },
];

export const PURCHASE_ROLES: { value: string; label: string }[] = [
  { value: 'identifies_need', label: 'Identifies the need' },
  { value: 'recommends', label: 'Recommends' },
  { value: 'evaluates', label: 'Evaluates' },
  { value: 'approves', label: 'Approves' },
  { value: 'uses', label: 'Uses' },
  { value: 'implements', label: 'Implements' },
  { value: 'can_block', label: 'Can block the purchase' },
];

export const FIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'direct', label: 'Helps directly' },
  { value: 'indirect', label: 'Helps indirectly' },
  { value: 'planned', label: 'Planned, not available yet' },
  { value: 'none', label: 'Nothing we offer fits yet' },
  { value: 'unknown', label: "Not sure yet" },
];

export type Entry = {
  questionKey: string; prompt: string; offerId: string | null; personaId?: string | null; narrativeField: string | null; probeOf: string | null; reuseFrom?: string[];
  value: unknown; status: string; evidenceStatus: string | null; reusedFromKey: string | null;
};
export type Content = {
  focusOffers: FocusOffer[];
  modules: { key: string; answers: Entry[] }[];
  offers: { id: string; name: string; availability: string | null }[];
  customerGroups?: CustomerGroup[];
  personas?: Persona[];
  links?: SolutionLink[];
  connectionReviews?: ConnectionReview[];
  earlierAnswers?: { questionKey: string; prompt: string; offerName: string | null; value: unknown }[];
  followups?: { questionKey: string; offerId: string | null; personaId: string | null; round: number; question: string; answer: string | null; status: string }[];
  summaries?: { moduleKey: string; summary: string; interpretations: string[]; openQuestions: string[]; clientCorrection: string | null }[];
};

type Scope = { offerId?: string | null; personaId?: string | null };
const entries = (c: Content) => c.modules.flatMap((m) => m.answers);
const sameScope = (e: Entry, s: Scope) => (e.offerId ?? null) === (s.offerId ?? null) && (e.personaId ?? null) === (s.personaId ?? null);
export const find = (c: Content, field: string, s: Scope = {}) => entries(c).find((e) => e.narrativeField === field && sameScope(e, s));
const findKey = (c: Content, key: string) => entries(c).find((e) => e.questionKey === key && hasValue(e));
export const hasValue = (e?: Entry) => !!e && e.status === 'answered' && e.value != null && !(typeof e.value === 'string' && !e.value.trim()) && !(Array.isArray(e.value) && !e.value.length);
const missing = (e?: Entry) => !e || ['empty', 'not_sure', 'discuss'].includes(e.status) || (e.status === 'answered' && !hasValue(e));
const text = (e?: Entry) => (hasValue(e) && typeof e!.value === 'string' ? (e!.value as string) : null);
export const priorityPersonas = (c: Content) => (c.personas ?? []).filter((p) => p.is_priority);
const linksFor = (c: Content, personaId: string | null) => (c.links ?? []).filter((l) => (l.persona_id ?? null) === personaId);
const offerName = (c: Content, id: string | null) => c.offers.find((o) => o.id === id)?.name ?? null;
const offerPlanned = (c: Content, id: string | null) => c.offers.find((o) => o.id === id)?.availability === 'planned';

// ---- Coverage --------------------------------------------------------------
export const COVERAGE = ['not_asked', 'captured', 'needs_clarification', 'hypothesis', 'not_applicable'] as const;
export type Coverage = (typeof COVERAGE)[number];
export type SectionScope = 'company' | 'persona' | 'offer';

export const NARRATIVE_SECTIONS: { key: string; title: string; scope: SectionScope; fields: { key: string; label: string; important?: boolean; optional?: boolean }[] }[] = [
  { key: 'customer_company', title: 'Customer company', scope: 'company', fields: [
    { key: 'company.type', label: 'Type of company', important: true },
    { key: 'company.goal', label: 'Goal', important: true },
    { key: 'company.problem', label: 'Problem', important: true },
    { key: 'company.problem_effect', label: 'Effect on the business' },
    { key: 'company.solution', label: 'Product or service that helps', important: true },
    { key: 'company.success', label: 'Success', important: true },
    { key: 'company.success_signals', label: 'How success is recognized' },
    { key: 'company.consequence', label: 'If nothing changes', important: true },
    { key: 'company.consequence_risk', label: 'What gets harder or riskier' }] },
  { key: 'personas', title: 'Personas', scope: 'company', fields: [{ key: 'personas', label: 'Personas listed', important: true }] },
  { key: 'persona', title: 'Persona', scope: 'persona', fields: [
    { key: 'persona.role', label: 'Role and part in the purchase', important: true },
    { key: 'persona.goal', label: 'Goal', important: true },
    { key: 'persona.problem', label: 'Problem', important: true },
    { key: 'persona.work_impact', label: 'Effect on their work' },
    { key: 'persona.personal_impact', label: 'Personal effect', optional: true },
    { key: 'persona.solution', label: 'Product or service that helps', important: true },
    { key: 'persona.plan_role', label: 'Their part in the plan' },
    { key: 'persona.success', label: 'Success', important: true },
    { key: 'persona.success_signals', label: 'How they know it helps' },
    { key: 'persona.consequence', label: 'If nothing changes', important: true },
    { key: 'persona.prevent', label: 'What they want to prevent' }] },
  { key: 'plan', title: "Customer's plan", scope: 'company', fields: [
    { key: 'plan.steps', label: 'Steps to value', important: true },
    { key: 'plan.we_handle', label: 'What your company handles' },
    { key: 'plan.customer_does', label: 'What the customer company does', important: true },
    { key: 'plan.confidence', label: 'Support and commitments' }] },
  { key: 'guide', title: 'Empathy and credibility', scope: 'company', fields: [
    { key: 'guide.empathy', label: 'Empathy', important: true },
    { key: 'guide.credibility', label: 'Credibility', important: true }] },
  { key: 'offer', title: 'By product or service', scope: 'offer', fields: [
    { key: 'alternatives.offer', label: 'Alternatives', important: true },
    { key: 'action.direct', label: 'Ready-now action', important: true },
    { key: 'action.transitional', label: 'Not-ready-yet step' }] },
];

function linkCoverage(links: SolutionLink[]): { status: Coverage; reason: string } {
  if (!links.length) return { status: 'not_asked', reason: 'No connection added yet.' };
  if (links.every((l) => l.fit === 'none')) return { status: 'captured', reason: 'Client says nothing they offer fits yet.' };
  if (links.some((l) => l.fit === 'unknown')) return { status: 'needs_clarification', reason: 'The connection is marked not sure yet.' };
  if (links.some((l) => l.offer_id && !l.how_it_helps?.trim())) return { status: 'needs_clarification', reason: 'A connection does not explain how it helps.' };
  if (links.some((l) => l.fit === 'planned' || ['founder_belief', 'planned', 'unknown'].includes(l.evidence_status ?? ''))) return { status: 'hypothesis', reason: 'Includes planned or unproven connections to test.' };
  return { status: 'captured', reason: `${links.length} connection${links.length === 1 ? '' : 's'}.` };
}

export function fieldCoverage(c: Content, field: string, s: Scope = {}): { status: Coverage; reason: string; entry?: Entry; value?: unknown } {
  const persona = s.personaId ? (c.personas ?? []).find((p) => p.id === s.personaId) : undefined;
  if (field === 'company.type') {
    const g = c.customerGroups ?? [];
    if (!g.length) return { status: 'not_asked', reason: 'No customer company described yet.' };
    const pri = g.find((x) => x.is_priority);
    return pri ? { status: 'captured', reason: g.length > 1 ? `Priority chosen from ${g.length} types.` : 'Described.', value: pri.name } : { status: 'needs_clarification', reason: 'Several types listed, none chosen as the priority.' };
  }
  if (field === 'personas') {
    const ps = c.personas ?? [];
    if (!ps.length) return { status: 'not_asked', reason: 'No personas yet.' };
    if (ps.some((p) => p.needs_confirmation)) return { status: 'needs_clarification', reason: 'Some personas were carried over from earlier answers and need the client to confirm them.' };
    return { status: 'captured', reason: `${ps.length} persona${ps.length === 1 ? '' : 's'}, ${priorityPersonas(c).length} priority.`, value: ps.map((p) => p.role_title).join(', ') };
  }
  if (persona && ['persona.role', 'persona.goal', 'persona.problem'].includes(field)) {
    const v = field === 'persona.role' ? persona.purchase_roles.length ? persona.role_title : null : field === 'persona.goal' ? persona.goal : persona.problem;
    if (!v?.trim()) return { status: field === 'persona.role' ? 'needs_clarification' : 'not_asked', reason: field === 'persona.role' ? 'No part in the purchase chosen.' : 'Not described yet.' };
    if (persona.needs_confirmation) return { status: 'needs_clarification', reason: 'Carried over from an earlier answer. Needs client confirmation.', value: v };
    if (['founder_belief', 'planned', 'unknown'].includes(persona.evidence_status ?? '')) return { status: 'hypothesis', reason: 'Based on belief, a plan, or unknown evidence.', value: v };
    return { status: 'captured', reason: 'Described.', value: v };
  }
  if (field === 'company.solution') return linkCoverage(linksFor(c, null));
  if (field === 'persona.solution') return linkCoverage(linksFor(c, s.personaId ?? null));
  const e = find(c, field, s);
  if (!e || e.status === 'empty' || (e.status === 'answered' && !hasValue(e))) {
    const reused = e?.reuseFrom?.map((k) => findKey(c, k)).find(Boolean)
      ?? e?.reuseFrom?.map((k) => (c.earlierAnswers ?? []).find((a) => a.questionKey === k)).find(Boolean);
    if (reused) return { status: 'needs_clarification', reason: `An earlier answer ("${reused.prompt}") may cover this. Confirm with the client.`, entry: e };
    return { status: 'not_asked', reason: 'No answer yet.', entry: e };
  }
  if (e.status === 'not_applicable') return { status: 'not_applicable', reason: 'Client marked this not applicable.', entry: e };
  if (e.status === 'not_sure') return { status: 'needs_clarification', reason: "Client isn't sure yet.", entry: e };
  if (e.status === 'discuss') return { status: 'needs_clarification', reason: 'Client wants to discuss this.', entry: e };
  if (e.evidenceStatus && ['founder_belief', 'planned', 'unknown'].includes(e.evidenceStatus)) {
    return { status: 'hypothesis', reason: `Expected, not yet seen (${EVIDENCE_OPTIONS.find((o) => o.value === e.evidenceStatus)?.label ?? e.evidenceStatus}).`, entry: e, value: e.value };
  }
  return { status: 'captured', reason: e.reusedFromKey ? 'Client confirmed an earlier answer covers this.' : 'Answered.', entry: e, value: e.value };
}

// ---- Connected summaries ("Check the connection") -------------------------
export type LinkView = { id: string; offerName: string | null; fit: string; fitLabel: string; capability: string | null; howItHelps: string | null; benefit: string | null; outOfScope: string | null; evidence: string | null; planned: boolean };
export type Summary = {
  scope: 'company' | 'persona'; personaId: string | null; title: string; subtitle: string | null;
  goal: string | null; problem: string | null; problemDetail: string | null; links: LinkView[];
  plan: { label: string; value: string | null }[]; success: { label: string; value: string | null; evidence: string | null }[];
  consequences: { label: string; value: string | null; evidence: string | null }[];
  uncertain: string[]; missing: string[]; review: ConnectionReview | null;
};

const evLabel = (v: string | null | undefined) => (v ? EVIDENCE_OPTIONS.find((o) => o.value === v)?.label ?? v : null);
const statusNote = (e?: Entry) => (!e ? null : e.status === 'not_sure' ? "Not sure yet" : e.status === 'discuss' ? 'To discuss with Rishari' : e.status === 'not_applicable' ? 'Not applicable' : null);
const val = (e?: Entry) => text(e) ?? statusNote(e);

function linkViews(c: Content, personaId: string | null): LinkView[] {
  return linksFor(c, personaId).map((l) => ({
    id: l.id, offerName: offerName(c, l.offer_id), fit: l.fit, fitLabel: FIT_OPTIONS.find((f) => f.value === l.fit)?.label ?? l.fit,
    capability: l.capability, howItHelps: l.how_it_helps, benefit: l.benefit, outOfScope: l.out_of_scope, evidence: evLabel(l.evidence_status),
    planned: l.fit === 'planned' || offerPlanned(c, l.offer_id),
  }));
}

export function buildConnections(c: Content): Summary[] {
  const group = (c.customerGroups ?? []).find((g) => g.is_priority) ?? null;
  const review = (pid: string | null) => (c.connectionReviews ?? []).find((r) => (r.persona_id ?? null) === pid) ?? null;
  const company = (): Summary => {
    const goal = find(c, 'company.goal'), problem = find(c, 'company.problem'), effect = find(c, 'company.problem_effect');
    const succ = find(c, 'company.success'), sig = find(c, 'company.success_signals'), keep = find(c, 'company.consequence'), risk = find(c, 'company.consequence_risk');
    const links = linkViews(c, null);
    const s: Summary = {
      scope: 'company', personaId: null, title: group ? group.name : 'Customer company', subtitle: 'Customer company summary',
      goal: val(goal), problem: val(problem), problemDetail: val(effect), links,
      plan: [
        { label: 'Main steps', value: val(find(c, 'plan.steps')) },
        { label: 'What your company handles', value: val(find(c, 'plan.we_handle')) },
        { label: 'What the customer company does', value: val(find(c, 'plan.customer_does')) },
        { label: 'Support and commitments', value: val(find(c, 'plan.confidence')) },
      ],
      success: [{ label: 'What improves', value: val(succ), evidence: evLabel(succ?.evidenceStatus) }, { label: 'How they recognize it', value: val(sig), evidence: evLabel(sig?.evidenceStatus) }],
      consequences: [{ label: 'What continues', value: val(keep), evidence: evLabel(keep?.evidenceStatus) }, { label: 'What could get harder', value: val(risk), evidence: evLabel(risk?.evidenceStatus) }],
      uncertain: [], missing: [], review: review(null),
    };
    return finish(s, [goal, problem, succ, keep]);
  };
  const persona = (p: Persona): Summary => {
    const s0 = { personaId: p.id };
    const work = find(c, 'persona.work_impact', s0), role = find(c, 'persona.plan_role', s0), succ = find(c, 'persona.success', s0), know = find(c, 'persona.success_signals', s0),
      personal = find(c, 'persona.success_personal', s0), keep = find(c, 'persona.consequence', s0), prev = find(c, 'persona.prevent', s0);
    const roles = p.purchase_roles.map((r) => PURCHASE_ROLES.find((x) => x.value === r)?.label ?? r).join(', ');
    const s: Summary = {
      scope: 'persona', personaId: p.id, title: p.role_title, subtitle: roles ? `Part in the purchase: ${roles}` : null,
      goal: p.goal?.trim() || null, problem: p.problem?.trim() || null, problemDetail: val(work), links: linkViews(c, p.id),
      plan: [{ label: 'Their part in the shared plan', value: val(role) }],
      success: [
        { label: 'What they can do better', value: val(succ), evidence: evLabel(succ?.evidenceStatus) },
        { label: 'How they know it helps', value: val(know), evidence: evLabel(know?.evidenceStatus) },
        { label: 'What it means for them personally', value: val(personal), evidence: evLabel(personal?.evidenceStatus) },
      ],
      consequences: [{ label: 'What they keep facing', value: val(keep), evidence: evLabel(keep?.evidenceStatus) }, { label: 'What they want to prevent', value: val(prev), evidence: evLabel(prev?.evidenceStatus) }],
      uncertain: p.needs_confirmation ? ['This persona was carried over from an earlier answer. Please confirm it.'] : [], missing: [], review: review(p.id),
    };
    return finish(s, [succ, keep], p);
  };
  return [company(), ...priorityPersonas(c).map(persona)];
}

function finish(s: Summary, keyEntries: (Entry | undefined)[], p?: Persona): Summary {
  if (!s.goal) s.missing.push('Goal');
  if (!s.problem) s.missing.push('Problem');
  if (!s.links.length) s.missing.push('Product or service that helps');
  for (const l of s.links) {
    if (l.offerName && !l.howItHelps?.trim()) s.missing.push(`How ${l.offerName} helps`);
    if (l.fit === 'unknown') s.uncertain.push('The connection to a product or service is not sure yet.');
    if (l.planned) s.uncertain.push(`${l.offerName ?? 'A connection'} is planned, not available yet.`);
  }
  if (!s.plan.some((x) => x.value)) s.missing.push('Plan');
  if (!s.success[0].value) s.missing.push('Success');
  if (!s.consequences[0].value) s.missing.push('Consequences if nothing changes');
  for (const e of keyEntries) {
    if (e?.status === 'not_sure' || e?.status === 'discuss') s.uncertain.push(`"${e.prompt}" is marked ${statusNote(e)?.toLowerCase()}.`);
    if (e?.evidenceStatus && ['founder_belief', 'planned', 'unknown'].includes(e.evidenceStatus)) s.uncertain.push(`"${e.prompt}" is an expectation, not yet seen.`);
  }
  if (p && ['founder_belief', 'unknown'].includes(p.evidence_status ?? '')) s.uncertain.push('What we know about this persona is a belief or unknown so far.');
  s.uncertain = [...new Set(s.uncertain)];
  return s;
}

// ---- Deterministic checks --------------------------------------------------
export type Hit = { check: string; priority: 'high' | 'medium' | 'low'; offerId: string | null; personaId: string | null; refs: Entry[]; noticed: string };

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a?.trim() || !b?.trim()) return 0;
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / Math.min(A.size, B.size);
}
const weakEvidence = (e?: Entry) => !e?.evidenceStatus || !['observed', 'customer_reported'].includes(e.evidenceStatus);
const pseudo = (key: string, prompt: string, personaId: string | null = null): Entry => ({ questionKey: key, prompt, offerId: null, personaId, narrativeField: null, probeOf: null, value: null, status: 'empty', evidenceStatus: null, reusedFromKey: null });

export function runChecks(c: Content): Hit[] {
  const hits: Hit[] = [];
  const add = (h: Hit) => hits.push(h);
  const scopes: { persona: Persona | null }[] = [{ persona: null }, ...priorityPersonas(c).map((p) => ({ persona: p }))];
  for (const { persona } of scopes) {
    const pid = persona?.id ?? null;
    const who = persona ? `the ${persona.role_title} persona` : 'the customer company';
    const linkKey = persona ? 'sl_persona' : 'sl_company';
    const links = linksFor(c, pid);
    const problemText = persona ? persona.problem : text(find(c, 'company.problem'));
    const problemRef = persona ? pseudo('cp_personas', `Persona: ${persona.role_title}`, pid) : find(c, 'company.problem');
    // 1. Problem with no linked offer
    if (problemText && !links.length) add({ check: 'problem_without_offer', priority: 'high', offerId: null, personaId: pid, refs: [problemRef!].filter(Boolean),
      noticed: `There is a problem described for ${who}, but no product or service is connected to it, and nothing says that none fits.` });
    // 2. Offer with no explanation of how it helps
    const unexplained = links.filter((l) => l.offer_id && !l.how_it_helps?.trim());
    if (unexplained.length) add({ check: 'offer_without_explanation', priority: 'high', offerId: unexplained[0].offer_id, personaId: pid,
      refs: [pseudo(linkKey, persona ? `How you help ${persona.role_title}` : 'Which product or service addresses this company problem?', pid)],
      noticed: `${unexplained.map((l) => offerName(c, l.offer_id)).join(', ')} ${unexplained.length === 1 ? 'is' : 'are'} connected to ${who} without explaining how it helps.` });
    // 8. Persona linked to an offer without a clear reason
    if (persona) {
      const unclear = links.filter((l) => l.offer_id && (!persona.problem?.trim() || (!l.capability?.trim() && !l.benefit?.trim())));
      if (unclear.length) add({ check: 'persona_offer_mismatch', priority: 'medium', offerId: unclear[0].offer_id, personaId: pid,
        refs: [pseudo('sl_persona', `How you help ${persona.role_title}`, pid)],
        noticed: !persona.problem?.trim()
          ? `${offerName(c, unclear[0].offer_id)} is connected to the ${persona.role_title} persona, but this persona has no problem described for it to address.`
          : `${offerName(c, unclear[0].offer_id)} is connected to the ${persona.role_title} persona without saying which part addresses their problem or what benefit it creates.` });
    }
    // 4. Success described only as a feature
    const succ = persona ? find(c, 'persona.success', { personaId: pid }) : find(c, 'company.success');
    const succText = text(succ);
    const asFeature = succText ? links.find((l) => similarity(succText, l.capability) >= 0.6) : undefined;
    if (succText && asFeature) add({ check: 'persona_success_unclear', priority: 'medium', offerId: asFeature.offer_id, personaId: pid, refs: [succ!],
      noticed: `The success answer for ${who} repeats what ${offerName(c, asFeature.offer_id) ?? 'the product or service'} does ("${asFeature.capability}"). It does not explain what that helps them accomplish.` });
    // 6. Unsupported consequence
    const conseq = persona ? [find(c, 'persona.consequence', { personaId: pid }), find(c, 'persona.prevent', { personaId: pid })] : [find(c, 'company.consequence'), find(c, 'company.consequence_risk')];
    const support = persona ? find(c, 'persona.consequence_support', { personaId: pid }) : find(c, 'company.consequence_support');
    const weak = conseq.filter((e) => hasValue(e) && weakEvidence(e)) as Entry[];
    if (weak.length && !hasValue(support)) add({ check: 'unsupported_failure', priority: 'high', offerId: null, personaId: pid, refs: [...weak, ...(support ? [support] : [])],
      noticed: `The consequences for ${who} are not backed by anything observed or reported by customers, and "What supports that expectation?" is unanswered.` });
    // 7. Planned capability treated as current
    const plannedAsCurrent = links.filter((l) => l.offer_id && ((offerPlanned(c, l.offer_id) && l.fit !== 'planned') || (l.fit === 'planned' && ['observed', 'customer_reported'].includes(l.evidence_status ?? ''))));
    if (plannedAsCurrent.length) add({ check: 'planned_as_available', priority: 'high', offerId: plannedAsCurrent[0].offer_id, personaId: pid,
      refs: [pseudo(linkKey, persona ? `How you help ${persona.role_title}` : 'Which product or service addresses this company problem?', pid)],
      noticed: `${plannedAsCurrent.map((l) => offerName(c, l.offer_id)).join(', ')} is planned, but the connection for ${who} describes it as available or already proven.` });
  }
  // 3. Persona benefit confused with company benefit
  const companySucc = text(find(c, 'company.success'));
  for (const p of priorityPersonas(c)) {
    const ps = find(c, 'persona.success', { personaId: p.id });
    const benefits = linksFor(c, p.id).map((l) => l.benefit);
    if (companySucc && (similarity(text(ps), companySucc) >= 0.7 || benefits.some((b) => similarity(b, companySucc) >= 0.7))) {
      add({ check: 'persona_company_confused', priority: 'medium', offerId: null, personaId: p.id, refs: [ps, find(c, 'company.success')].filter(Boolean) as Entry[],
        noticed: `The benefit described for the ${p.role_title} persona is nearly the same as the benefit for the customer company.` });
    }
  }
  // 5. Plan missing customer responsibilities
  const steps = find(c, 'plan.steps'), customerDoes = find(c, 'plan.customer_does');
  if (hasValue(steps) && missing(customerDoes)) add({ check: 'plan_missing_customer_role', priority: 'medium', offerId: null, personaId: null, refs: [steps!, ...(customerDoes ? [customerDoes] : [])],
    noticed: 'The plan lists steps, but not what the customer company needs to do.' });
  // Kept from earlier updates: next action per offer, empathy and credibility.
  for (const o of c.focusOffers) {
    const act = find(c, 'action.direct', { offerId: o.id });
    if (missing(act)) add({ check: 'unclear_next_action', priority: 'medium', offerId: o.id, personaId: null, refs: act ? [act] : [], noticed: `There is no clear next step for someone ready to move forward with ${o.name}.` });
  }
  const emp = find(c, 'guide.empathy'), cred = find(c, 'guide.credibility');
  if (missing(emp) || missing(cred)) add({ check: 'empathy_credibility_unclear', priority: 'medium', offerId: null, personaId: null, refs: [emp, cred].filter(Boolean) as Entry[],
    noticed: missing(emp) && missing(cred) ? 'Neither empathy nor credibility is described yet.' : missing(emp) ? 'Credibility is described, but not what the company understands about the customer.' : 'Empathy is described, but not what gives the customer confidence.' });
  return hits;
}

// ---- Source brief: what strategy generation will receive ------------------
// Assembled only from the approved snapshot. Blank connections stay blank.
export function buildSourceBrief(c: Content, meta: { company: string; version: number; approvedAt?: string | null; assumptions?: { text: string }[] }): string {
  const out: string[] = [];
  const line = (label: string, v: string | null | undefined, ev?: string | null) => out.push(`- **${label}:** ${v?.trim() ? v.trim() : '_Not provided_'}${ev ? ` (${ev})` : ''}`);
  out.push(`# Connected source brief: ${meta.company}`, '', `Source version ${meta.version}${meta.approvedAt ? `, approved ${meta.approvedAt}` : ', not yet approved'}. Assembled from the client's answers without AI. Nothing is inferred.`, '');
  const groups = c.customerGroups ?? [];
  if (groups.length > 1) out.push(`Other customer company types, kept separate: ${groups.filter((g) => !g.is_priority).map((g) => g.name).join('; ')}.`, '');
  for (const s of buildConnections(c)) {
    out.push(`## ${s.scope === 'company' ? 'Customer company' : 'Persona'}: ${s.title}`);
    if (s.subtitle) out.push(`_${s.subtitle}_`);
    out.push('');
    line('Goal', s.goal);
    line('Problem', s.problem);
    if (s.problemDetail) line(s.scope === 'company' ? 'Effect on the business' : 'Effect on their work', s.problemDetail);
    if (!s.links.length) out.push('- **Product or service:** _No connection provided_');
    for (const l of s.links) {
      out.push(`- **Product or service:** ${l.offerName ?? 'None'} (${l.fitLabel}${l.planned ? ', planned' : ''})`);
      if (l.capability) out.push(`  - ${s.scope === 'company' ? 'What it does' : 'Part that addresses the problem'}: ${l.capability}`);
      out.push(`  - ${s.scope === 'company' ? 'How it addresses the problem' : 'How it changes their work'}: ${l.howItHelps?.trim() || '_Not provided_'}`);
      if (l.benefit) out.push(`  - Intended benefit: ${l.benefit}`);
      if (l.outOfScope) out.push(`  - Outside its scope: ${l.outOfScope}`);
      if (l.evidence) out.push(`  - Evidence: ${l.evidence}`);
    }
    for (const p of s.plan) line(p.label, p.value);
    for (const x of s.success) line(`Success: ${x.label.toLowerCase()}`, x.value, x.evidence);
    for (const x of s.consequences) line(`If nothing changes: ${x.label.toLowerCase()}`, x.value, x.evidence);
    if (s.uncertain.length) out.push(`- **Uncertain:** ${s.uncertain.join(' ')}`);
    if (s.missing.length) out.push(`- **Missing:** ${s.missing.join(', ')}`);
    if (s.review?.correction) out.push(`- **Client correction:** ${s.review.correction}`);
    if (s.review?.marked_for_discussion) out.push('- **Client wants to discuss this summary.**');
    out.push('');
  }
  if (meta.assumptions?.length) { out.push('## Accepted assumptions', ''); for (const a of meta.assumptions) out.push(`- ${a.text}`); out.push(''); }
  return out.join('\n');
}
