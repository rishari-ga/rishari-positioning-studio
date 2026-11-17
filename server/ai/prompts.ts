import { z } from 'zod';
import type { PromptDef } from './run.js';

// ---------- Client follow-up (INTAKE_MODEL) ----------
export const FOLLOWUP_KINDS = ['vague_term', 'example', 'current_vs_planned', 'buying_role', 'contradiction', 'support'] as const;
export const FOLLOWUP: PromptDef = {
  key: 'client_followup', version: 1, tier: 'intake', effort: 'low', maxOutputTokens: 1200,
  body: `Task: decide whether one short follow-up question would make a client's discovery answer clearer, and if so, write it.

You may ask only to:
- clarify a vague term (vague_term),
- request one concrete example (example),
- separate what exists today from what is planned (current_vs_planned),
- clarify who buys, uses, or approves (buying_role),
- point out a possible contradiction with an earlier answer (contradiction),
- ask what supports a specific claim (support).

Rules:
- Ask about one thing only, in one sentence, under 30 words, at about a 10th grade reading level.
- Do not repeat anything the client already answered. Do not ask a question that appears in "Questions they will see later".
- Do not recommend positioning, messaging, or strategy. Do not suggest what the answer should be.
- Do not steer toward a conclusion. Keep their uncertainty; "I'm not sure" is an acceptable reply.
- Do not praise or comment on the answer.
- If the answer is already clear and specific enough for a strategist, set needed to false and question to "".`,
};
export const followupSchema = z.object({
  needed: z.boolean(),
  kind: z.enum(FOLLOWUP_KINDS),
  question: z.string().max(300),
});

// ---------- Chapter summary (INTAKE_MODEL) ----------
export const SUMMARY: PromptDef = {
  key: 'chapter_summary', version: 1, tier: 'intake', effort: 'low', maxOutputTokens: 2000,
  body: `Task: summarize one chapter of a client's discovery answers so the client can check that Rishari understood them.

Write to the client in second person ("you").
- summary: 2 to 4 sentences restating what they said, plainly. Only what they said. No advice, no strategy, no praise.
- interpretations: up to 3 things you inferred that they did not state directly. Each one starts with "We read this as" so it is clearly an interpretation. Use an empty list if there are none.
- openQuestions: up to 3 gaps or things marked unsure, written as short questions. Use an empty list if there are none.
Keep their uncertainty. If they said "not sure", say it is still open. Never fill a gap with a guess.`,
};
export const summarySchema = z.object({
  summary: z.string().max(1200),
  interpretations: z.array(z.string().max(300)).max(3),
  openQuestions: z.array(z.string().max(300)).max(3),
});

// ---------- AI review flags (INTAKE_MODEL) ----------
export const AI_FLAG_KINDS = ['contradiction', 'vague_claim', 'unsupported_claim', 'feature_not_outcome', 'audience_unclear', 'scope_creep', 'missing_link'] as const;
export const AI_REVIEW: PromptDef = {
  key: 'ai_review_flags', version: 1, tier: 'intake', effort: 'medium', maxOutputTokens: 6000,
  body: `Task: review a submitted discovery for a Rishari strategist and point out up to 8 issues worth clarifying before strategy work.

Look for: contradictions between answers, vague claims, claims stated as fact with no support, features described where an outcome was asked for, an unclear audience, scope creeping beyond the in-scope offers, and goals or problems with no link to what the company offers.
Skip anything already listed under "Issues already flagged".

For each issue:
- issue: a short title.
- noticed: what you saw, specific to this client.
- suggestedAction: what the strategist could do.
- example: a short before and after, or a concrete illustration. Do not present invented facts as the client's.
- why: why it matters for positioning.
- clientQuestion: one plain question the strategist could ask the client.
- questionKeys: the keys (in square brackets in the material) of the answers involved. Use only keys that appear in the material.
- personaName and offerName: the persona or offer it concerns, or "" if none.
- priority: high, medium, or low.
Report only real issues. An empty list is fine.`,
};
export const aiReviewSchema = z.object({
  flags: z.array(z.object({
    kind: z.enum(AI_FLAG_KINDS),
    issue: z.string().max(140), noticed: z.string().max(600), suggestedAction: z.string().max(500),
    example: z.string().max(500), why: z.string().max(400), clientQuestion: z.string().max(300),
    questionKeys: z.array(z.string()).max(6), personaName: z.string(), offerName: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
  })).max(8),
});

