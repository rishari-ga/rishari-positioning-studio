// Pure buyer-narrative logic shared by the server and the in-browser preview.
// No database, no AI: coverage and checks here are deterministic.

export type FocusOffer = { id: string; name: string; availability: string | null };

// Puts the real offer name into a question and picks planned wording when the offer isn't available yet.
export function renderPrompt(q: { prompt: string; planned_prompt?: string | null }, offer: FocusOffer | null): string {
  const template = offer?.availability === 'planned' && q.planned_prompt ? q.planned_prompt : q.prompt;
  return template.split('{offer}').join(offer ? offer.name : 'what you offer');
}

export const EVIDENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'observed', label: "I've seen it happen" },
  { value: 'customer_reported', label: 'Customers have told us' },
  { value: 'founder_belief', label: "It's my belief" },
  { value: 'planned', label: "It's planned, not yet true" },
  { value: 'unknown', label: "I don't know yet" },
];

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'primary_buyer', label: 'Main buyer' },
  { value: 'internal_champion', label: 'Pushes for it internally' },
  { value: 'user', label: 'Uses it day to day' },
  { value: 'approver', label: 'Approves or evaluates it' },
  { value: 'beneficiary', label: 'Benefits downstream' },
];

export type Entry = {
  questionKey: string; prompt: string; offerId: string | null; narrativeField: string | null; probeOf: string | null; reuseFrom?: string[];
  value: unknown; status: string; evidenceStatus: string | null; reusedFromKey: string | null;
};
export type Stakeholder = { id: string; offer_id: string | null; label: string; roles: string[]; desired_outcome: string | null; wants_to_prevent: string | null; needs_to_believe: string | null; decision_role: string | null; evidence_status: string | null };
export type Content = { focusOffers: FocusOffer[]; modules: { key: string; answers: Entry[] }[]; stakeholders: Stakeholder[]; offers: { id: string; name: string; availability: string | null }[] };

// The narrative elements in order (spec Section 16). `offer` = asked per focus offer.
export const NARRATIVE_SECTIONS: { key: string; title: string; offer: boolean; fields: { key: string; label: string; important?: boolean; optional?: boolean }[] }[] = [
  { key: 'character', title: 'Character: buyer and desired outcome', offer: true, fields: [
    { key: 'character.buyer_role', label: 'Primary buyer', important: true },
    { key: 'character.org_type', label: 'Organization type' },
    { key: 'character.responsibilities', label: 'Responsibilities' },
    { key: 'character.desired_outcome', label: 'Desired outcome', important: true },
    { key: 'character.trigger', label: 'Trigger' }] },
  { key: 'problem', title: 'Problem', offer: true, fields: [
    { key: 'problem.practical', label: 'Practical problem', important: true },
    { key: 'problem.internal', label: 'Internal problem' },
    { key: 'problem.philosophical', label: 'Philosophical problem', optional: true }] },
  { key: 'guide', title: 'Guide: empathy and credibility', offer: false, fields: [
    { key: 'guide.empathy', label: 'Empathy', important: true },
    { key: 'guide.empathy_in_practice', label: 'How understanding shapes service' },
    { key: 'guide.credibility', label: 'Credibility', important: true },
    { key: 'guide.current_capability', label: 'Current capability' },
    { key: 'guide.planned_capability', label: 'Planned capability', optional: true }] },
  { key: 'plan', title: 'Plan: customer path', offer: true, fields: [
    { key: 'plan.path', label: 'Path to value', important: true },
    { key: 'plan.responsibilities', label: 'Who does what' },
    { key: 'plan.commitments', label: 'Commitments and explanations' },
    { key: 'plan.mechanism', label: 'How it works (not the path)', optional: true }] },
  { key: 'action', title: 'Action', offer: true, fields: [
    { key: 'action.direct', label: 'Ready now', important: true },
    { key: 'action.after', label: 'What happens next' },
    { key: 'action.transitional', label: 'Not ready yet' }] },
  { key: 'immediate_result', title: 'Immediate result', offer: true, fields: [
    { key: 'immediate_result.change', label: 'First observable change', important: true },
    { key: 'immediate_result.dependencies', label: 'Dependencies' }] },
  { key: 'success', title: 'Success', offer: true, fields: [
    { key: 'success.organization', label: 'Organizational success', important: true },
    { key: 'success.team', label: 'Team success' },
    { key: 'success.personal', label: 'Personal success' },
    { key: 'success.downstream', label: 'Downstream benefit', optional: true },
    { key: 'success.signals', label: 'Observable signals' },
    { key: 'success.measures', label: 'Existing measures', optional: true },
    { key: 'success.time_horizon', label: 'Time horizon' }] },
  { key: 'failure', title: 'Failure and stakes', offer: true, fields: [
    { key: 'failure.continues', label: 'What continues', important: true },
    { key: 'failure.escalation', label: 'What gets harder or riskier' },
    { key: 'failure.who', label: 'Who carries it' },
    { key: 'failure.prevent', label: 'What the buyer wants to prevent' }] },
  { key: 'transformation', title: 'Transformation (optional)', offer: true, fields: [
    { key: 'transformation.after', label: 'How they want to be seen', optional: true },
    { key: 'transformation.before', label: 'What they no longer want to be known for', optional: true }] },
  { key: 'alternatives', title: 'Alternatives', offer: true, fields: [
    { key: 'alternatives.offer', label: 'Offer-level alternative', important: true },
    { key: 'alternatives.reasons_to_stay', label: 'Reasons to stay' }] },
  { key: 'stakeholders', title: 'Stakeholders', offer: true, fields: [{ key: 'stakeholders', label: 'Stakeholder map', important: true }] },
];

