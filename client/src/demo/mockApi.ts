// In-browser stand-in for the server, used only by the Claude-hosted preview build.
// Everything here is fictional and lives in the viewer's own browser. Nothing is sent anywhere.
import { MODULES, DATA_USE_DEFAULT } from '../../../server/seed/questions';
import { ACK } from '@shared/content';

type Json = Record<string, unknown>;
const KEY = 'rishari-demo-state-v1';

export const DEMO_USERS = {
  client: { id: 'u-client', email: 'founder@harborlane.example', displayName: 'Dana Reyes (fictional)', isAdmin: false },
  admin: { id: 'u-admin', email: 'reviewer@rishari.example', displayName: 'Rishari reviewer', isAdmin: true },
};

let seq = 1;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const now = () => new Date().toISOString();

function buildModules() {
  return MODULES.map((m, mi) => ({
    id: `mod-${m.key}`, key: m.key, position: mi + 1, title: m.title, why: m.why, opening: m.opening ?? null,
    questions: m.questions.map((q, qi) => ({
      id: `q-${q.key}`, key: q.key, module_id: `mod-${m.key}`, position: qi + 1, version: 1,
      kind: q.kind, input_type: q.input, prompt: q.prompt, help_text: q.help ?? null,
      thinking_prompts: q.thinking ?? [], options: q.options ?? [], allow_not_sure: q.allowNotSure ?? true,
    })),
  }));
}

type Project = {
  id: string; name: string; company_name: string; status: string; is_fictional: boolean; created_at: string;
  clientId: string | null; clientEmail: string | null; acknowledged: boolean;
  answers: Json[]; offers: Json[]; progress: Json[]; submissions: Json[]; attachments: Json[]; notes: Json[]; activity: Json[];
};

