// In-browser stand-in for the server, used only by the Claude-hosted preview build.
// Everything here is fictional and lives in the viewer's own browser. Nothing is sent anywhere.
// Coverage and checks use the same shared rules as the real server.
import { MODULES, ALL_MODULES, RETIRED_MODULES, RETIRED_QUESTIONS, DATA_USE_DEFAULT } from '../../../server/seed/questions';
import { GUIDANCE } from '../../../server/seed/guidance';
import { ACK } from '@shared/content';
import { NARRATIVE_SECTIONS, fieldCoverage, runChecks, renderPrompt, buildConnections, buildSourceBrief } from '@shared/narrative';
import type { Content, FocusOffer } from '@shared/narrative';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const KEY = 'rishari-demo-state-v3';

export const DEMO_USERS = {
  client: { id: 'u-client', email: 'founder@harborlane.example', displayName: 'Dana Reyes (fictional)', isAdmin: false },
  admin: { id: 'u-admin', email: 'reviewer@rishari.example', displayName: 'Rishari reviewer', isAdmin: true },
};

let seq = 1;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const now = () => new Date().toISOString();

const toModule = (m: (typeof ALL_MODULES)[number], mi: number) => ({
  id: `mod-${m.key}`, key: m.key, position: mi + 1, title: m.title, why: m.why, opening: m.opening ?? null,
  questions: m.questions.map((q, qi) => ({
    id: `q-${q.key}`, key: q.key, module_id: `mod-${m.key}`, position: qi + 1, version: q.revision ?? 1,
    kind: q.kind, input_type: q.input, prompt: q.prompt, help_text: q.help ?? null,
    thinking_prompts: q.thinking ?? [], options: q.options ?? [], allow_not_sure: q.allowNotSure ?? true,
    per_offer: q.perOffer ?? false, planned_prompt: q.plannedPrompt ?? null, probe_of: q.probeOf ?? null,
    narrative_field: q.field ?? null, asks_evidence: q.evidence ?? false, allow_not_applicable: q.allowNA ?? false,
    reuse_from: q.reuseFrom ?? [], probe_always: q.probeAlways ?? false, na_label: q.naLabel ?? null,
    per_persona: q.perPersona ?? false, heading_template: q.heading ?? null, part_label: q.part ?? null,
  })),
});
const modules = MODULES.map(toModule);
const allQuestions = modules.flatMap((m) => m.questions);
// Questions that an update retired. Their answers are kept and offered back as "earlier answers".
const retired = ALL_MODULES.map(toModule).flatMap((m) => m.questions.filter((q) => RETIRED_MODULES.includes(m.key) || RETIRED_QUESTIONS.includes(q.key)));
const PERSONA_SCOPED = (q: Json) => q.per_persona || q.kind === 'persona_fields';
const qByKey = (k: string) => allQuestions.find((q) => q.key === k)!;

type Project = {
  id: string; name: string; company_name: string; status: string; is_fictional: boolean; created_at: string;
  clientId: string | null; clientEmail: string | null; acknowledged: boolean;
  answers: Json[]; offers: Json[]; progress: Json[]; submissions: Json[]; attachments: Json[]; notes: Json[]; activity: Json[];
  stakeholders: Json[]; clarifications: Json[]; flags: Json[]; overrides: Json[]; approvals: Json[];
  customerGroups: Json[]; personas: Json[]; links: Json[]; connectionReviews: Json[];
};

const blank = (p: Partial<Project>): Project => ({
  id: uid('p'), name: '', company_name: '', status: 'discovery', is_fictional: true, created_at: now(), clientId: null, clientEmail: null,
  acknowledged: false, answers: [], offers: [], progress: [], submissions: [], attachments: [], notes: [], activity: [],
  stakeholders: [], clarifications: [], flags: [], overrides: [], approvals: [], customerGroups: [], personas: [], links: [], connectionReviews: [], ...p,
});

