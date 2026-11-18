// Seed content for the discovery framework (SPEC.md Section 9).
// After seeding, admins can edit modules and questions in the database without code changes.

export type SeedQuestion = {
  key: string;
  kind: 'core' | 'field' | 'offer_list' | 'labeled_examples' | 'probe' | 'stakeholder_map' | 'customer_groups' | 'personas' | 'solution_links' | 'persona_fields';
  input: 'short_text' | 'long_text' | 'url' | 'single_select' | 'multi_select' | 'offer_list' | 'labeled_examples' | 'stakeholder_map' | 'customer_groups' | 'personas' | 'solution_links' | 'persona_fields';
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
  // Persona update
  perPersona?: boolean;       // asked once for each priority persona; {persona} becomes the persona's role
  heading?: string;           // screen heading, e.g. "What this problem means for {persona}"
  part?: string;              // visible part label, e.g. "Part A: How your product or service helps"
};

export type SeedModule = { key: string; title: string; why: string; opening?: string; revision?: number; questions: SeedQuestion[] };

const core = (key: string, prompt: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'core', input: 'long_text', prompt, allowNotSure: true, ...extra,
});
const field = (key: string, prompt: string, input: SeedQuestion['input'] = 'short_text', extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'field', input, prompt, allowNotSure: false, ...extra,
});

