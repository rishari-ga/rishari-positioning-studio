// Editable guidance library (master spec Section 12, update spec Section 15).
// Seeded once; reviewers can edit entries in the database without code changes.

export type Guidance = { key: string; issue: string; action: string; example: string; why: string; clientQuestion: string };

export const GUIDANCE: Guidance[] = [
  // Master specification, Section 12
  {
    key: 'broad_audience', issue: 'Audience needs clarification.', action: 'Confirm the initial priority audience.',
    example: "A company can serve several markets while choosing one to lead with. We're deciding where the first message should be strongest, not permanently excluding everyone else.",
    why: 'The choice affects the problems, examples, evidence, and channels we prioritize.',
    clientQuestion: 'Which group has the clearest need, is easiest to reach, and can benefit from what you deliver today?',
  },
  {
    key: 'generic_differentiation', issue: 'Differentiation sounds generic.', action: 'Find the specific difference and what it changes for the customer.',
    example: '"High quality service" could describe anyone. "We review every filing twice before it goes out" is a difference a buyer can check.',
    why: 'Buyers compare options. A difference they cannot see or test does not help them choose.',
    clientQuestion: 'What do you do that a competitor would find hard or unwilling to copy, and what does it change for the customer?',
  },
  {
    key: 'blended_offers', issue: 'Several offers are described as one.', action: 'Separate the offers and confirm which one leads.',
    example: 'A one-time audit and a monthly retainer may serve the same buyer but solve different problems at different moments.',
    why: 'Each offer may need its own buyer, problem, and next step. Blending them blurs all three.',
    clientQuestion: 'If a customer could only buy one thing from you this year, which would it be, and why?',
  },
  {
    key: 'buyer_vs_user', issue: 'The buyer and the user may be different people.', action: 'Confirm who chooses, who pays, and who uses it.',
    example: 'An office manager may feel the problem every day while the managing partner signs the contract.',
    why: 'The message has to persuade the person who decides, without losing the person who lives with the result.',
    clientQuestion: 'Who notices the problem first, and who has to say yes before anything is bought?',
  },
  {
    key: 'unsupported_claims', issue: 'A claim needs support.', action: 'Ask what supports the claim, or mark it as something to test.',
    example: '"Saves clients 20 hours a month" needs a source. "Designed to reduce time spent on follow-up" describes intent honestly.',
    why: 'An unsupported claim can damage trust with exactly the buyers who check.',
    clientQuestion: 'What have you seen that supports this, and where did it come from?',
  },
  {
    key: 'planned_as_available', issue: 'A planned capability is described as available.', action: 'Separate what exists today from what is planned.',
    example: '"Includes a client portal" and "a client portal is in development for spring" are different promises.',
    why: 'Selling a planned feature as current creates disappointment and risk.',
    clientQuestion: 'Which parts of this can a customer use today, and which are still being built?',
  },
  {
    key: 'conflicting_answers', issue: 'Two answers point in different directions.', action: 'Confirm which is accurate, or whether both are true in different situations.',
    example: 'One answer says the main buyer is a founder. Another says purchases go through procurement. Both can be true for different deal sizes.',
    why: 'The narrative needs one clear starting point for each buyer.',
    clientQuestion: 'These two answers seem to differ. Which fits the customers you want to focus on first?',
  },
  {
    key: 'undecided_market_focus', issue: 'The first market focus is undecided.', action: 'Discuss options on the call rather than guessing.',
    example: 'Two promising groups is a normal place to be. The call can weigh reach, urgency, and fit.',
    why: 'Strategy work stalls without an initial focus, even a provisional one.',
    clientQuestion: "Which group would you most like to win first, even if you're not certain yet?",
  },
  {
    key: 'unclear_next_action', issue: 'The next step for a prospect is unclear.', action: 'Confirm one direct action and, if one exists, one smaller step.',
    example: '"Get in touch" is vague. "Book a 20-minute fit call" tells someone exactly what happens.',
    why: 'A message that persuades but gives no clear next step loses people at the moment they are ready.',
    clientQuestion: 'When someone is ready, what exactly should they do, and what happens right after?',
  },
  // Update specification, Section 15
  {
    key: 'audience_without_buyer', issue: 'An audience is described without a specific buyer.', action: 'Name the person who makes or drives the decision.',
    example: '"Mid-size law firms" describes a market. "The office administrator at a 20-lawyer firm" describes a person we can write to.',
    why: 'A message persuades a person, not an industry.',
    clientQuestion: 'Inside those organizations, who is the main person we need to persuade, and what is their role?',
  },
  {
    key: 'buyer_without_outcome', issue: 'The buyer has no clear desired outcome.', action: 'Clarify what the buyer is trying to accomplish.',
    example: 'Knowing the buyer is a practice manager is a start. Knowing they want to stop month-end billing from running late is what the message can speak to.',
    why: 'The narrative starts from what the buyer wants. Without it, the message has nothing to promise.',
    clientQuestion: 'What is this person trying to get done when they start looking for help?',
  },
  {
    key: 'success_only_functionality', issue: 'Success is described only as functionality.', action: 'Clarify the outcome the functionality is intended to enable.',
    example: "'Automated reminders' describes a capability. 'Less time spent chasing responses' describes an intended benefit. That benefit still needs to be confirmed, not assumed.",
    why: 'Buyers need to understand why the capability matters to their work.',
    clientQuestion: 'If the reminders work as intended, what becomes easier, and how would the customer notice?',
  },
  {
    key: 'stakes_unknown', issue: 'Personal or team stakes are unknown.', action: 'Ask what success means for the people involved, or mark it unknown.',
    example: '"The firm saves money" is organizational. "The office manager stops working weekends at month end" is personal. Either may be true; neither should be guessed.',
    why: 'People act on what a decision means for them, not only for the organization.',
    clientQuestion: 'What would success mean for the person choosing this, and for their team?',
  },
  {
    key: 'unsupported_failure', issue: 'The cost of inaction is stated as an unsupported worst case.', action: 'Ask what supports the consequence, or soften it to what is realistic.',
    example: '"Firms that wait will lose clients" is a prediction. "Late invoices have led some firms to chase payments for months" is something that can be supported.',
    why: 'Overstated stakes read as scare tactics and cost trust.',
    clientQuestion: 'What have you actually seen happen when this problem goes unresolved, and what are you expecting?',
  },
  {
    key: 'plan_is_technology', issue: 'The plan describes the technology, not the customer path.', action: "Describe the customer's steps from exploring to receiving value.",
    example: '"Data syncs nightly through our API" explains how it works. "Book a setup call, connect your calendar, see your first report in a week" is a path.',
    why: 'A buyer needs to picture what they will do and what happens next.',
    clientQuestion: 'From the moment someone is interested, what are the steps they go through until they get value?',
  },
  {
    key: 'empathy_credibility_unclear', issue: 'Empathy or credibility is unclear.', action: 'Separate what you understand about the buyer from what gives them confidence in you.',
    example: '"We were practice managers ourselves" shows understanding. "Here is the method and a demo" gives a reason to trust the work.',
    why: 'People need to feel understood and to have a truthful reason to take the next step.',
    clientQuestion: 'What do you understand about their situation, and what can you truthfully show them?',
  },
  {
    key: 'current_planned_blended', issue: 'Current and planned outcomes are blended.', action: 'Separate outcomes customers get today from outcomes expected later.',
    example: '"Clients see faster close times" is a result. "We expect faster close times once the integration ships" is an expectation.',
    why: 'Mixing them turns an honest plan into an unsupported claim.',
    clientQuestion: 'Which of these outcomes have customers already seen, and which do you expect once more is in place?',
  },
  {
    key: 'stakeholders_blended', issue: 'Several stakeholders are blended into one buyer.', action: 'Separate the people whose outcomes or concerns differ.',
    example: 'A partner who wants lower risk and an assistant who wants fewer steps may need different reasons to say yes.',
    why: 'One message for everyone tends to persuade no one in particular.',
    clientQuestion: 'Is there anyone in this decision who wants something different or worries about something different from the main buyer?',
  },
];