function seedState() {
  const a = (key: string, value: unknown, status = 'answered', evidence_status: string | null = null, persona_id: string | null = null, offer_id: string | null = null) =>
    ({ question_id: `q-${key}`, offer_id, persona_id, value, status, context_note: null, evidence_status, reused_from_key: null, revision: 1 });
  const harbor = blank({ id: 'p-harbor', name: 'Harbor Lane discovery', company_name: 'Harbor Lane Fictional Co', clientId: DEMO_USERS.client.id, clientEmail: DEMO_USERS.client.email,
    activity: [{ action: 'project.created', actor_email: DEMO_USERS.admin.email, created_at: now() }] });
  const O = 'o-1', D = 'o-3', OWN = 'pe-owner', OM = 'pe-office', CTRL = 'pe-controller';
  // Fictional example. Every name, company, and answer below is made up.
  const northfield = blank({
    id: 'p-northfield', name: 'Northfield discovery (fictional)', company_name: 'Northfield Advisory (fictional)', status: 'submitted', clientId: 'u-other', clientEmail: 'partner@northfield.example', acknowledged: true,
    answers: [
      a('m1_company', 'Northfield Advisory (fictional)'), a('m1_model', ['Consulting or professional services']), a('m1_stage', ['Serving early customers']),
      a('m1_what', 'We help family-owned manufacturers get their books and forecasting in shape before a sale or a handoff to the next generation.'),
      a('m2_necessary', 'Our founder watched her father nearly lose a buyer because nobody could explain three years of numbers.'),
      a('cc_goal', 'Sell the business, or hand it to the next generation, on good terms.', 'answered', 'customer_reported'),
      a('cc_problem', 'Three years of numbers no one can explain, spread across spreadsheets.', 'answered', 'observed'),
      a('cc_effect', 'Buyers discount the price or walk away late in due diligence.', 'answered', 'customer_reported'),
      a('pr_prevents', 'They cannot show a buyer clean, trusted numbers.', 'answered', 'observed'),
      a('p_work', 'Answers buyer questions late at night with no clear records.', 'answered', 'observed', OWN),
      a('p_personal', 'Worried the family legacy sells for less than it is worth.', 'answered', 'customer_reported', OWN),
      a('p_work', 'Spends month-end fixing spreadsheets by hand.', 'answered', 'observed', OM),
      a('p_personal', null, 'not_sure', null, OM),
      a('pl_steps', 'Kickoff, records review, ledger rebuild, monthly reconciliation, buyer-ready package.'),
      a('pl_we', 'We rebuild the ledger and reconcile it each month.'),
      a('pl_customer', null, 'not_sure'),
      a('pl_personas', 'Joins a weekly 30-minute check-in and signs off on the package.', 'answered', null, OWN),
      a('pl_personas', 'Sends bank statements and invoices in the first two weeks.', 'answered', null, OM),
      a('sc_company', 'A buyer trusts the numbers and the sale closes on the expected timeline.', 'answered', 'founder_belief'),
      a('sp_do', 'Answer any buyer question in a day, with records to back it up.', 'answered', 'customer_reported', OWN),
      a('sp_do', 'Close the month in two days instead of a week.', 'answered', 'observed', OM),
      a('nc_keep', 'The sale price drops or the deal falls apart.', 'answered', 'founder_belief'),
      a('np_keep', 'Keeps losing evenings and weekends to spreadsheet fixes.', 'answered', 'observed', OM),
      a('np_prevent', 'Being blamed for errors that started before them.', 'answered', 'customer_reported', OM),
      a('n_action_ready', 'Book a 30-minute fit call.', 'answered', null, null, O),
      a('n_guide_empathy', 'Our founder grew up in a family manufacturing business and went through a sale.'),
      // Answers to questions that this update retired. They stay on file and are offered back for reuse.
      a('n_fail_continue', 'Buyers will walk away and the business will be worth much less.', 'answered', 'founder_belief', null, O),
      a('m5_benefits', 'Owners of manufacturers with 20 to 200 employees who expect to sell within a few years.'),
    ],
    offers: [
      { id: O, name: 'Finance cleanup engagement', description: 'Twelve weeks to get books, controls, and forecasts buyer-ready.', availability: 'available', priority: 1, in_scope: true },
      { id: 'o-2', name: 'Fractional CFO retainer', description: 'Monthly leadership after the cleanup.', availability: 'available', priority: 2, in_scope: false },
      { id: D, name: 'Sale-readiness diagnostic', description: 'A two-week assessment before the full engagement.', availability: 'planned', priority: 3, in_scope: false },
    ],
    customerGroups: [
      { id: 'cg-1', name: 'Family-owned manufacturers, 20 to 200 employees (fictional)', description: null, is_priority: true },
      { id: 'cg-2', name: 'Private equity add-on targets (fictional)', description: null, is_priority: false },
    ],
    personas: [
      { id: OWN, customer_group_id: 'cg-1', role_title: 'Owner', responsibility: 'Runs the company and decides whether to sell', purchase_roles: ['identifies_need', 'approves', 'can_block'], goal: 'Sell on good terms without surprises', problem: 'Cannot explain the numbers to a buyer', is_priority: true, evidence_status: 'observed', needs_confirmation: false },
      { id: OM, customer_group_id: 'cg-1', role_title: 'Office manager', responsibility: 'Keeps the books and pays the bills', purchase_roles: ['uses', 'implements'], goal: 'Fewer late nights at month-end', problem: 'Fixes spreadsheet errors by hand', is_priority: true, evidence_status: 'founder_belief', needs_confirmation: false },
      { id: CTRL, customer_group_id: 'cg-1', role_title: 'Outside accountant', responsibility: 'Files taxes once a year', purchase_roles: ['recommends'], goal: null, problem: null, is_priority: false, evidence_status: null, needs_confirmation: true },
    ],
    links: [
      { id: 'l-1', persona_id: null, offer_id: O, fit: 'direct', capability: 'A twelve-week rebuild of the books and forecasts', how_it_helps: 'Every number has a source a buyer can check', benefit: null, out_of_scope: 'Finding a buyer or legal work', evidence_status: 'observed' },
      { id: 'l-2', persona_id: OWN, offer_id: O, fit: 'direct', capability: 'Buyer-ready reporting package', how_it_helps: 'Answers come from one trusted report instead of memory', benefit: 'Confidence in front of buyers', out_of_scope: null, evidence_status: 'customer_reported' },
      { id: 'l-3', persona_id: OWN, offer_id: D, fit: 'planned', capability: 'Two-week sale-readiness score', how_it_helps: 'Shows what a buyer will question before they ask', benefit: 'No late surprises', out_of_scope: null, evidence_status: 'planned' },
      { id: 'l-4', persona_id: OM, offer_id: O, fit: 'indirect', capability: 'Monthly reconciliation', how_it_helps: 'Errors are caught each month, not at year end', benefit: 'Month-end takes days, not a week', out_of_scope: null, evidence_status: 'founder_belief' },
    ],
    connectionReviews: [{ persona_id: OM, marked_for_discussion: true, correction: 'She also chooses the accounting software.' }],
    notes: [{ id: 'n-1', topic_type: 'module', topic_id: 'mod-customer_personas', note_type: 'assumption', body: 'The owner is likely the first audience. Confirm on the call.', author_email: DEMO_USERS.admin.email, author_name: 'Rishari reviewer', created_at: now() }],
    activity: [{ action: 'intake.submitted', actor_email: 'partner@northfield.example', created_at: now() }],
  });
  northfield.submissions = [{ version: 1, created_at: now(), content: buildContent(northfield) }];
  return { role: 'client' as 'client' | 'admin', dataUse: { value: { ...DATA_USE_DEFAULT, reviewed: false }, updated_at: now() }, guidance: GUIDANCE.map((g) => ({ key: g.key, issue: g.issue, action: g.action, example: g.example, why: g.why, client_question: g.clientQuestion })), projects: [harbor, northfield] };
}

