// Seed content for the discovery framework (SPEC.md Section 9).
// After seeding, admins can edit modules and questions in the database without code changes.

export type SeedQuestion = {
  key: string;
  kind: 'core' | 'field' | 'offer_list' | 'labeled_examples' | 'probe' | 'stakeholder_map';
  input: 'short_text' | 'long_text' | 'url' | 'single_select' | 'multi_select' | 'offer_list' | 'labeled_examples' | 'stakeholder_map';
  prompt: string;
  help?: string;
  thinking?: string[];
  options?: string[];
  allowNotSure?: boolean;
  // Buyer narrative additions
  revision?: number;          // bump to publish a new version of a seeded question
  perOffer?: boolean;         // asked once for each focus offer; {offer} becomes the offer's name
  plannedPrompt?: string;     // wording when the offer is planned
  probeOf?: string;           // optional probe shown under this core question
  probeAlways?: boolean;      // companion field shown from the start
  field?: string;             // narrative field this answer supplies
  evidence?: boolean;         // ask "How do you know this?"
  allowNA?: boolean;          // offer a not-applicable choice
  naLabel?: string;
  reuseFrom?: string[];       // earlier questions that may already cover this
};

export type SeedModule = { key: string; title: string; why: string; opening?: string; questions: SeedQuestion[] };

const core = (key: string, prompt: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'core', input: 'long_text', prompt, allowNotSure: true, ...extra,
});
const field = (key: string, prompt: string, input: SeedQuestion['input'] = 'short_text', extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'field', input, prompt, allowNotSure: false, ...extra,
});

