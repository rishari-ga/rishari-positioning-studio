// Seed content for the discovery framework (SPEC.md Section 9).
// After seeding, admins can edit modules and questions in the database without code changes.

export type SeedQuestion = {
  key: string;
  kind: 'core' | 'field' | 'offer_list' | 'labeled_examples';
  input: 'short_text' | 'long_text' | 'url' | 'single_select' | 'multi_select' | 'offer_list' | 'labeled_examples';
  prompt: string;
  help?: string;
  thinking?: string[];
  options?: string[];
  allowNotSure?: boolean;
};

export type SeedModule = { key: string; title: string; why: string; opening?: string; questions: SeedQuestion[] };

const core = (key: string, prompt: string, extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'core', input: 'long_text', prompt, allowNotSure: true, ...extra,
});
const field = (key: string, prompt: string, input: SeedQuestion['input'] = 'short_text', extra: Partial<SeedQuestion> = {}): SeedQuestion => ({
  key, kind: 'field', input, prompt, allowNotSure: false, ...extra,
});

export const MODULES: SeedModule[] = [
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
      core('m7_instead', 'What would customers do if your company were unavailable?'),
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
