// Fixed interface copy from SPEC.md Sections 7 and 11. Do not edit wording here
// without a spec change: acknowledgment text is versioned and stored with each record.

export const WELCOME = {
  heading: "Let's get clear on your business.",
  body: [
    "This experience helps us understand what you're building, who it's for, and why someone should choose it.",
    "We'll ask about your business, your customers, your offers, and the thinking behind them. You don't need polished answers. Specific examples and honest uncertainty are more useful.",
    "We use AI-assisted tools to help organize what you share, identify questions worth exploring, and prepare working materials. Rishari reviews the information, makes the strategic recommendations, and approves the final work.",
    "The goal is to spend our conversation on the decisions that matter, rather than asking you to repeat basic information.",
  ],
  beforeYouBegin: [
    'You can save your progress and come back.',
    "It's fine to say you don't know yet.",
    "You don't need testimonials or case studies.",
    'Supporting documents are optional.',
    "Please don't include passwords, patient information, or sensitive personal information.",
  ],
  whatHappensNext: [
    'Tell us about your business.',
    "Check that we've understood you.",
    'Review the important questions with Rishari.',
    'Receive your positioning and messaging materials after review.',
  ],
  button: 'Start discovery',
};

export const ACK = {
  version: 'process-ack-v1',
  text: "I understand how this discovery process works and that AI-assisted tools support Rishari's review and preparation.",
};

// Rishari doesn't run voice features (cost). We point clients to free dictation tools instead.
export const DICTATION = {
  heading: 'Talk instead of type',
  app: 'Wispr Flow',
  url: 'https://wisprflow.ai/',
  // Sentences around the app name, so the name can be a link.
  bodyBefore: 'Many people find it faster to speak their answers. The free version of',
  bodyAfter: "works in any text box. You can also use the microphone on your phone's keyboard, Dictation on a Mac, or Windows key + H on a PC. Speak naturally. You can tidy the words afterward, or leave them as they are.",
  shortBefore: 'Speaking is often faster than typing. The free version of',
  shortAfter: ", or the microphone on your keyboard, works in every answer box.",
};

export const CONFIRMATION = {
  heading: "Check that we've understood you.",
  checkbox: "This is an accurate starting point for our review. I've marked anything I'm unsure about.",
  completion: [
    "Thanks. You've completed discovery.",
    "We'll review what you shared and prepare for our conversation. You don't need to repeat everything on the call. We'll focus on clarifying the important points and working through open questions.",
  ],
};

export const EVIDENCE_LABELS = ['Observed', 'Customer-reported', 'Founder belief', 'Hypothetical'] as const;
export const NOTE_TYPES = ['confirmed', 'interpretation', 'assumption'] as const;