const BASE_MODULES: SeedModule[] = [
  {
    key: 'business', title: 'Business and priorities',
    why: 'We need to understand what exists today and what this work needs to help you accomplish.',
    questions: [
      field('m1_company', 'Company name'),
      field('m1_website', 'Website, if you have one', 'url'),
      field('m1_participant', 'Your name and role'),
      field('m1_markets', 'Markets you serve', 'short_text', { help: 'Industries, regions, or customer types. A rough list is fine.' }),
      field('m1_model', 'Business model', 'multi_select', {
        options: ['Software', 'Consulting or professional services', 'Managed services', 'Physical products', 'Marketplace', 'Hybrid', 'Other'],
        help: 'Choose all that apply.',
      }),
      field('m1_stage', 'Where the business is today', 'multi_select', {
        options: ['Prelaunch', 'Serving early customers', 'Established'],
        help: 'Choose all that apply. Many businesses are prelaunch for one offer and already serving customers with another.',
      }),
      field('m1_constraints', 'Delivery constraints we should know about', 'long_text', { help: 'Capacity, regions, regulations, or anything that limits who you can serve right now.', allowNotSure: true }),
      core('m1_what', 'What does your company do, in your own words?'),
      core('m1_available', 'What is available to buy today?'),
      core('m1_developing', 'What is still being developed?'),
      core('m1_outcomes', 'Which business decisions or outcomes should this work support?', {
        revision: 2,
        help: "This is about what you want from your work with Rishari. We'll ask separately about what success looks like for your customers.",
        thinking: ['A launch, a fundraise, a sales push, a new market, a website rebuild?'],
      }),
    ],
  },
  {
    key: 'origin', title: 'Origin and conviction',
    why: 'The reason you started can reveal beliefs and details that make the business distinctive.',
    questions: [
      core('m2_necessary', 'What happened that made this business feel necessary?'),
      core('m2_name', 'What does the company name mean?'),
      core('m2_belief', 'What belief shapes how you run the business?'),
      core('m2_refuse', 'What would you refuse to compromise?'),
    ],
  },
  {
    key: 'offers', title: 'Offer inventory',
    why: 'The company story and individual product stories may need to do different jobs.',
    questions: [
      { key: 'm3_offers', kind: 'offer_list', input: 'offer_list', prompt: 'List what you offer, or plan to offer.', help: 'Add each product or service separately. Pricing is optional.', allowNotSure: false },
      core('m3_most', 'Which offer matters most right now?'),
      core('m3_different', 'Which offers serve different people or solve different problems?'),
    ],
  },
  {
    key: 'situation', title: 'Customer situation',
    why: 'A useful message starts with a situation the customer recognizes.',
    questions: [
      { key: 'm4_examples', kind: 'labeled_examples', input: 'labeled_examples', prompt: 'Describe a customer or intended customer when they need your help.', help: 'Add one or more examples and label where each one comes from.', allowNotSure: true },
      core('m4_today', 'How do they handle the situation today?'),
      core('m4_frustrating', 'What is frustrating about that approach?'),
      core('m4_better', 'What would a better outcome let them do?'),
    ],
  },
  {
    key: 'fit', title: 'Best-fit customers',
    why: 'An initial focus makes the message more relevant. It does not prevent future expansion.',
    questions: [
      core('m5_benefits', 'Who benefits most from what you can deliver today?'),
      core('m5_true', 'What must be true for them to get value?'),
      core('m5_notfit', 'Who would not be a good fit?'),
      core('m5_first', 'Which group would you focus on first, and why?'),
    ],
  },
  {
    key: 'buying', title: 'Buying roles and timing',
    why: 'The person who needs the solution may not approve the purchase.',
    questions: [
      core('m6_notices', 'Who first notices the problem?'),
      core('m6_roles', 'Who evaluates, pays, uses, or can block the purchase?', { help: 'One person can hold several of these roles. Say so if that is the case.' }),
      core('m6_matters', 'What matters most to those people?'),
      core('m6_now', 'What makes someone act now?'),
    ],
  },
  {
    key: 'alternatives', title: 'Alternatives',
    why: 'Customers compare you with whatever they would do instead, including doing nothing.',
    questions: [
      core('m7_instead', 'If customers did not work with your company, how would they address the broader need you help with?', { revision: 2 }),
      core('m7_why', 'Why might they choose that alternative?'),
      core('m7_short', 'Where does it fall short for your best-fit customer?'),
      core('m7_misunderstand', 'What do people misunderstand about your offer?'),
    ],
  },
  {
    key: 'differentiation', title: 'Differentiation and value',
    why: 'We need to explain what is different and why it matters.',
    questions: [
      core('m8_differently', 'What do you do differently?'),
      core('m8_changes', 'What changes for the customer because of that difference?'),
      core('m8_today', 'Which differences exist today?'),
      core('m8_planned', 'Which are planned?'),
      core('m8_better_choice', 'When might another option be a better choice?'),
    ],
  },
  {
    key: 'credibility', title: 'Experience and credibility',
    why: "You don't need testimonials, case studies, or measured results. We'll work with what you know today and identify what needs testing.",
    questions: [
      field('m9_categories', 'What do you have today? (optional)', 'multi_select', {
        options: ['Founder experience', 'Team expertise', 'Prototype', 'Demonstration', 'Method', 'Qualifications', 'Early feedback', 'Measured results', 'Testimonials', 'Still developing', 'Other'],
        help: 'None of these is required.',
      }),
      core('m9_confident', 'What helps someone feel confident taking the next step?'),
      core('m9_learned', 'What have you learned from early customers, pilots, demonstrations, or conversations?'),
      core('m9_hesitate', 'What concerns might make someone hesitate?'),
      core('m9_avoid', 'Which promises or claims should we avoid?'),
    ],
  },
  {
    key: 'voice', title: 'Voice and boundaries',
    why: 'Examples help us understand how the company should sound.',
    questions: [
      core('m10_feel', 'How should someone feel after interacting with the company?'),
      core('m10_never', 'What should it never sound like?'),
      core('m10_right', 'Is there writing or language that feels right?', { help: 'Paste a short example or describe it. Links are saved as references only.' }),
      core('m10_careful', 'Are there words, naming details, or cultural references we should handle carefully?'),
    ],
  },
  {
    key: 'action', title: 'Action and future direction',
    why: 'The message should help people take the next step and remain useful as the business develops.',
    questions: [
      core('m11_next', 'What should an interested prospect do next?'),
      core('m11_after', 'What happens after that?'),
      core('m11_first', 'Where must the new messaging work first?'),
      core('m11_remain', 'What should remain true as the offers evolve?'),
      core('m11_working', 'What customer response would suggest the message is working?'),
    ],
  },
];