// ---------- Call briefing (INTAKE_MODEL) ----------
export const BRIEFING: PromptDef = {
  key: 'call_briefing', version: 1, tier: 'intake', effort: 'medium', maxOutputTokens: 6000,
  body: `Task: prepare an internal briefing for a Rishari strategist before a call with this client. The client never sees it.

Fill every field from the material only. Say "Unknown" or use an empty list where the material does not cover something.
- businessSnapshot: 3 to 5 sentences on what the company does, its stage, and who it serves.
- offers: each in-scope offer with one line on where it stands (available or planned) and what is unclear.
- audience: the customer company and priority personas, with each persona's part in the purchase.
- usefulLanguage: up to 6 exact phrases from the client worth keeping, with the key of the answer each came from. Copy the words exactly.
- evidence: what is supported by evidence the client described.
- limitations: what is belief, planned, or unknown.
- contradictions: tensions between answers.
- openDecisions: decisions Rishari and the client still need to make.
- priorities: up to 5 discussion items for the call, most important first, each with why it matters and the related answer keys.`,
};
export const briefingSchema = z.object({
  businessSnapshot: z.string().max(1200),
  offers: z.array(z.object({ name: z.string(), note: z.string().max(400) })).max(8),
  audience: z.string().max(1200),
  usefulLanguage: z.array(z.object({ quote: z.string().max(300), questionKey: z.string() })).max(6),
  evidence: z.string().max(1000),
  limitations: z.string().max(1000),
  contradictions: z.array(z.string().max(400)).max(6),
  openDecisions: z.array(z.string().max(400)).max(8),
  priorities: z.array(z.object({ title: z.string().max(160), why: z.string().max(500), questionKeys: z.array(z.string()).max(6) })).max(5),
});

// ---------- Positioning options (STRATEGY_MODEL) ----------
export const EVIDENCE = ['documented', 'founder_reported', 'reviewer_interpretation', 'hypothesis'] as const;
export const OPTIONS: PromptDef = {
  key: 'positioning_options', version: 1, tier: 'strategy', effort: 'medium', maxOutputTokens: 9000,
  body: `Task: from the approved source brief, develop 2 or 3 genuinely distinct positioning directions for a Rishari strategist to choose from.

Distinct means each option makes a different bet: a different primary customer, a different problem framing, or a different basis for being chosen. Do not produce three wordings of one idea.
Keep company positioning separate from product positioning. Use only what the brief supports. Mark how well each option is supported.
For each option:
- name: a short working name.
- summary: 2 to 3 sentences on the bet this option makes.
- primaryCustomer: the customer company and the persona it leads with.
- problemFraming: the problem as this option frames it.
- alternative: what the customer does instead today.
- differentiation: why this company is the better choice, based on the brief.
- valueProposition: one or two sentences.
- whyItCouldWork and risks: specific to this client.
- evidenceStrength: documented, founder_reported, reviewer_interpretation, or hypothesis.
- sourceRefs: brief section headings or answer keys it relies on.
Also list unresolvedDecisions: choices the strategist must make that the brief cannot settle.`,
};
export const optionsSchema = z.object({
  options: z.array(z.object({
    name: z.string().max(80), summary: z.string().max(700), primaryCustomer: z.string().max(400), problemFraming: z.string().max(500),
    alternative: z.string().max(400), differentiation: z.string().max(600), valueProposition: z.string().max(400),
    whyItCouldWork: z.string().max(600), risks: z.string().max(600), evidenceStrength: z.enum(EVIDENCE), sourceRefs: z.array(z.string()).max(10),
  })).min(2).max(3),
  unresolvedDecisions: z.array(z.string().max(300)).max(8),
});
export const directionSchema = optionsSchema.shape.options.element;

