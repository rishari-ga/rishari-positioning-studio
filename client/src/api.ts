export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

// Clerk's session token lasts about a minute and is refreshed in the background. A request can go out
// just after it expires (a laptop waking up, a background tab), so we send a fresh token with every call
// and, if the server still says "not signed in", refresh once and try again before reporting a failure.
type ClerkLike = { session?: { getToken: (o?: { skipCache?: boolean }) => Promise<string | null> } | null };
const clerk = () => (window as unknown as { Clerk?: ClerkLike }).Clerk;
export async function authHeader(fresh = false): Promise<Record<string, string>> {
  try {
    const t = await clerk()?.session?.getToken(fresh ? { skipCache: true } : undefined);
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const send = async (fresh: boolean) => fetch(path, {
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await authHeader(fresh)), ...((rest.headers as Record<string, string>) ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let res = await send(false);
  if (res.status === 401 && clerk()?.session) res = await send(true);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Something went wrong.');
  return data as T;
}

export type User = { id: string; email: string; displayName: string | null; isAdmin: boolean };

export type Question = {
  id: string; key: string; module_id: string; position: number; version: number;
  kind: 'core' | 'field' | 'offer_list' | 'labeled_examples' | 'probe' | 'stakeholder_map' | 'customer_groups' | 'personas' | 'solution_links' | 'persona_fields';
  input_type: string;
  prompt: string; help_text: string | null; thinking_prompts: string[]; options: string[]; allow_not_sure: boolean;
  per_offer: boolean; planned_prompt: string | null; probe_of: string | null; narrative_field: string | null;
  asks_evidence: boolean; allow_not_applicable: boolean; reuse_from: string[]; probe_always: boolean; na_label: string | null;
  per_persona: boolean; heading_template: string | null; part_label: string | null;
};
export type Module = { id: string; key: string; position: number; title: string; why: string; opening: string | null; questions: Question[] };
export type AnswerStatus = 'answered' | 'not_sure' | 'discuss' | 'empty' | 'not_applicable';
export type Answer = {
  question_id: string; offer_id: string | null; persona_id: string | null; value: unknown; status: AnswerStatus; context_note: string | null;
  evidence_status: string | null; reused_from_key: string | null; revision: number;
};
export type FocusOffer = { id: string; name: string; availability: string | null };
export type Stakeholder = {
  id: string; offer_id: string | null; label: string; roles: string[]; desired_outcome: string | null; wants_to_prevent: string | null;
  needs_to_believe: string | null; decision_role: string | null; evidence_status: string | null;
};
export type Clarification = { id: string; question_key: string; offer_id: string | null; persona_id: string | null; note: string | null; status: string; created_at: string };
export type { Persona, CustomerGroup, SolutionLink, ConnectionReview, Summary } from '@shared/narrative';
import type { Persona, CustomerGroup, SolutionLink, ConnectionReview } from '@shared/narrative';
export type EarlierAnswer = { question_key: string; prompt: string; offer_name: string | null; value: unknown; status: string };
export type Offer = {
  id: string; name: string; description: string | null; intended_customer: string | null; availability: 'available' | 'pilot' | 'planned' | null;
  pricing_approach: string | null; delivery_model: string | null; priority: number | null; in_scope?: boolean;
};
export type Attachment = { id: string; module_id: string | null; original_name: string; mime_type: string; size_bytes: number; created_at: string };
export type Discovery = {
  project: { id: string; name: string; company_name: string | null; status: string };
  acknowledged: boolean; ackVersion: string;
  modules: Module[]; answers: Answer[]; offers: Offer[];
  progress: { module_id: string; marked_for_discussion: boolean; client_correction: string | null }[];
  submissions: { version: number; created_at: string }[];
  attachments: Attachment[];
  focusOffers: FocusOffer[];
  stakeholders: Stakeholder[];
  clarifications: Clarification[];
  customerGroups: CustomerGroup[];
  personas: Persona[];
  links: SolutionLink[];
  connectionReviews: ConnectionReview[];
  earlierAnswers: EarlierAnswer[];
};
export const priorityPersonas = (d: Pick<Discovery, 'personas'>) => d.personas.filter((p) => p.is_priority);

export const findAnswer = (d: Pick<Discovery, 'answers'>, questionId: string, offerId: string | null, personaId: string | null = null) =>
  d.answers.find((a) => a.question_id === questionId && (a.offer_id ?? null) === offerId && (a.persona_id ?? null) === personaId);

export function hasContent(a: Answer | undefined): boolean {
  if (!a) return false;
  if (a.status === 'not_sure' || a.status === 'discuss' || a.status === 'not_applicable') return true;
  if (a.status !== 'answered') return false;
  const v = a.value;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== undefined;
}