// ---------------------------------------------------------------------------
// Buyer narrative (update spec, Sections 2 and 4 to 13). Folded into the existing
// chapters, asked once per focus offer, with optional probes on the same screen.
// ---------------------------------------------------------------------------
const oc = (key: string, prompt: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'core', input: 'long_text', prompt, allowNotSure: true, perOffer: true, evidence: true, ...extra,
});
const pr = (key: string, of: string, prompt: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'probe', input: 'long_text', prompt, allowNotSure: true, probeOf: of, perOffer: true, ...extra,
});

const NARRATIVE: Record<string, SeedQuestion[]> = {
  situation: [
    oc('n_char_buyer', 'For {offer}, who is the main person we need to persuade?', {
      field: 'character.buyer_role', reuseFrom: ['m6_roles', 'm5_benefits'],
      help: 'A business has goals, but a person still has to make the decision. We want to understand what that person is trying to accomplish. Name their role, not just an industry or company size.',
    }),
    pr('n_char_org', 'n_char_buyer', 'What kind of organization do they work in?', { input: 'short_text', probeAlways: true, field: 'character.org_type', allowNotSure: false }),
    oc('n_char_resp', 'What are they responsible for?', { field: 'character.responsibilities' }),
    oc('n_char_goal', 'What are they trying to accomplish when they start looking for help?', { field: 'character.desired_outcome', reuseFrom: ['m4_better'] }),
    pr('n_char_goal_top', 'n_char_goal', 'Which outcome matters most?', { field: 'character.top_outcome' }),
    pr('n_char_goal_dep', 'n_char_goal', 'Who is depending on them to get this right?', { field: 'character.depends_on_them' }),
    pr('n_char_trigger', 'n_char_goal', 'What makes this a priority now?', { field: 'character.trigger', reuseFrom: ['m6_now'] }),
    oc('n_prob_practical', 'What is getting in the way of the outcome they want?', {
      field: 'problem.practical', reuseFrom: ['m4_frustrating'],
      help: 'We want to understand what is going wrong, what it is like to deal with, and why it matters.',
    }),
    oc('n_prob_internal', 'What does dealing with that problem make their working day look like?', {
      field: 'problem.internal', allowNA: true,
      help: "If you don't know how it feels for them, say so. We won't guess.",
    }),
    pr('n_prob_confidence', 'n_prob_internal', 'Does it affect their confidence, stress, or sense of control? If so, how?', { field: 'problem.internal_effect', allowNA: true }),
    pr('n_prob_others', 'n_prob_internal', 'Who else gets pulled into the problem?', { field: 'problem.others_affected' }),
    pr('n_prob_explain', 'n_prob_internal', 'What do they have to explain or apologize for?', { field: 'problem.explaining', allowNA: true }),
    oc('n_prob_philosophical', 'What about this situation feels unnecessarily difficult, unfair, or unacceptable?', {
      field: 'problem.philosophical', allowNA: true,
      help: "Not every purchase has a bigger principle behind it. If this one doesn't, choose not applicable.",
    }),
  ],
  buying: [
    { key: 'n_stakeholders', kind: 'stakeholder_map', input: 'stakeholder_map', perOffer: true, allowNotSure: false, field: 'stakeholders',
      prompt: 'Who is involved in a decision about {offer}?',
      help: 'Start with the main buyer. Add someone else only if what they want or worry about is different. One person can hold several roles.' },
  ],
  alternatives: [
    oc('n_alt_offer', 'If a customer did not choose {offer}, what would they use or do instead to solve this particular problem?', {
      plannedPrompt: 'How are intended customers handling this problem today, before {offer} is available?',
      field: 'alternatives.offer', reuseFrom: ['m7_instead'],
    }),
    pr('n_alt_today', 'n_alt_offer', 'What are they using or doing today?', { field: 'alternatives.current' }),
    pr('n_alt_stay', 'n_alt_offer', 'Why might they reasonably stay with that approach?', { field: 'alternatives.reasons_to_stay', reuseFrom: ['m7_why'] }),
    pr('n_alt_switch', 'n_alt_offer', 'What would have to change for them to consider switching?', { field: 'alternatives.switch_trigger' }),
    oc('n_fail_continue', 'If nothing changes, what is likely to continue happening?', {
      field: 'failure.continues',
      help: "We're not looking for scare tactics. We want to understand the realistic cost of leaving the problem unresolved.",
    }),
    oc('n_fail_harder', 'What could become harder, more costly, or more risky?', { field: 'failure.escalation' }),
    pr('n_fail_observed', 'n_fail_harder', 'What have you observed, and what are you anticipating?', { field: 'failure.observed_vs_expected' }),
    pr('n_fail_support', 'n_fail_harder', 'What supports that expectation?', { field: 'failure.support' }),
    pr('n_fail_overstate', 'n_fail_harder', 'Which consequences should we avoid overstating?', { field: 'failure.avoid_overstating' }),
    oc('n_fail_who', 'Who carries those consequences?', { field: 'failure.who' }),
    oc('n_fail_prevent', 'What would the buyer most want to prevent?', { field: 'failure.prevent' }),
  ],
  differentiation: [
    oc('n_result_first', 'What is the first observable change after adoption or delivery of {offer}?', {
      plannedPrompt: 'Once {offer} is available, what should be the first observable change for a customer?',
      field: 'immediate_result.change',
      help: 'We want to separate the first change your offer creates from the larger outcomes that change may lead to.',
    }),
    oc('n_result_needs', 'What needs to happen for that change to occur?', { field: 'immediate_result.dependencies', evidence: false }),
    oc('n_success_business', 'If this works well, what is different for the business?', {
      plannedPrompt: 'If {offer} works well once it is available, what will be different for the customer\'s business?',
      field: 'success.organization',
      help: "You don't need measured results to describe success. Tell us what a good outcome would look like, and we'll separate expected benefits from outcomes already demonstrated.",
    }),
    pr('n_success_team', 'n_success_business', 'What becomes easier for the team?', { field: 'success.team' }),
    pr('n_success_colleagues', 'n_success_business', 'What might their manager or colleagues notice?', { field: 'success.team_visible' }),
    pr('n_success_outside', 'n_success_business', 'Does anyone outside the organization benefit?', { field: 'success.downstream', allowNA: true }),
    pr('n_success_horizon', 'n_success_business', 'Over what realistic period might those changes appear?', { field: 'success.time_horizon' }),
    oc('n_success_person', 'What would success mean for the person choosing or using it?', { field: 'success.personal', allowNA: true }),
    oc('n_success_signal', 'How would they recognize that it is working?', { field: 'success.signals' }),
    pr('n_success_measures', 'n_success_signal', 'Are there measures they already use to judge success?', { field: 'success.measures' }),
    oc('n_transform', 'If relevant, how would they want others to describe them or their team after success?', {
      field: 'transformation.after', allowNA: true, evidence: false,
      help: 'Some purchases change how people see their role. Others simply solve a practical problem. Either is useful.',
    }),
    pr('n_transform_not', 'n_transform', 'What would they no longer want to be known for?', { field: 'transformation.before', allowNA: true }),
  ],
  credibility: [
    oc('n_guide_empathy', 'What do you understand about their situation that helps them feel understood?', {
      perOffer: false, field: 'guide.empathy',
      help: 'People need to feel understood and have a truthful reason to feel confident taking the next step.',
    }),
    oc('n_guide_service', 'How does that understanding affect the way you serve them?', { perOffer: false, field: 'guide.empathy_in_practice' }),
    oc('n_guide_credibility', 'What can you truthfully show or explain that gives them confidence in your ability to help?', {
      perOffer: false, field: 'guide.credibility', reuseFrom: ['m9_confident'],
      help: 'Relevant experience, a prototype, a demonstration, a method, qualifications, early feedback, or customer results all count. If it comes from your earlier career rather than this company, say so.',
    }),
    pr('n_guide_current', 'n_guide_credibility', 'Which of those exist today?', { perOffer: false, field: 'guide.current_capability' }),
    pr('n_guide_planned', 'n_guide_credibility', 'Which are still planned?', { perOffer: false, field: 'guide.planned_capability', allowNA: true }),
  ],
  action: [
    oc('n_plan_steps', 'What are the main steps from exploring {offer} to receiving value?', {
      plannedPrompt: 'Once {offer} is available, what do you expect the main steps to be from exploring it to receiving value?',
      field: 'plan.path',
      help: "A clear path helps someone understand what happens next and what will be expected of them. Describe the customer's experience, not how the technology works. Use as many steps as it really takes.",
    }),
    pr('n_plan_how', 'n_plan_steps', 'Separately, how does {offer} itself work behind the scenes?', { field: 'plan.mechanism', allowNA: true }),
    oc('n_plan_roles', 'What does the customer do, and what do you handle?', { field: 'plan.responsibilities' }),
    pr('n_plan_onboarding', 'n_plan_roles', 'What happens during onboarding or implementation?', { field: 'plan.onboarding' }),
    pr('n_plan_support', 'n_plan_roles', 'What support is available?', { field: 'plan.support' }),
    oc('n_plan_commit', 'What commitments or explanations help reduce uncertainty?', {
      field: 'plan.commitments', help: "Only include commitments you actually make. We won't add guarantees.",
    }),
    pr('n_plan_learn', 'n_plan_commit', 'What does the buyer learn before committing?', { field: 'plan.learn_first' }),
    pr('n_plan_limits', 'n_plan_commit', 'What limitations or responsibilities should they understand?', { field: 'plan.limits' }),
    oc('n_action_ready', 'What should someone do when they are ready to move forward with {offer}?', {
      plannedPrompt: 'When {offer} is available, what should someone do when they are ready to move forward?',
      field: 'action.direct', reuseFrom: ['m11_next'], evidence: false,
    }),
    oc('n_action_after', 'What happens after they take that step?', { field: 'action.after', reuseFrom: ['m11_after'], evidence: false }),
    oc('n_action_smaller', 'What useful smaller step is available if they are interested but not ready to commit?', {
      field: 'action.transitional', allowNA: true, naLabel: 'No smaller step exists yet', evidence: false,
      help: "Only include steps you offer today. If there isn't one yet, that's fine.",
    }),
  ],
};

export const MODULES: SeedModule[] = BASE_MODULES.map((m) => ({ ...m, questions: [...m.questions, ...(NARRATIVE[m.key] ?? [])] }));

export const EVIDENCE_STATUSES = ['observed', 'customer_reported', 'founder_belief', 'planned', 'unknown'] as const;

export const DATA_USE_DEFAULT = {
  reviewed: false,
  sections: [
    { heading: 'What we collect', body: 'To be completed by Rishari before inviting clients.' },
    { heading: 'Why we collect it', body: 'To be completed by Rishari before inviting clients.' },
    { heading: 'Service providers', body: 'To be completed by Rishari. List hosting (Render), sign-in (Clerk), file storage, and AI (OpenAI) providers, and link to their terms.' },
    { heading: 'Retention and deletion', body: 'To be completed by Rishari. Do not state a retention period until it has been decided.' },
    { heading: 'Contact', body: 'To be completed by Rishari.' },
  ],
};
