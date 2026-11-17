// In-browser stand-in for the server, used only by the Claude-hosted preview build.
// Everything here is fictional and lives in the viewer's own browser. Nothing is sent anywhere.
// Coverage and checks use the same shared rules as the real server.
import { MODULES, DATA_USE_DEFAULT } from '../../../server/seed/questions';
import { GUIDANCE } from '../../../server/seed/guidance';
import { ACK } from '@shared/content';
import { NARRATIVE_SECTIONS, fieldCoverage, runChecks, renderPrompt } from '@shared/narrative';
import type { Content, FocusOffer } from '@shared/narrative';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const KEY = 'rishari-demo-state-v2';

export const DEMO_USERS = {
  client: { id: 'u-client', email: 'founder@harborlane.example', displayName: 'Dana Reyes (fictional)', isAdmin: false },
  admin: { id: 'u-admin', email: 'reviewer@rishari.example', displayName: 'Rishari reviewer', isAdmin: true },
};

let seq = 1;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const now = () => new Date().toISOString();

const modules = MODULES.map((m, mi) => ({
  id: `mod-${m.key}`, key: m.key, position: mi + 1, title: m.title, why: m.why, opening: m.opening ?? null,
  questions: m.questions.map((q, qi) => ({
    id: `q-${q.key}`, key: q.key, module_id: `mod-${m.key}`, position: qi + 1, version: q.revision ?? 1,
    kind: q.kind, input_type: q.input, prompt: q.prompt, help_text: q.help ?? null,
    thinking_prompts: q.thinking ?? [], options: q.options ?? [], allow_not_sure: q.allowNotSure ?? true,
    per_offer: q.perOffer ?? false, planned_prompt: q.plannedPrompt ?? null, probe_of: q.probeOf ?? null,
    narrative_field: q.field ?? null, asks_evidence: q.evidence ?? false, allow_not_applicable: q.allowNA ?? false,
    reuse_from: q.reuseFrom ?? [], probe_always: q.probeAlways ?? false, na_label: q.naLabel ?? null,
  })),
}));
const allQuestions = modules.flatMap((m) => m.questions);
const qByKey = (k: string) => allQuestions.find((q) => q.key === k)!;

type Project = {
  id: string; name: string; company_name: string; status: string; is_fictional: boolean; created_at: string;
  clientId: string | null; clientEmail: string | null; acknowledged: boolean;
  answers: Json[]; offers: Json[]; progress: Json[]; submissions: Json[]; attachments: Json[]; notes: Json[]; activity: Json[];
  stakeholders: Json[]; clarifications: Json[]; flags: Json[]; overrides: Json[]; approvals: Json[];
};

const blank = (p: Partial<Project>): Project => ({
  id: uid('p'), name: '', company_name: '', status: 'discovery', is_fictional: true, created_at: now(), clientId: null, clientEmail: null,
  acknowledged: false, answers: [], offers: [], progress: [], submissions: [], attachments: [], notes: [], activity: [],
  stakeholders: [], clarifications: [], flags: [], overrides: [], approvals: [], ...p,
});