function focusOffers(p: Project): FocusOffer[] {
  const live = [...p.offers].sort((x, y) => (x.priority ?? 99) - (y.priority ?? 99));
  const inScope = live.filter((o) => o.in_scope);
  return (inScope.length ? inScope : live.slice(0, 1)).map((o) => ({ id: o.id, name: o.name, availability: o.availability ?? null }));
}

const priority = (p: Project) => p.personas.filter((x) => x.is_priority);
function earlierAnswers(p: Project) {
  return retired.flatMap((q) => p.answers.filter((x) => x.question_id === q.id && x.status !== 'empty').map((x) => ({
    question_key: q.key, prompt: q.prompt, offer_name: p.offers.find((o) => o.id === x.offer_id)?.name ?? null, value: x.value, status: x.status,
  })));
}

function buildContent(p: Project): Content {
  const focus = focusOffers(p);
  const entry = (q: Json, o: FocusOffer | null, pe: Json | null = null) => {
    const a = p.answers.find((x) => x.question_id === q.id && (x.offer_id ?? null) === (o?.id ?? null) && (x.persona_id ?? null) === (pe?.id ?? null));
    return { questionKey: q.key, prompt: renderPrompt(q as never, o, pe as never), offerId: o?.id ?? null, personaId: pe?.id ?? null, narrativeField: q.narrative_field, probeOf: q.probe_of, reuseFrom: q.reuse_from,
      value: a?.value ?? null, status: a?.status ?? 'empty', evidenceStatus: a?.evidence_status ?? null, reusedFromKey: a?.reused_from_key ?? null };
  };
  return {
    focusOffers: focus,
    modules: modules.map((m) => ({ key: m.key, answers: m.questions.filter((q) => !['n_stakeholders', 'cc_groups', 'cp_personas', 'sl_company', 'sl_persona'].includes(q.key)).flatMap((q) =>
      PERSONA_SCOPED(q) ? priority(p).map((pe) => entry(q, null, pe)) : q.per_offer && focus.length ? focus.map((o) => entry(q, o)) : [entry(q, null)]) })),
    offers: p.offers as never,
    customerGroups: p.customerGroups as never, personas: p.personas as never, links: p.links as never, connectionReviews: p.connectionReviews as never,
    earlierAnswers: earlierAnswers(p).map((e) => ({ questionKey: e.question_key, prompt: e.prompt, offerName: e.offer_name, value: e.value })),
  };
}

let state = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* storage unavailable */ }
  return seedState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* keep in memory */ } }