// ---------- Framework drafting (STRATEGY_MODEL) ----------
export const SECTION_GROUPS = {
  foundation: [
    ['company_positioning', 'Company positioning foundation'],
    ['product_positioning', 'Product positioning for in-scope offers'],
    ['primary_icp', 'Primary ideal customer'],
    ['secondary_icp', 'Secondary ideal customer'],
    ['personas', 'Priority personas'],
    ['competitive_alternatives', 'Competitive alternatives'],
    ['differentiated_value', 'Differentiated value'],
    ['value_proposition', 'Value proposition'],
  ],
  messaging: [
    ['messaging_pillars', 'Messaging pillars'],
    ['narrative', 'Customer-centered narrative'],
    ['descriptions', 'Company descriptions (short and expanded)'],
    ['persona_variations', 'Persona-specific variations'],
    ['objections', 'Objections and responses'],
  ],
  activation: [
    ['voice', 'Voice principles and examples'],
    ['calls_to_action', 'Calls to action'],
    ['homepage_hero', 'Sample homepage hero'],
    ['sales_intro', 'Short sales introduction'],
    ['assumptions', 'Assumptions and validation plan'],
  ],
} as const;
export type GroupKey = keyof typeof SECTION_GROUPS;
export const ALL_SECTIONS = Object.values(SECTION_GROUPS).flat() as readonly (readonly [string, string])[];

export const FRAMEWORK: PromptDef = {
  key: 'framework_draft', version: 1, tier: 'strategy', effort: 'medium', maxOutputTokens: 16000,
  body: `Task: draft sections of a positioning and messaging framework for a Rishari client, following the approved direction and the approved source brief.

Rules:
- Follow the approved direction. Do not switch to a different one.
- Keep company positioning distinct from product positioning.
- Never invent results, quotes, customers, capabilities, statistics, credentials, research, or guarantees. Describe planned capabilities as planned.
- Secondary ideal customer: only if the brief justifies one. Otherwise say why none is recommended yet.
- Personas: only those meaningfully distinct in the brief, no more than five.
- Messaging pillars: exactly three, each with its support from the brief.
- Write body text in plain markdown (short paragraphs, simple lists where useful). Use the client's real words where they help, copied exactly.
- For each material claim in a section, add a claims entry with the claim, its evidence status (documented, founder_reported, reviewer_interpretation, hypothesis), and its source references. External use is never assumed; the strategist confirms it later.
- If something needed for a section is unknown, write the section with what is known and say clearly what is missing.
Write only the sections requested, using the exact keys given.`,
};
export const sectionSchema = z.object({
  key: z.string(),
  title: z.string().max(120),
  body: z.string().max(6000),
  claims: z.array(z.object({ text: z.string().max(400), evidenceStatus: z.enum(EVIDENCE), sourceRefs: z.array(z.string()).max(8) })).max(10),
});
export const frameworkSchema = z.object({ sections: z.array(sectionSchema).max(8) });

export const REVISE: PromptDef = {
  key: 'framework_section_revise', version: 1, tier: 'strategy', effort: 'medium', maxOutputTokens: 6000,
  body: `Task: rewrite one section of a positioning and messaging framework, following the strategist's instruction, the approved direction, and the approved source brief.
Keep it consistent with the other sections shown. Same rules as the original draft: no invented facts, planned stays planned, claims listed with evidence status and source references, exact client quotes copied exactly.
Return the section with the same key.`,
};

export const CHECK: PromptDef = {
  key: 'framework_check', version: 1, tier: 'strategy', effort: 'medium', maxOutputTokens: 8000,
  body: `Task: review a drafted framework the way a careful senior strategist would before a client sees it.
Check for: sections that contradict each other or the approved direction; claims not supported by the source brief; planned capabilities described as available; invented specifics; and writing that breaks the writing standard.
Return comments only where something needs attention, each tied to a section key, with severity (high, medium, low) and a specific fix. An empty list is fine.`,
};
export const checkSchema = z.object({
  comments: z.array(z.object({ sectionKey: z.string(), severity: z.enum(['high', 'medium', 'low']), comment: z.string().max(500) })).max(30),
});