function seedState() {
  const a = (key: string, value: unknown, status = 'answered') => ({ question_id: `q-${key}`, value, status, context_note: null, revision: 1 });
  const harbor: Project = {
    id: 'p-harbor', name: 'Harbor Lane discovery', company_name: 'Harbor Lane Fictional Co', status: 'discovery', is_fictional: true,
    created_at: now(), clientId: DEMO_USERS.client.id, clientEmail: DEMO_USERS.client.email, acknowledged: false,
    answers: [], offers: [], progress: [], submissions: [], attachments: [], notes: [],
    activity: [{ action: 'project.created', actor_email: DEMO_USERS.admin.email, created_at: now() }],
  };
  const northfield: Project = {
    id: 'p-northfield', name: 'Northfield discovery', company_name: 'Northfield Advisory', status: 'submitted', is_fictional: true,
    created_at: now(), clientId: 'u-other', clientEmail: 'partner@northfield.example', acknowledged: true,
    answers: [
      a('m1_company', 'Northfield Advisory'),
      a('m1_model', ['Consulting or professional services']),
      a('m1_stage', ['Serving early customers']),
      a('m1_what', 'We help family-owned manufacturers get their books and forecasting in shape before a sale or a second-generation handoff.'),
      a('m1_available', 'A twelve-week finance cleanup engagement and a monthly CFO retainer.'),
      a('m1_developing', 'A shorter diagnostic we can sell before the full engagement.'),
      a('m2_necessary', 'Our founder watched her father nearly lose a buyer because nobody could explain three years of numbers.'),
      a('m5_first', null, 'discuss'),
      a('m8_differently', "We've sat in the owner's chair. We don't hand over a report and leave."),
      a('m9_learned', null, 'not_sure'),
    ],
    offers: [
      { id: 'o-1', name: 'Finance cleanup engagement', description: 'Twelve weeks to get books, controls, and forecasts buyer-ready.', availability: 'available', priority: 1, in_scope: true },
      { id: 'o-2', name: 'Fractional CFO retainer', description: 'Monthly leadership after the cleanup.', availability: 'available', priority: 2, in_scope: false },
      { id: 'o-3', name: 'Sale-readiness diagnostic', description: 'A two-week assessment before committing to the full engagement.', availability: 'planned', priority: 3, in_scope: false },
    ],
    progress: [{ module_id: 'mod-fit', marked_for_discussion: true, client_correction: null }],
    submissions: [{ version: 1, created_at: now() }],
    attachments: [],
    notes: [{ id: 'n-1', topic_type: 'module', topic_id: 'mod-fit', note_type: 'assumption', body: 'Likely first audience is owners within three years of a sale. Confirm on the call.', author_email: DEMO_USERS.admin.email, author_name: 'Rishari reviewer', created_at: now() }],
    activity: [{ action: 'intake.submitted', actor_email: 'partner@northfield.example', created_at: now() }],
  };
  return { role: 'client' as 'client' | 'admin', dataUse: { value: { ...DATA_USE_DEFAULT, reviewed: false }, updated_at: now() }, projects: [harbor, northfield] };
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

const modules = buildModules();
const me = () => DEMO_USERS[state.role as 'client' | 'admin'];
const proj = (id: string): Project => {
  const p = state.projects.find((x: Project) => x.id === id);
  if (!p) throw new HttpErr(404, 'Not found');
  if (!me().isAdmin && p.clientId !== me().id) throw new HttpErr(404, 'Not found');
  return p;
};
class HttpErr extends Error { constructor(public status: number, message: string) { super(message); } }
const log = (p: Project, action: string) => p.activity.unshift({ action, actor_email: me().email, created_at: now() });

function discovery(p: Project) {
  return {
    project: { id: p.id, name: p.name, company_name: p.company_name, status: p.status },
    acknowledged: p.acknowledged, ackVersion: ACK.version, modules,
    answers: p.answers, offers: me().isAdmin ? p.offers : p.offers.map(({ in_scope: _s, ...o }) => o),
    progress: p.progress, submissions: [...p.submissions].reverse(), attachments: p.attachments,
  };
}

async function handle(method: string, path: string, body: unknown): Promise<unknown> {
  const b = (body ?? {}) as Json;
  let m: RegExpMatchArray | null;
  if (path === '/api/config') return { authMode: 'dev', clerkPublishableKey: '' };
  if (path === '/api/me') return { user: me(), projects: me().isAdmin ? [] : state.projects.filter((p: Project) => p.clientId === me().id).map((p: Project) => ({ id: p.id, name: p.name, company_name: p.company_name, status: p.status })) };
  if (path === '/api/data-use') return state.dataUse;
  if (path === '/api/dev/logout') return { ok: true };

  if ((m = path.match(/^\/api\/projects\/([^/]+)\/(.+)$/))) {
    const p = proj(m[1]); const rest = m[2];
    if (rest === 'discovery') return discovery(p);
    if (me().isAdmin && method !== 'GET') throw new HttpErr(403, 'You do not have access to this.');
    if (rest === 'acknowledgment') { p.acknowledged = true; log(p, 'acknowledgment.recorded'); save(); return { ok: true }; }
    if (!p.acknowledged && method !== 'GET') throw new HttpErr(409, 'Please review and accept the welcome information first.');
    let s: RegExpMatchArray | null;
    if ((s = rest.match(/^answers\/(.+)$/))) {
      const qid = `q-${s[1]}`;
      const cur = p.answers.find((x) => x.question_id === qid);
      const revision = ((cur?.revision as number) ?? 0) + 1;
      const next = { question_id: qid, value: b.value ?? null, status: b.status, context_note: b.contextNote ?? null, revision };
      p.answers = [...p.answers.filter((x) => x.question_id !== qid), next]; save();
      return { revision, updatedAt: now() };
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
      p.submissions.push({ version: p.submissions.length + 1, created_at: now() });
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
    if (path === '/api/admin/projects') {
      if (method === 'POST') {
        const p: Project = { id: uid('p'), name: b.name as string, company_name: (b.companyName as string) ?? '', status: 'discovery', is_fictional: !!b.isFictional, created_at: now(), clientId: null, clientEmail: null, acknowledged: false, answers: [], offers: [], progress: [], submissions: [], attachments: [], notes: [], activity: [] };
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
        snapshots: [...p.submissions].reverse().map((x) => ({ id: uid('s'), version: x.version, kind: 'client_intake', created_at: x.created_at })),
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
    }
  }
  throw new HttpErr(404, 'Not found');
}

export function installMockApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(location.origin, '').split('?')[0];
    if (!path.startsWith('/api/')) return realFetch(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: unknown = init?.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* leave as is */ } }
    await new Promise((r) => setTimeout(r, 120)); // makes save states visible, like a real network
    try {
      const out = await handle(method, path, body);
      return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      const err = e as HttpErr;
      return new Response(JSON.stringify({ error: 'error', message: err.message }), { status: err.status ?? 500, headers: { 'Content-Type': 'application/json' } });
    }
  };
}