export function resetDemo() { state = seedState(); save(); }
export function setDemoRole(role: 'client' | 'admin') { state.role = role; save(); }
export function demoRole(): 'client' | 'admin' { return state.role; }

const me = () => DEMO_USERS[state.role as 'client' | 'admin'];
class HttpErr extends Error { constructor(public status: number, message: string) { super(message); } }
const proj = (id: string): Project => {
  const p = state.projects.find((x: Project) => x.id === id);
  if (!p) throw new HttpErr(404, 'Not found');
  if (!me().isAdmin && p.clientId !== me().id) throw new HttpErr(404, 'Not found');
  return p;
};
const log = (p: Project, action: string) => p.activity.unshift({ action, actor_email: me().email, created_at: now() });

function discovery(p: Project) {
  return {
    project: { id: p.id, name: p.name, company_name: p.company_name, status: p.status },
    acknowledged: p.acknowledged, ackVersion: ACK.version, modules, focusOffers: focusOffers(p),
    answers: p.answers, offers: me().isAdmin ? p.offers : p.offers.map(({ in_scope: _s, ...o }) => o),
    progress: p.progress, submissions: [...p.submissions].reverse().map(({ content: _c, ...s }) => s), attachments: p.attachments,
    stakeholders: p.stakeholders, clarifications: p.clarifications.filter((c) => c.status === 'open'),
    customerGroups: p.customerGroups, personas: p.personas, links: p.links, connectionReviews: p.connectionReviews, earlierAnswers: earlierAnswers(p),
  };
}

function coverage(p: Project, content: Content) {
  const scopesFor = (scope: string) =>
    scope === 'persona' ? (content.personas ?? []).filter((x) => x.is_priority).map((x) => ({ offer: null as FocusOffer | null, persona: { id: x.id, name: x.role_title } as { id: string; name: string } | null }))
    : scope === 'offer' ? content.focusOffers.map((o) => ({ offer: o as FocusOffer | null, persona: null }))
    : [{ offer: null, persona: null }];
  return NARRATIVE_SECTIONS.map((sec) => ({
    ...sec,
    scopes: scopesFor(sec.scope).map((sc) => ({
      ...sc,
      fields: sec.fields.map((f) => {
        const c = fieldCoverage(content, f.key, { offerId: sc.offer?.id ?? null, personaId: sc.persona?.id ?? null });
        const ov = p.overrides.find((x) => x.field_key === f.key && (x.offer_id ?? null) === (sc.offer?.id ?? null) && (x.persona_id ?? null) === (sc.persona?.id ?? null));
        return { key: f.key, label: f.label, important: !!f.important, optional: !!f.optional, status: ov?.status ?? c.status, reason: ov ? 'Set by reviewer' : c.reason,
          overridden: !!ov, questionKey: c.entry?.questionKey ?? null, prompt: c.entry?.prompt ?? null, value: c.value ?? c.entry?.value ?? null, evidenceStatus: c.entry?.evidenceStatus ?? null };
      }),
    })),
  }));
}

function approvalBasis(p: Project) {
  const last = p.submissions[p.submissions.length - 1];
  if (!last) return null;
  const content = last.content as Content;
  const cov = coverage(p, content);
  const connected = buildConnections(content);
  const assumptions: Json[] = [];
  for (const s of connected) {
    for (const m of s.missing) assumptions.push({ id: `connection:${s.personaId ?? 'company'}:missing:${m}`, kind: 'connection', scopeName: s.title, text: `Missing: ${m}.` });
    for (const u of s.uncertain) assumptions.push({ id: `connection:${s.personaId ?? 'company'}:uncertain:${u}`, kind: 'connection', scopeName: s.title, text: `Uncertain: ${u}` });
  }
  const skip = ['company.goal', 'company.problem', 'company.solution', 'company.success', 'company.consequence', 'persona.goal', 'persona.problem', 'persona.solution', 'persona.success', 'persona.consequence'];
  for (const sec of cov) for (const sc of sec.scopes) for (const f of sc.fields) {
    if (!f.important || f.status === 'captured' || f.status === 'not_applicable') continue;
    if (skip.includes(f.key) && f.status === 'not_asked') continue;
    assumptions.push({ id: `coverage:${f.key}:${sc.persona?.id ?? sc.offer?.id ?? 'company'}`, kind: 'coverage', scopeName: sc.persona?.name ?? sc.offer?.name ?? null, text: `${f.label}: ${f.status.replace('_', ' ')}. ${f.reason}` });
  }
  for (const fl of p.flags.filter((f) => !f.decision || ['accepted', 'agenda', 'clarification_requested', 'assumption'].includes(f.decision))) {
    assumptions.push({ id: `flag:${fl.id}`, kind: 'flag', scopeName: fl.persona_name ?? fl.offer_name, text: `${fl.issue} ${fl.noticed}` });
  }
  return { snapshot: { id: `snap-${p.id}-${last.version}`, version: last.version, createdAt: last.created_at }, coverage: cov, connections: connected, assumptions };
}

