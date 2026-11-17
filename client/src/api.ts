export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    credentials: 'include',
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data.message ?? 'Something went wrong.');
  return data as T;
}

export type User = { id: string; email: string; displayName: string | null; isAdmin: boolean };

export type Question = {
  id: string; key: string; module_id: string; position: number; version: number;
  kind: 'core' | 'field' | 'offer_list' | 'labeled_examples';
  input_type: 'short_text' | 'long_text' | 'url' | 'single_select' | 'multi_select' | 'offer_list' | 'labeled_examples';
  prompt: string; help_text: string | null; thinking_prompts: string[]; options: string[]; allow_not_sure: boolean;
};
export type Module = { id: string; key: string; position: number; title: string; why: string; opening: string | null; questions: Question[] };
export type Answer = { question_id: string; value: unknown; status: 'answered' | 'not_sure' | 'discuss' | 'empty'; context_note: string | null; revision: number };
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
};

export function hasContent(a: Answer | undefined): boolean {
  if (!a) return false;
  if (a.status === 'not_sure' || a.status === 'discuss') return true;
  if (a.status !== 'answered') return false;
  const v = a.value;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== undefined;
}