export const COVERAGE = ['not_asked', 'captured', 'needs_clarification', 'hypothesis', 'not_applicable'] as const;
export type Coverage = (typeof COVERAGE)[number];

const hasValue = (e?: Entry) => !!e && e.status === 'answered' && e.value != null && !(typeof e.value === 'string' && !e.value.trim()) && !(Array.isArray(e.value) && !e.value.length);
const entries = (c: Content) => c.modules.flatMap((m) => m.answers);
const find = (c: Content, field: string, offerId: string | null) =>
  entries(c).find((e) => e.narrativeField === field && (e.offerId ?? null) === offerId);
const findKey = (c: Content, key: string, offerId: string | null = null) =>
  entries(c).find((e) => e.questionKey === key && (e.offerId ?? null) === offerId);

export function fieldCoverage(c: Content, field: string, offerId: string | null): { status: Coverage; reason: string; entry?: Entry } {
  if (field === 'stakeholders') {
    const people = c.stakeholders.filter((s) => (s.offer_id ?? null) === offerId);
    if (!people.length) return { status: 'not_asked', reason: 'No one listed yet.' };
    const buyer = people.find((s) => s.roles.includes('primary_buyer'));
    if (!buyer || !buyer.desired_outcome) return { status: 'needs_clarification', reason: 'No primary buyer with a desired outcome.' };
    return { status: 'captured', reason: `${people.length} ${people.length === 1 ? 'person' : 'people'} listed.` };
  }
  const e = find(c, field, offerId);
  if (!e || e.status === 'empty' || (e.status === 'answered' && !hasValue(e))) {
    const reused = e?.reuseFrom?.map((k) => findKey(c, k)).find((x) => hasValue(x));
    if (reused) return { status: 'needs_clarification', reason: `An earlier answer ("${reused.prompt}") may cover this. Confirm with the client.`, entry: e };
    return { status: 'not_asked', reason: 'No answer yet.', entry: e };
  }
  if (e.status === 'not_applicable') return { status: 'not_applicable', reason: 'Client marked this not applicable.', entry: e };
  if (e.status === 'not_sure') return { status: 'needs_clarification', reason: "Client isn't sure yet.", entry: e };
  if (e.status === 'discuss') return { status: 'needs_clarification', reason: 'Client wants to discuss this.', entry: e };
  if (e.evidenceStatus && ['founder_belief', 'planned', 'unknown'].includes(e.evidenceStatus)) {
    return { status: 'hypothesis', reason: `Answered as ${e.evidenceStatus.replace('_', ' ')}. Treat as something to test.`, entry: e };
  }
  return { status: 'captured', reason: e.reusedFromKey ? 'Client confirmed an earlier answer covers this.' : 'Answered.', entry: e };
}

// ---- Deterministic checks (Section 15) -------------------------------------
export type Hit = { check: string; priority: 'high' | 'medium' | 'low'; offerId: string | null; refs: Entry[]; noticed: string };