async function handle(method: string, path: string, body: unknown, query: URLSearchParams): Promise<unknown> {
  const b = (body ?? {}) as Json;
  let m: RegExpMatchArray | null;
  if (path === '/api/config') return { authMode: 'dev', clerkPublishableKey: '' };
  if (path === '/api/me') return { user: me(), projects: me().isAdmin ? [] : state.projects.filter((p: Project) => p.clientId === me().id).map((p: Project) => ({ id: p.id, name: p.name, company_name: p.company_name, status: p.status })) };
  if (path === '/api/data-use') return state.dataUse;
  if (path === '/api/dev/logout') return { ok: true };

  if ((m = path.match(/^\/api\/projects\/([^/]+)\/(.+)$/))) {
    const p = proj(m[1]); const rest = m[2];
    if (rest === 'discovery') return discovery(p);
    if (rest === 'connections') return buildConnections(buildContent(p));
    if (/^attachments\/[^/]+\/link$/.test(rest)) return { url: '#', expiresInSeconds: 300 };
    if (me().isAdmin && method !== 'GET') throw new HttpErr(403, 'You do not have access to this.');
    if (rest === 'acknowledgment') { p.acknowledged = true; log(p, 'acknowledgment.recorded'); save(); return { ok: true }; }
    if (!p.acknowledged && method !== 'GET') throw new HttpErr(409, 'Please review and accept the welcome information first.');
    let s: RegExpMatchArray | null;
    if ((s = rest.match(/^answers\/(.+)$/))) {
      const q = allQuestions.find((x) => x.key === s![1]); const offerId = query.get('offerId') || null; const personaId = query.get('personaId') || null;
      if (!q) throw new HttpErr(404, 'Not found');
      if (PERSONA_SCOPED(q) && !priority(p).some((x) => x.id === personaId)) throw new HttpErr(400, 'Choose which persona this answer is about.');
      if (!PERSONA_SCOPED(q) && personaId) throw new HttpErr(400, 'This question is about the whole customer company, not one persona.');
      if (b.status === 'not_applicable' && !q.allow_not_applicable) throw new HttpErr(400, 'This question needs an answer or "I\'m not sure yet."');
      const cur = p.answers.find((x) => x.question_id === q.id && (x.offer_id ?? null) === offerId && (x.persona_id ?? null) === personaId);
      const revision = ((cur?.revision as number) ?? 0) + 1;
      const next = { question_id: q.id, offer_id: offerId, persona_id: personaId, value: b.status === 'not_applicable' ? null : b.value ?? null, status: b.status, context_note: b.contextNote ?? null, evidence_status: b.evidenceStatus ?? null, reused_from_key: b.reusedFromKey ?? null, revision };
      p.answers = [...p.answers.filter((x) => x !== cur), next];
      if (b.status !== 'empty') p.clarifications.forEach((c) => { if (c.question_key === q.key && (c.offer_id ?? null) === offerId && (c.persona_id ?? null) === personaId && c.status === 'open') c.status = 'answered'; });
      save(); return { revision, updatedAt: now() };
    }
    if (rest === 'offers' && method === 'POST') {
      p.offers.push({ id: uid('o'), name: b.name, description: b.description, intended_customer: b.intendedCustomer, availability: b.availability, pricing_approach: b.pricingApproach, delivery_model: b.deliveryModel, priority: b.priority, in_scope: false });
      save(); return { ok: true };
    }
    if ((s = rest.match(/^offers\/(.+)$/))) {
      const i = p.offers.findIndex((o) => o.id === s![1]);
      if (i < 0) throw new HttpErr(404, 'Not found');
      if (method === 'DELETE') p.offers.splice(i, 1);
      else p.offers[i] = { ...p.offers[i], name: b.name, description: b.description, intended_customer: b.intendedCustomer, availability: b.availability, pricing_approach: b.pricingApproach, delivery_model: b.deliveryModel, priority: b.priority };
      save(); return { ok: true };
    }
    if (rest === 'stakeholders' && method === 'POST') {
      p.stakeholders.push({ id: uid('s'), offer_id: b.offerId ?? null, label: b.label, roles: b.roles ?? [], desired_outcome: b.desiredOutcome, wants_to_prevent: b.wantsToPrevent, needs_to_believe: b.needsToBelieve, decision_role: b.decisionRole, evidence_status: b.evidenceStatus });
      save(); return { ok: true };
    }
    if ((s = rest.match(/^stakeholders\/(.+)$/))) {
      const i = p.stakeholders.findIndex((x) => x.id === s![1]);
      if (i < 0) throw new HttpErr(404, 'Not found');
      if (method === 'DELETE') p.stakeholders.splice(i, 1);
      else p.stakeholders[i] = { ...p.stakeholders[i], offer_id: b.offerId ?? null, label: b.label, roles: b.roles ?? [], desired_outcome: b.desiredOutcome, wants_to_prevent: b.wantsToPrevent, needs_to_believe: b.needsToBelieve, decision_role: b.decisionRole, evidence_status: b.evidenceStatus };
      save(); return { ok: true };
    }
    if ((s = rest.match(/^customer-groups(?:\/(.+))?$/))) {
      const id = s[1];
      if (method === 'DELETE') { p.customerGroups = p.customerGroups.filter((g) => g.id !== id); if (!p.customerGroups.some((g) => g.is_priority) && p.customerGroups[0]) p.customerGroups[0].is_priority = true; save(); return { ok: true }; }
      if (!b.name?.trim()) throw new HttpErr(400, 'Please name this type of customer company.');
      const makePriority = b.isPriority || !p.customerGroups.length;
      if (makePriority) p.customerGroups.forEach((g) => { g.is_priority = false; });
      if (id) { const g = p.customerGroups.find((x) => x.id === id); if (!g) throw new HttpErr(404, 'Not found'); Object.assign(g, { name: b.name, is_priority: makePriority || g.is_priority }); save(); return { id }; }
      const g = { id: uid('cg'), name: b.name, description: b.description ?? null, is_priority: makePriority }; p.customerGroups.push(g); save(); return { id: g.id };
    }
    if ((s = rest.match(/^personas(?:\/(.+))?$/))) {
      const id = s[1];
      if (method === 'DELETE') { p.personas = p.personas.filter((x) => x.id !== id); p.links = p.links.filter((l) => l.persona_id !== id); save(); return { ok: true }; }
      if (!b.roleTitle?.trim()) throw new HttpErr(400, "Please give this persona's role or job title.");
      const row = { role_title: b.roleTitle, responsibility: b.responsibility ?? null, purchase_roles: b.purchaseRoles ?? [], goal: b.goal ?? null, problem: b.problem ?? null, is_priority: b.isPriority ?? true, evidence_status: b.evidenceStatus ?? null, needs_confirmation: false, customer_group_id: p.customerGroups.find((g) => g.is_priority)?.id ?? null };
      if (id) { const x = p.personas.find((y) => y.id === id); if (!x) throw new HttpErr(404, 'Not found'); Object.assign(x, row); save(); return { id }; }
      const x = { id: uid('pe'), ...row }; p.personas.push(x); save(); return { id: x.id };
    }
    if ((s = rest.match(/^links(?:\/(.+))?$/))) {
      const id = s[1];
      if (method === 'DELETE') { p.links = p.links.filter((l) => l.id !== id); save(); return { ok: true }; }
      const none = b.fit === 'none';
      if (!none && b.fit !== 'unknown' && !b.offerId) throw new HttpErr(400, 'Choose which product or service this is about.');
      const row = { persona_id: b.personaId ?? null, offer_id: none ? null : b.offerId ?? null, fit: b.fit, capability: b.capability ?? null, how_it_helps: b.howItHelps ?? null, benefit: b.benefit ?? null, out_of_scope: b.outOfScope ?? null, evidence_status: b.evidenceStatus ?? null };
      if (id) { const l = p.links.find((x) => x.id === id); if (!l) throw new HttpErr(404, 'Not found'); Object.assign(l, row); save(); return { id }; }
      const l = { id: uid('l'), ...row }; p.links.push(l); save(); return { id: l.id };
    }
    if (rest === 'connection-review') {
      const pid = b.personaId ?? null;
      p.connectionReviews = [...p.connectionReviews.filter((r) => (r.persona_id ?? null) !== pid), { persona_id: pid, marked_for_discussion: !!b.markedForDiscussion, correction: b.correction ?? null }];
      save(); return { ok: true };
    }
    if ((s = rest.match(/^modules\/(.+)\/progress$/))) {
      const mid = `mod-${s[1]}`;
      const cur = p.progress.find((x) => x.module_id === mid) ?? { module_id: mid, marked_for_discussion: false, client_correction: null };
      if (b.markedForDiscussion !== undefined) cur.marked_for_discussion = b.markedForDiscussion;
      if (b.clientCorrection !== undefined) cur.client_correction = b.clientCorrection;
      p.progress = [...p.progress.filter((x) => x.module_id !== mid), cur]; save(); return { ok: true };
    }
    if (rest === 'attachments' && method === 'POST') {
      const fd = body as FormData;
      const f = fd.get('file') as File;
      if (!/\.(pdf|docx|txt)$/i.test(f.name)) throw new HttpErr(415, 'Only PDF, DOCX, and TXT files can be uploaded.');
      p.attachments.push({ id: uid('a'), module_id: `mod-${fd.get('moduleKey')}`, original_name: f.name, mime_type: f.type, size_bytes: f.size, created_at: now() });
      save(); return { ok: true };
    }
    if ((s = rest.match(/^attachments\/([^/]+)$/)) && method === 'DELETE') { p.attachments = p.attachments.filter((a) => a.id !== s![1]); save(); return { ok: true }; }
    if (rest === 'submit') {
      p.submissions.push({ version: p.submissions.length + 1, created_at: now(), content: buildContent(p) });
      p.approvals.forEach((a) => { a.stale = true; });
      if (p.status === 'discovery') p.status = 'submitted';
      log(p, 'intake.submitted'); save(); return { ok: true };
    }
  }

  if (path.startsWith('/api/admin')) {
    if (!me().isAdmin) throw new HttpErr(403, 'You do not have access to this.');
    if (path === '/api/admin/data-use') {
      if (method === 'PUT') {
        if (b.reviewed && (b.sections as { body: string }[]).some((x) => /to be completed/i.test(x.body))) throw new HttpErr(400, 'Replace every placeholder before marking this page as reviewed.');
        state.dataUse = { value: b, updated_at: now() }; save(); return { ok: true };
      }
      return state.dataUse;
    }
    if (path === '/api/admin/guidance') return state.guidance;
    if ((m = path.match(/^\/api\/admin\/guidance\/(.+)$/))) {
      if (/[\u2013\u2014]/.test(Object.values(b).join(' '))) throw new HttpErr(400, 'Please remove em and en dashes. Use a period, comma, or parentheses.');
      const g = state.guidance.find((x: Json) => x.key === m![1]);
      if (g) Object.assign(g, { issue: b.issue, action: b.action, example: b.example, why: b.why, client_question: b.clientQuestion });
      save(); return { ok: true };
    }
    if (path === '/api/admin/projects') {
      if (method === 'POST') {
        const p = blank({ name: b.name as string, company_name: (b.companyName as string) ?? '', is_fictional: !!b.isFictional });
        log(p, 'project.created'); state.projects.unshift(p); save(); return { id: p.id };
      }
      return state.projects.map((p: Project) => ({ id: p.id, name: p.name, company_name: p.company_name, status: p.status, is_fictional: p.is_fictional, client_email: p.clientEmail, answer_count: p.answers.filter((x) => x.status !== 'empty').length, submitted_version: p.submissions.length || null, created_at: p.created_at }));
    }
    if ((m = path.match(/^\/api\/admin\/projects\/([^/]+)\/?(.*)$/))) {
      const p = proj(m[1]); const rest = m[2];
      if (rest === '') return {
        project: { id: p.id, name: p.name, company_name: p.company_name, status: p.status, is_fictional: p.is_fictional },
        client: p.clientEmail ? { email: p.clientEmail, display_name: null } : null, invitation: null,
        acknowledgment: p.acknowledged ? { ack_version: ACK.version, created_at: now() } : null,
        snapshots: [...p.submissions].reverse().map((x) => ({ id: `snap-${x.version}`, version: x.version, kind: 'client_intake', created_at: x.created_at })),
      };
      if (rest === 'invitations') return { link: `(preview) invitation link for ${b.email} would appear here. Nothing is sent.`, token: 'demo' };
      if (rest === 'answers') return discovery(p);
      if (rest === 'notes') {
        if (method === 'POST') { p.notes.unshift({ id: uid('n'), topic_type: b.topicType, topic_id: b.topicId, note_type: b.noteType, body: b.body, author_email: me().email, author_name: me().displayName, created_at: now() }); log(p, 'note.added'); save(); return { ok: true }; }
        return p.notes;
      }
      if (rest === 'offers') return p.offers;
      let s: RegExpMatchArray | null;
      if ((s = rest.match(/^offers\/(.+)\/scope$/))) { const o = p.offers.find((x) => x.id === s![1]); if (o) o.in_scope = b.inScope; log(p, 'offer.scope_set'); save(); return { ok: true }; }
      if (rest === 'activity') return p.activity;
      if (rest === 'narrative') return { coverage: coverage(p, buildContent(p)), clarifications: [...p.clarifications].reverse() };
      if (rest === 'coverage') {
        p.overrides = p.overrides.filter((x) => !(x.field_key === b.fieldKey && (x.offer_id ?? null) === (b.offerId ?? null) && (x.persona_id ?? null) === (b.personaId ?? null)));
        if (b.status) p.overrides.push({ field_key: b.fieldKey, offer_id: b.offerId ?? null, persona_id: b.personaId ?? null, status: b.status });
        save(); return { ok: true };
      }
      if (rest === 'clarifications') {
        if (!p.clarifications.some((c) => c.question_key === b.questionKey && (c.offer_id ?? null) === (b.offerId ?? null) && (c.persona_id ?? null) === (b.personaId ?? null) && c.status === 'open')) {
          p.clarifications.push({ id: uid('c'), question_key: b.questionKey, offer_id: b.offerId ?? null, persona_id: b.personaId ?? null, note: b.note ?? null, status: 'open', created_at: now() });
        }
        save(); return { ok: true };
      }
      if ((s = rest.match(/^clarifications\/(.+)\/withdraw$/))) { const c = p.clarifications.find((x) => x.id === s![1]); if (c) c.status = 'withdrawn'; save(); return { ok: true }; }
      if (rest === 'checks') {
        const content = buildContent(p);
        const hits = runChecks(content);
        let created = 0;
        for (const h of hits) {
          if (p.flags.some((f) => f.check_key === h.check && (f.offer_id ?? null) === h.offerId && (f.persona_id ?? null) === h.personaId && !['dismissed', 'resolved'].includes(f.decision))) continue;
          const g = state.guidance.find((x: Json) => x.key === h.check);
          if (!g) continue;
          p.flags.push({ id: uid('f'), check_key: h.check, offer_id: h.offerId, offer_name: content.focusOffers.find((o) => o.id === h.offerId)?.name ?? null,
            persona_id: h.personaId, persona_name: p.personas.find((x) => x.id === h.personaId)?.role_title ?? null, issue: g.issue, priority: h.priority,
            source_refs: h.refs.map((e) => ({ questionKey: e.questionKey, offerId: e.offerId, personaId: e.personaId ?? null, prompt: e.prompt })), noticed: h.noticed, suggested_action: g.action, example: g.example, why: g.why, client_question: g.client_question, decision: null, reviewer_note: null });
          created++;
        }
        save(); return { found: hits.length, created };
      }
      if (rest === 'flags') return [...p.flags].sort((x, y) => Number(['dismissed', 'resolved'].includes(x.decision)) - Number(['dismissed', 'resolved'].includes(y.decision)));
      if ((s = rest.match(/^flags\/(.+)$/))) {
        const f = p.flags.find((x) => x.id === s![1]);
        if (!f) throw new HttpErr(404, 'Not found');
        if (b.decision === 'clarification_requested') {
          const ref = f.source_refs[0];
          if (!ref) throw new HttpErr(400, 'This flag has no linked question to ask about. Add it to the agenda instead.');
          p.clarifications.push({ id: uid('c'), question_key: ref.questionKey, offer_id: ref.offerId, persona_id: ref.personaId ?? null, note: f.client_question, status: 'open', created_at: now() });
        }
        f.decision = b.decision; save(); return f;
      }
      if (rest === 'source-brief') {
        const last = p.submissions[p.submissions.length - 1];
        if (!last) throw new HttpErr(409, 'The client has not submitted discovery yet.');
        const ap = p.approvals.find((x) => !x.stale);
        const v = ap ? Number(ap.target_version) : last.version;
        const snap = p.submissions.find((x) => x.version === v) ?? last;
        return { version: snap.version, approved: !!ap, markdown: buildSourceBrief(snap.content, { company: p.company_name || p.name, version: snap.version, approvedAt: ap ? ap.created_at.slice(0, 10) : null, assumptions: ap?.accepted_assumptions ?? [] }) };
      }
      if (rest === 'source-approval') {
        const basis = approvalBasis(p);
        if (method === 'POST') {
          if (!basis) throw new HttpErr(409, 'The client has not submitted discovery yet.');
          if (basis.snapshot.version !== b.snapshotVersion) throw new HttpErr(409, 'A newer submission exists. Review the latest version before approving.');
          const missing = basis.assumptions.filter((x) => !(b.acceptedAssumptions as string[]).includes(x.id));
          if (missing.length) throw new HttpErr(400, `Accept or resolve each open assumption first (${missing.length} remaining).`);
          p.approvals.forEach((a) => { a.stale = true; });
          p.approvals.unshift({ id: uid('ap'), target_version: String(basis.snapshot.version), stale: false, created_at: now(), actor_email: me().email, accepted_assumptions: basis.assumptions });
          if (['discovery', 'submitted'].includes(p.status)) p.status = 'in_review';
          log(p, 'source.approved'); save(); return { ok: true };
        }
        return { basis, approvals: p.approvals };
      }
    }
  }
  throw new HttpErr(404, 'Not found');
}

export function installMockApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rel = url.replace(location.origin, '');
    const [path, qs] = rel.split('?');
    if (!path.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown = init?.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* leave as is */ } }
    await new Promise((r) => setTimeout(r, 120)); // makes save states visible, like a real network
    try {
      const out = await handle(method, path, body, new URLSearchParams(qs ?? ''));
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      const err = e as HttpErr;
      return new Response(JSON.stringify({ error: 'error', message: err.message }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
    }
  };
}