const BASE_MODULES: SeedModule[] = [
  {
    key: 'business', title: 'Your company', revision: 2,
    why: 'We need to understand what exists today and what this work needs to help you accomplish.',
    opening: 'Your company is the business you are completing this discovery for.',
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
    key: 'origin', title: 'Origin and conviction', revision: 2,
    why: 'Your why. The reason this business exists is often what makes it different.',
    questions: [
      core('m2_necessary', 'Why did you start this business?', {
        revision: 2,
        help: "Tell us the moment, problem, or frustration that made you start it. If you didn't found it, tell us why it was started.",
        thinking: ['What did you see that others were getting wrong? Who did you want to help?'],
      }),
      core('m2_name', 'What does the company name mean?'),
      core('m2_belief', 'How do your beliefs guide the way you run this business?', {
        revision: 2,
        help: 'Think about how you price, who you choose to work with, how you treat customers, or how you hire.',
        thinking: ['For example: "We believe small firms deserve the same tools as big ones, so we keep pricing flat."'],
      }),
      core('m2_refuse', 'What will you never do, even if it would win you more business?', {
        revision: 2,
        help: 'These are your lines in the sand. Think about shortcuts you won\'t take, clients you\'d turn away, or quality you won\'t cut.',
        thinking: ['For example: "We won\'t take on a client we can\'t help within 90 days."'],
      }),
    ],
  },
  {
    key: 'offers', title: 'Your products and services', revision: 2,
    why: 'The company story and the story for each product or service may need to do different jobs.',
    opening: 'A product or service is what you sell to help a customer solve a problem. List each one separately.',
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
      core('m8_today', 'Which of those differences exist today, and which are still planned?', { revision: 2 }),
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
      core('m11_first', 'Where will you use this messaging first?', {
        revision: 2,
        help: 'This tells us what to prepare first.',
        thinking: ['Your website, a sales deck, a product launch, investor conversations, or outreach emails?'],
      }),
      core('m11_remain', 'What should remain true as the offers evolve?'),
      core('m11_working', 'How will you know the new messaging is working?', {
        revision: 2,
        thinking: ['More booked calls, shorter sales conversations, or customers repeating your words back to you?'],
      }),
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
    oc('n_guide_empathy', 'What do you understand about your customers\' situation that others miss?', {
      perOffer: false, field: 'guide.empathy', revision: 2,
      help: 'Show that you know what they deal with. Think about what they put up with, what they have already tried, or what they worry about but rarely say.',
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

// ---------------------------------------------------------------------------
// Personas and connected plans (persona update spec). Plain language, about a
// 10th grade reading level. Company questions are about the priority customer
// company; persona questions repeat for each priority persona.
// ---------------------------------------------------------------------------
const cq = (key: string, prompt: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'core', input: 'long_text', prompt, allowNotSure: true, evidence: true, ...extra,
});
const pq = (key: string, prompt: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => cq(key, prompt, { perPersona: true, ...extra });
const pp = (key: string, of: string, prompt: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'probe', input: 'long_text', prompt, allowNotSure: true, probeOf: of, ...extra,
});

const PERSONA_MODULES: SeedModule[] = [
  {
    key: 'customer_company', title: 'Your customer company', revision: 2,
    why: "Describe the business most likely to benefit from your product or service. We'll look at the people inside it next.",
    opening: "Sell directly to consumers, not to businesses? Skip this chapter. You'll describe your customers in the next one.",
    questions: [
      { key: 'cc_groups', kind: 'customer_groups', input: 'customer_groups', allowNotSure: false, field: 'company.type',
        prompt: 'What type of company are you focusing on first?',
        help: "Describe it in a few words, like the industry, size, or situation that makes it a good fit. If you serve more than one type, add each one and choose which to focus on first. We'll keep the others separate.",
        reuseFrom: ['m5_first', 'm5_benefits', 'm1_markets'] },
      cq('cc_goal', 'What is this customer company trying to achieve?', { field: 'company.goal', reuseFrom: ['m4_better', 'n_char_goal'] }),
      cq('cc_problem', 'What problem is getting in its way?', { field: 'company.problem', reuseFrom: ['m4_frustrating', 'n_prob_practical'] }),
      cq('cc_effect', 'How does that problem affect the business?', {
        field: 'company.problem_effect',
        thinking: ["You might think about time, cost, workload, growth, quality, risk, or customer experience. Include only what applies. You don't need numbers."],
      }),
    ],
  },
  {
    key: 'customer_personas', title: 'Your customer personas',
    why: 'Different people may need different things from the same purchase. Add the main personas involved in choosing, approving, or using your product or service.',
    questions: [
      { key: 'cp_personas', kind: 'personas', input: 'personas', allowNotSure: false, field: 'personas',
        prompt: 'Who are the main personas?',
        revision: 2,
        help: "Add one persona at a time. If you sell to businesses, name each one by role, like \"Operations manager.\" If you sell to consumers, name them by situation, like \"First-time homebuyer.\" You don't need made-up names, ages, or personal details.",
        reuseFrom: ['m6_roles'] },
    ],
  },
  {
    key: 'problems', title: 'Their problems',
    why: "We've identified the main problem. Now let's understand what it means for the company and each persona.",
    questions: [
      cq('pr_prevents', 'What does this problem prevent the customer company from doing?', { field: 'company.prevents' }),
      cq('pr_affected', 'Who else in the business is affected?', { field: 'company.affected', evidence: false, reuseFrom: ['n_prob_others'] }),
      pq('p_work', 'What happens in their work because of this problem?', {
        heading: 'What this problem means for {persona}', field: 'persona.work_impact', reuseFrom: ['n_prob_internal'],
        thinking: ["You might think about extra work, missed deadlines, difficult conversations, stress, uncertainty, or loss of confidence. Include only what's true."],
      }),
      pq('p_personal', 'How does dealing with it affect them personally, if at all?', {
        heading: 'What this problem means for {persona}', field: 'persona.personal_impact', allowNA: true, reuseFrom: ['n_prob_confidence'],
        help: "If you don't know, choose \"I'm not sure yet.\" We won't guess how anyone feels.",
      }),
      pq('p_should', 'What do they believe should work better than it does today?', {
        heading: 'What this problem means for {persona}', field: 'persona.should_work', allowNA: true, reuseFrom: ['n_prob_philosophical'],
      }),
    ],
  },
  {
    key: 'solution', title: 'Your solution and plan', revision: 2,
    why: 'This chapter is about the fix: what you provide and how it deals with the problem. The next chapter asks about the result.',
    questions: [
      { key: 'sl_company', kind: 'solution_links', input: 'solution_links', allowNotSure: false, revision: 2, field: 'company.solution',
        part: 'Part A: How your product or service helps',
        prompt: 'Which product or service addresses this company problem?',
        help: "Name the product or service and what it does about the problem. Example: \"Records Audit checks every client file and flags what's missing.\" Save the results for the next chapter. If nothing you offer fits yet, say so." },
      { key: 'sl_persona', kind: 'solution_links', input: 'solution_links', allowNotSure: false, perPersona: true, field: 'persona.solution',
        part: 'Part A: How your product or service helps', heading: 'How you help {persona}',
        prompt: 'Which product or service helps this persona?',
        help: "One product or service can help several personas in different ways. It's also fine if nothing fits this persona directly." },
      cq('pl_steps', 'What are the main steps from getting started to receiving value?', {
        part: "Part B: The customer's plan", field: 'plan.steps', evidence: false, reuseFrom: ['n_plan_steps'],
        help: "Explain what the customer does and what you do to put the solution to work. Describe what the customer experiences, not a list of features. Use as many steps as it really takes.",
      }),
      cq('pl_we', 'What work does your team do to deliver it?', {
        part: "Part B: The customer's plan", field: 'plan.we_handle', evidence: false, reuseFrom: ['n_plan_roles'], revision: 2,
        help: 'List the work your side takes on, so the customer knows what they will not have to do.',
        thinking: ['For example: "We set up the portal, import your client list, and train your staff in one session."'],
      }),
      cq('pl_customer', 'What does the customer have to do to make it work?', {
        part: "Part B: The customer's plan", field: 'plan.customer_does', evidence: false, revision: 2,
        help: "Their side of the work. Include time, people, or information they need to provide. If they don't need to do anything, say so.",
        thinking: ['For example: "Upload last year\'s files and name one person to own the process."'],
      }),
      { key: 'pl_personas', kind: 'persona_fields', input: 'persona_fields', allowNotSure: true, field: 'persona.plan_role',
        part: "Part B: The customer's plan", prompt: 'What does each relevant persona need to do?',
        help: "One shared plan is usually enough. Note only what each persona does. Leave a persona blank if they don't take part." },
      cq('pl_confidence', 'What support or commitments help the customer feel confident?', {
        part: "Part B: The customer's plan", field: 'plan.confidence', evidence: false, reuseFrom: ['n_plan_commit'],
        help: "Only include support and commitments you actually provide. We won't add guarantees.",
      }),
    ],
  },
  {
    key: 'success', title: 'What success looks like', revision: 2,
    why: "Last chapter was the fix. This one is the result: what is better once it works. Describe the outcome, not what you do. You don't need measured results yet.",
    questions: [
      cq('sc_company', 'Once it is working, what is better for the customer company?', {
        field: 'company.success', reuseFrom: ['n_success_business'], revision: 2,
        help: 'Describe the result, not your product. If your answer names a feature or a task you do, it belongs in the last chapter.',
        thinking: ['Fix: "We flag missing files." Result: "Year-end closes two weeks earlier, with no weekend work."'],
      }),
      cq('sc_signal', 'How would the company recognize success?', { field: 'company.success_signals', reuseFrom: ['n_success_signal'] }),
      pq('sp_do', 'Once it is working, what can this persona do that they could not do before?', {
        heading: 'What success looks like for {persona}', field: 'persona.success', revision: 2,
        help: 'Describe their better day, not the product. What do they stop doing, or finally get to do?',
      }),
      pp('sp_team', 'sp_do', 'What might their manager or team notice?', { perPersona: true, field: 'persona.success_team' }),
      pp('sp_measures', 'sp_do', 'What measures do they already use?', { perPersona: true, field: 'persona.success_measures' }),
      pp('sp_needs', 'sp_do', 'What needs to happen for this outcome to be possible?', { perPersona: true, field: 'persona.success_dependencies' }),
      pq('sp_know', 'How would they know the solution is helping?', { heading: 'What success looks like for {persona}', field: 'persona.success_signals' }),
      pq('sp_personal', 'What would success mean for them personally, if relevant?', {
        heading: 'What success looks like for {persona}', field: 'persona.success_personal', allowNA: true, reuseFrom: ['n_success_person'],
      }),
    ],
  },
  {
    key: 'nothing_changes', title: 'What happens if nothing changes',
    why: 'Describe the realistic consequences of leaving the problem unresolved. We are not looking for scare tactics.',
    questions: [
      cq('nc_keep', 'If this problem continues, what does the customer company keep dealing with?', { field: 'company.consequence', reuseFrom: ['n_fail_continue'] }),
      cq('nc_harder', 'What could become harder, more costly, or more risky?', { field: 'company.consequence_risk', reuseFrom: ['n_fail_harder'] }),
      pp('nc_support', 'nc_harder', 'What supports that expectation?', { field: 'company.consequence_support' }),
      pp('nc_exaggerate', 'nc_harder', 'What would be an exaggeration?', { field: 'company.consequence_limits' }),
      pq('np_keep', 'If nothing changes, what does this persona keep facing?', { heading: 'What {persona} wants to avoid', field: 'persona.consequence' }),
      pq('np_prevent', 'What outcome do they most want to prevent?', { heading: 'What {persona} wants to avoid', field: 'persona.prevent', reuseFrom: ['n_fail_prevent'] }),
      pp('np_support', 'np_prevent', 'What supports that expectation?', { perPersona: true, field: 'persona.consequence_support' }),
      pp('np_exaggerate', 'np_prevent', 'What would be an exaggeration?', { perPersona: true, field: 'persona.consequence_limits' }),
    ],
  },
];

// Chapters and questions replaced by the persona chapters. They stop being asked; their answers are kept.
export const RETIRED_MODULES = ['situation', 'fit', 'buying'];
export const RETIRED_QUESTIONS = [
  'n_fail_continue', 'n_fail_harder', 'n_fail_observed', 'n_fail_support', 'n_fail_overstate', 'n_fail_who', 'n_fail_prevent',
  'n_success_business', 'n_success_team', 'n_success_colleagues', 'n_success_outside', 'n_success_horizon', 'n_success_person', 'n_success_signal', 'n_success_measures',
  'n_plan_steps', 'n_plan_how', 'n_plan_roles', 'n_plan_onboarding', 'n_plan_support', 'n_plan_commit', 'n_plan_learn', 'n_plan_limits',
  // Question bank review, Nov 2026: cut overlap so every question asks something new.
  'm1_outcomes',                  // replaced by "Where will you use this messaging first?"
  'm1_available', 'm1_developing', // the products and services list already records what is available and what is planned
  'm7_instead', 'm7_why',         // asked per product or service in "If a customer did not choose..." and its follow-ups
  'm8_planned',                   // merged into m8_today
  'm9_confident',                 // same as "What can you truthfully show or explain..."
  'm11_next', 'm11_after',        // asked per product or service in the action questions
  'm11_remain',                   // too abstract to answer well
  'pr_prevents',                  // same as "How does that problem affect the business?"
  'n_result_first', 'n_result_needs', 'n_transform', 'n_transform_not', // covered by "What success looks like"
];

// Story order: who they are, what is wrong, what it costs to leave it, the fix, the result, then how you compare.
const ORDER = ['business', 'origin', 'offers', 'customer_company', 'customer_personas', 'problems', 'nothing_changes', 'solution', 'success',
  'alternatives', 'differentiation', 'credibility', 'voice', 'action'];

const withNarrative: SeedModule[] = BASE_MODULES.map((m) => ({ ...m, questions: [...m.questions, ...(NARRATIVE[m.key] ?? [])] }));
const byKey = new Map([...withNarrative, ...PERSONA_MODULES].map((m) => [m.key, m]));

// Every module the seed knows, active ones in display order first. Retired questions are filtered out of active modules.
export const ALL_MODULES: SeedModule[] = [...ORDER, ...RETIRED_MODULES].map((k) => byKey.get(k)!);
export const MODULES: SeedModule[] = ORDER.map((k) => byKey.get(k)!).map((m) => ({ ...m, questions: m.questions.filter((q) => !RETIRED_QUESTIONS.includes(q.key)) }));

export const EVIDENCE_STATUSES = ['observed', 'customer_reported', 'founder_belief', 'planned', 'unknown'] as const;

// Draft for "How we use your information". Rishari must replace the "To be completed by Rishari" lines
// before the page can be marked reviewed. No legal terms, retention periods, or certifications are claimed.
export const DATA_USE_DEFAULT = {
  reviewed: false,
  sections: [
    { heading: 'How this discovery works', body: "This discovery is the first step in working with Rishari. It gathers what we need to understand your company, your customers, and your products or services before we meet, so our time together goes to the decisions that matter.\n\nRishari's strategists lead this work. We read what you share, follow up on anything unclear, and make the strategic recommendations. The tools in this experience help us organize information and make sure nothing important is missed. They support our judgment. They don't replace it." },
    { heading: 'What we collect', body: "The answers you type, including anything you mark as unsure or want to discuss.\n\nThe products and services, customer companies, and personas you describe.\n\nDocuments you choose to upload. Uploads are optional.\n\nYour name, email address, and sign-in details. If you sign in with Google, Google shares only your name, email address, and profile picture with us.\n\nBasic records of activity, such as when answers were saved or submitted, so we can keep your work safe and know which version you confirmed.\n\nPlease don't include passwords, health information, financial account numbers, or other sensitive personal information." },
    { heading: 'Why we collect it', body: "To understand your business before our conversation.\n\nTo develop positioning and messaging recommendations for you.\n\nTo keep a record of what you confirmed, so the final work is based on what you told us.\n\nTo keep your account and project secure.\n\nWe don't sell your information, and we don't use it for advertising." },
    { heading: 'How Rishari uses AI-assisted tools', body: "We use AI-assisted tools in a few specific, limited ways.\n\nWhile you answer, a tool may suggest up to two short follow-up questions on a detailed answer. They are optional. You can skip them or say you're not sure.\n\nOn the \"Check that we've understood you\" page, a tool prepares a short summary of each chapter. Anything it inferred is labeled as an interpretation, and you can correct it.\n\nFor our team, tools help point out gaps or contradictions, prepare notes for our call, and draft first versions of working materials.\n\nA Rishari strategist reviews everything these tools produce for strategy work, decides what is accurate and useful, and approves every deliverable. You will not receive strategy that a person at Rishari has not reviewed. We don't use these tools to make decisions about you.\n\nWe use OpenAI's business API, not the consumer ChatGPT app. Under OpenAI's API terms, information sent through the API is not used to train OpenAI's models. OpenAI may keep it for up to 30 days to monitor for abuse, then deletes it, unless the law requires it to keep it longer. We send only what is needed for your project. Uploaded documents are never sent to these tools automatically." },
    { heading: 'Who can see your information', body: "You and the Rishari team members working on your project. Other clients can't see your information, and you can't see theirs. Notes our team writes during review are kept for internal use." },
    { heading: 'Where your information is stored', body: "We use a small number of providers to run this experience. Each one handles information only to deliver its part of the service.\n\nRender hosts the application, its database, and the documents you upload, in the United States. Uploaded documents are stored on a private disk that is encrypted and is not publicly reachable. Files can only be opened through short-lived links that the app creates for signed-in users who have access to your project.\n\nClerk manages sign-in and stores your name, email address, and sign-in records.\n\nGoogle handles sign-in only if you choose \"Continue with Google.\"\n\nOpenAI provides the AI-assisted tools described above.\n\nInformation travels between your browser and our service over an encrypted (HTTPS) connection." },
    { heading: 'How long we keep it and how to delete it', body: "We keep your project information while we are working together, and for 12 months after the engagement ends, so we can answer follow-up questions and pick up where we left off if you come back. After that, we permanently delete your answers, uploaded documents, and review notes.\n\nYou can ask us to delete your information sooner at any time. We will confirm your request and delete it within 30 days. Copies in our hosting provider's automatic backups are removed on their regular schedule, usually within 7 days after that.\n\nWe may keep a short record that a project took place, such as the company name and dates, for our business records." },
    { heading: 'Contact', body: 'Questions about your information, or a request to see, correct, or delete it: hello@rishari.com. We aim to reply within 2 business days.' },
  ],
};