export function runChecks(c: Content): Hit[] {
  const hits: Hit[] = [];
  const scopes = c.focusOffers.length ? c.focusOffers : [null];
  const missing = (e?: Entry) => !e || ['empty', 'not_sure', 'discuss'].includes(e.status) || (e.status === 'answered' && !hasValue(e));
  for (const o of scopes) {
    const oid = o?.id ?? null;
    const name = o ? `"${o.name}"` : 'the main offer';
    const buyer = find(c, 'character.buyer_role', oid);
    const audience = [findKey(c, 'm5_benefits'), findKey(c, 'm1_markets')].filter(hasValue) as Entry[];
    if (missing(buyer) && audience.length) {
      hits.push({ check: 'audience_without_buyer', priority: 'high', offerId: oid, refs: [...audience, ...(buyer ? [buyer] : [])],
        noticed: `There is an audience description, but no specific person named as the main buyer for ${name}.` });
    }
    const outcome = find(c, 'character.desired_outcome', oid);
    if (hasValue(buyer) && missing(outcome)) {
      hits.push({ check: 'buyer_without_outcome', priority: 'high', offerId: oid, refs: [buyer!, ...(outcome ? [outcome] : [])],
        noticed: `The buyer for ${name} is named, but what they are trying to accomplish is not clear yet.` });
    }
    const personal = find(c, 'success.personal', oid), team = find(c, 'success.team', oid);
    if (missing(personal) && missing(team) && personal?.status !== 'not_applicable') {
      hits.push({ check: 'stakes_unknown', priority: 'medium', offerId: oid, refs: [personal, team].filter(Boolean) as Entry[],
        noticed: `Neither personal nor team success is described for ${name}.` });
    }
    const fails = [find(c, 'failure.continues', oid), find(c, 'failure.escalation', oid)].filter(hasValue) as Entry[];
    const support = find(c, 'failure.support', oid);
    const weak = fails.filter((e) => !e.evidenceStatus || !['observed', 'customer_reported'].includes(e.evidenceStatus));
    if (weak.length && !hasValue(support)) {
      hits.push({ check: 'unsupported_failure', priority: 'high', offerId: oid, refs: [...weak, ...(support ? [support] : [])],
        noticed: `The consequences of inaction for ${name} are stated without anything observed or customer-reported to support them, and "What supports that expectation?" is unanswered.` });
    }
    const path = find(c, 'plan.path', oid), mech = find(c, 'plan.mechanism', oid), roles = find(c, 'plan.responsibilities', oid);
    if (hasValue(mech) && missing(path)) {
      hits.push({ check: 'plan_is_technology', priority: 'medium', offerId: oid, refs: [mech!, ...(path ? [path] : [])],
        noticed: `There is an explanation of how ${name} works, but not the steps a customer goes through to get value.` });
    } else if (hasValue(path) && missing(roles)) {
      hits.push({ check: 'plan_is_technology', priority: 'low', offerId: oid, refs: [path!, ...(roles ? [roles] : [])],
        noticed: `The path for ${name} is described, but not what the customer does versus what the company handles. Check that it describes the customer's steps, not only the technology.` });
    }
    if (o?.availability === 'planned') {
      const claimed = entries(c).filter((e) => e.offerId === oid && hasValue(e) && ['observed', 'customer_reported'].includes(e.evidenceStatus ?? '')
        && /^(success|immediate_result)\./.test(e.narrativeField ?? ''));
      if (claimed.length) {
        hits.push({ check: 'current_planned_blended', priority: 'high', offerId: oid, refs: claimed,
          noticed: `${name} is listed as planned, but some outcomes are labeled as observed or customer-reported.` });
      }
    }
    const people = c.stakeholders.filter((s) => (s.offer_id ?? null) === oid);
    if (people.length === 1 && people[0].roles.length >= 3) {
      hits.push({ check: 'stakeholders_blended', priority: 'low', offerId: oid, refs: [],
        noticed: `One person ("${people[0].label}") holds ${people[0].roles.length} roles for ${name}. That can be right, but confirm no one else wants something different.` });
    }
    const act = find(c, 'action.direct', oid);
    if (missing(act)) {
      hits.push({ check: 'unclear_next_action', priority: 'medium', offerId: oid, refs: act ? [act] : [],
        noticed: `There is no clear next step for someone ready to move forward with ${name}.` });
    }
  }
  const emp = find(c, 'guide.empathy', null), cred = find(c, 'guide.credibility', null);
  if (missing(emp) || missing(cred)) {
    hits.push({ check: 'empathy_credibility_unclear', priority: 'medium', offerId: null, refs: [emp, cred].filter(Boolean) as Entry[],
      noticed: missing(emp) && missing(cred) ? 'Neither empathy nor credibility is described yet.' : missing(emp) ? 'Credibility is described, but not what the company understands about the buyer.' : 'Empathy is described, but not what gives the buyer confidence.' });
  }
  return hits;
}