function seedState() {
  const a = (key: string, value: unknown, status = 'answered', offer_id: string | null = null, evidence_status: string | null = null) =>
    ({ question_id: `q-${key}`, offer_id, value, status, context_note: null, evidence_status, reused_from_key: null, revision: 1 });
  const harbor = blank({ id: 'p-harbor', name: 'Harbor Lane discovery', company_name: 'Harbor Lane Fictional Co', clientId: DEMO_USERS.client.id, clientEmail: DEMO_USERS.client.email,
    activity: [{ action: 'project.created', actor_email: DEMO_USERS.admin.email, created_at: now() }] });
  const O = 'o-1';
  const northfield = blank({
    id: 'p-northfield', name: 'Northfield discovery', company_name: 'Northfield Advisory', status: 'submitted', clientId: 'u-other', clientEmail: 'partner@northfield.example', acknowledged: true,
    answers: [
      a('m1_company', 'Northfield Advisory'), a('m1_model', ['Consulting or professional services']), a('m1_stage', ['Serving early customers']),
      a('m1_what', 'We help family-owned manufacturers get their books and forecasting in shape before a sale or a second-generation handoff.'),
      a('m1_available', 'A twelve-week finance cleanup engagement and a monthly CFO retainer.'),
      a('m2_necessary', 'Our founder watched her father nearly lose a buyer because nobody could explain three years of numbers.'),
      a('m5_benefits', 'Owners of manufacturers with 20 to 200 employees who expect to sell within a few years.'),
      a('m5_first', null, 'discuss'),
      a('n_char_buyer', 'The owner, usually the founder or their adult child taking over.', 'answered', O, 'observed'),
      a('n_char_org', 'Family-owned manufacturer', 'answered', O),
      a('n_char_goal', 'Get the business ready to sell without surprises in due diligence.', 'answered', O, 'customer_reported'),
      a('n_prob_practical', 'Three years of numbers no one can explain, spread across spreadsheets.', 'answered', O, 'observed'),
      a('n_prob_internal', null, 'not_sure', O),
      a('n_prob_philosophical', null, 'not_applicable', O),
      a('n_fail_continue', 'Buyers will walk away and the business will be worth nothing.', 'answered', O, 'founder_belief'),
      a('n_success_business', 'A buyer can trust the numbers, and the sale closes on the expected timeline.', 'answered', O, 'founder_belief'),
      a('n_plan_how', 'We rebuild the ledger in our own accounting stack and reconcile it monthly.', 'answered', O),
      a('n_action_ready', 'Book a 30-minute fit call.', 'answered', O),
      a('n_guide_empathy', 'Our founder grew up in a family manufacturing business and went through a sale.'),
    ],
    offers: [
      { id: O, name: 'Finance cleanup engagement', description: 'Twelve weeks to get books, controls, and forecasts buyer-ready.', availability: 'available', priority: 1, in_scope: true },
      { id: 'o-2', name: 'Fractional CFO retainer', description: 'Monthly leadership after the cleanup.', availability: 'available', priority: 2, in_scope: false },
      { id: 'o-3', name: 'Sale-readiness diagnostic', description: 'A two-week assessment before committing to the full engagement.', availability: 'planned', priority: 3, in_scope: false },
    ],
    stakeholders: [
      { id: 's-1', offer_id: O, label: 'Owner', roles: ['primary_buyer', 'approver'], desired_outcome: 'Sell on good terms without surprises', wants_to_prevent: 'A buyer walking away late in diligence', needs_to_believe: 'The team has done this before', decision_role: 'Final say', evidence_status: 'observed' },
      { id: 's-2', offer_id: O, label: 'Office manager', roles: ['user'], desired_outcome: 'Fewer late-night spreadsheet fixes', wants_to_prevent: 'Being blamed for old errors', needs_to_believe: null, decision_role: 'Gets asked for an opinion', evidence_status: 'founder_belief' },
    ],
    progress: [{ module_id: 'mod-fit', marked_for_discussion: true, client_correction: null }],
    notes: [{ id: 'n-1', topic_type: 'module', topic_id: 'mod-fit', note_type: 'assumption', body: 'Likely first audience is owners within three years of a sale. Confirm on the call.', author_email: DEMO_USERS.admin.email, author_name: 'Rishari reviewer', created_at: now() }],
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

function buildContent(p: Project): Content {
  const focus = focusOffers(p);
  const entry = (q: Json, o: FocusOffer | null) => {
    const a = p.answers.find((x) => x.question_id === q.id && (x.offer_id ?? null) === (o?.id ?? null));
    return { questionKey: q.key, prompt: renderPrompt(q as never, o), offerId: o?.id ?? null, narrativeField: q.narrative_field, probeOf: q.probe_of, reuseFrom: q.reuse_from,
      value: a?.value ?? null, status: a?.status ?? 'empty', evidenceStatus: a?.evidence_status ?? null, reusedFromKey: a?.reused_from_key ?? null };
  };
  return {
    focusOffers: focus,
    modules: modules.map((m) => ({ key: m.key, answers: m.questions.filter((q) => q.key !== 'n_stakeholders').flatMap((q) => (q.per_offer && focus.length ? focus.map((o) => entry(q, o)) : [entry(q, null)])) })),
    stakeholders: p.stakeholders as never,
    offers: p.offers as never,
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
  };
}

function coverage(p: Project, content: Content) {
  const scopes: (FocusOffer | null)[] = content.focusOffers.length ? content.focusOffers : [null];
  return NARRATIVE_SECTIONS.map((sec) => ({
    ...sec,
    scopes: (sec.offer ? scopes : [null]).map((o) => ({
      offer: o,
      fields: sec.fields.map((f) => {
        const c = fieldCoverage(content, f.key, o?.id ?? null);
        const ov = p.overrides.find((x) => x.field_key === f.key && (x.offer_id ?? null) === (o?.id ?? null));
        return { key: f.key, label: f.label, important: !!f.important, optional: !!f.optional, status: ov?.status ?? c.status, reason: ov ? 'Set by reviewer' : c.reason,
          overridden: !!ov, questionKey: c.entry?.questionKey ?? null, prompt: c.entry?.prompt ?? null, value: c.entry?.value ?? null, evidenceStatus: c.entry?.evidenceStatus ?? null };
      }),
    })),
  }));
}

function approvalBasis(p: Project) {
  const last = p.submissions[p.submissions.length - 1];
  if (!last) return null;
  const cov = coverage(p, last.content);
  const assumptions: Json[] = [];
  for (const sec of cov) for (const sc of sec.scopes) for (const f of sc.fields) {
    if (!f.important || f.status === 'captured' || f.status === 'not_applicable') continue;
    assumptions.push({ id: `coverage:${f.key}:${sc.offer?.id ?? 'company'}`, kind: 'coverage', offerName: sc.offer?.name ?? null, text: `${f.label}: ${f.status.replace('_', ' ')}. ${f.reason}` });
  }
  for (const fl of p.flags.filter((f) => !f.decision || ['accepted', 'agenda', 'clarification_requested', 'assumption'].includes(f.decision))) {
    assumptions.push({ id: `flag:${fl.id}`, kind: 'flag', offerName: fl.offer_name, text: `${fl.issue} ${fl.noticed}` });
  }
  return { snapshot: { id: `snap-${p.id}-${last.version}`, version: last.version, createdAt: last.created_at }, coverage: cov, assumptions };
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
    if (/^attachments\/[^/]+\/link$/.test(rest)) return { url: '#', expiresInSeconds: 300 };
    if (me().isAdmin && method !== 'GET') throw new HttpErr(403, 'You do not have access to this.');
    if (rest === 'acknowledgment') { p.acknowledged = true; log(p, 'acknowledgment.recorded'); save(); return { ok: true }; }
    if (!p.acknowledged && method !== 'GET') throw new HttpErr(409, 'Please review and accept the welcome information first.');
    let s: RegExpMatchArray | null;
    if ((s = rest.match(/^answers\/(.+)$/))) {
      const q = qByKey(s[1]); const offerId = query.get('offerId') || null;
      if (!q) throw new HttpErr(404, 'Not found');
      if (b.status === 'not_applicable' && !q.allow_not_applicable) throw new HttpErr(400, 'This question needs an answer or "I\'m not sure yet."');
      const cur = p.answers.find((x) => x.question_id === q.id && (x.offer_id ?? null) === offerId);
      const revision = ((cur?.revision as number) ?? 0) + 1;
      const next = { question_id: q.id, offer_id: offerId, value: b.status === 'not_applicable' ? null : b.value ?? null, status: b.status, context_note: b.contextNote ?? null, evidence_status: b.evidenceStatus ?? null, reused_from_key: b.reusedFromKey ?? null, revision };
      p.answers = [...p.answers.filter((x) => x !== cur), next];
      if (b.status !== 'empty') p.clarifications.forEach((c) => { if (c.question_key === q.key && (c.offer_id ?? null) === offerId && c.status === 'open') c.status = 'answered'; });
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
      if (/[–—]/.test(Object.values(b).join(' '))) throw new HttpErr(400, 'Please remove em and en dashes. Use a period, comma, or parentheses.');
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
        p.overrides = p.overrides.filter((x) => !(x.field_key === b.fieldKey && (x.offer_id ?? null) === (b.offerId ?? null)));
        if (b.status) p.overrides.push({ field_key: b.fieldKey, offer_id: b.offerId ?? null, status: b.status });
        save(); return { ok: true };
      }
      if (rest === 'clarifications') {
        if (!p.clarifications.some((c) => c.question_key === b.questionKey && (c.offer_id ?? null) === (b.offerId ?? null) && c.status === 'open')) {
          p.clarifications.push({ id: uid('c'), question_key: b.questionKey, offer_id: b.offerId ?? null, note: b.note ?? null, status: 'open', created_at: now() });
        }
        save(); return { ok: true };
      }
      if ((s = rest.match(/^clarifications\/(.+)\/withdraw$/))) { const c = p.clarifications.find((x) => x.id === s![1]); if (c) c.status = 'withdrawn'; save(); return { ok: true }; }
      if (rest === 'checks') {
        const content = buildContent(p);
        const hits = runChecks(content);
        let created = 0;
        for (const h of hits) {
          if (p.flags.some((f) => f.check_key === h.check && (f.offer_id ?? null) === h.offerId && !['dismissed', 'resolved'].includes(f.decision))) continue;
          const g = state.guidance.find((x: Json) => x.key === h.check);
          if (!g) continue;
          p.flags.push({ id: uid('f'), check_key: h.check, offer_id: h.offerId, offer_name: content.focusOffers.find((o) => o.id === h.offerId)?.name ?? null, issue: g.issue, priority: h.priority,
            source_refs: h.refs.map((e) => ({ questionKey: e.questionKey, offerId: e.offerId, prompt: e.prompt })), noticed: h.noticed, suggested_action: g.action, example: g.example, why: g.why, client_question: g.client_question, decision: null, reviewer_note: null });
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
          p.clarifications.push({ id: uid('c'), question_key: ref.questionKey, offer_id: ref.offerId, note: f.client_question, status: 'open', created_at: now() });
        }
        f.decision = b.decision; save(); return f;
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
