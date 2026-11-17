PROJECT: Rishari Positioning Studio

Build a working MVP for a Rishari-branded B2B positioning and
messaging service.

This specification is the single source of truth for the build.
It includes the AI connection, writing system, discovery experience,
admin workspace, approvals, and release requirements.

If the application already exists:
- Audit it against this specification.
- Preserve working features and saved data.
- Identify conflicts before destructive changes.
- Do not rebuild working components without a reason.

Do not stop at a landing page or visual prototype.

Do not publish automatically.
Do not send invitations or external messages automatically.
Do not purchase services or enable unexpected paid add-ons.
Explain required paid services and configuration before enabling them.

==================================================
1. PURPOSE AND SERVICE MODEL
==================================================

The application helps B2B founders provide useful business
information before a focused review call with Rishari.

The client completes guided discovery.
The application organizes the answers, asks limited clarification
questions, and identifies important gaps.

Rishari reviews the intake, conducts a focused clarification call,
adds notes, and approves the source information.

Only then may the application generate positioning options
and strategic drafts for Rishari to review.

Clients never receive unreviewed strategy automatically.

The app must support:
- Prelaunch businesses.
- Businesses serving early customers.
- Established businesses.
- Software.
- Consulting and professional services.
- Managed services.
- Physical B2B products.
- Marketplaces.
- Hybrid business models.

Prelaunch and serving early customers are not mutually exclusive.

This is not:
- An unrestricted chatbot.
- A quiz that assigns a generic brand profile.
- An autonomous consultant.
- A tool that requires customer case studies.
- A system that promises perfect positioning.
- A substitute for customer or market validation.

==================================================
2. TECHNICAL DIRECTION
==================================================

Revised Nov 16, 2026: moved from Replit to Claude Code with Render
hosting and a direct OpenAI API key.

Use:
- Claude Code as the development environment.
- React and TypeScript for the interface.
- Node.js and TypeScript for server-side logic.
- Render managed PostgreSQL for structured data.
- Clerk for app-specific accounts.
- S3-compatible object storage (for example Cloudflare R2 or AWS S3)
  for private attachments, behind the storage adapter. Local disk is
  allowed only for development.
- OpenAI API for runtime AI, with Rishari's own API key.
- Render for deployment, from a private GitHub repository.

Do not add Supabase or Netlify.

Keep:
- Business logic separate from UI.
- AI calls behind a provider adapter.
- Storage access behind a storage adapter.
- Questions and guidance editable without rewriting application code.

If a dependency is unavailable, explain the issue before selecting
an alternative.

Never expose privileged credentials in browser code.

==================================================
3. AI CONNECTION AND MODEL CONFIGURATION
==================================================

Use the OpenAI API directly with a Rishari-owned API key stored as a
server-side environment variable (OPENAI_API_KEY). Never send the key
to the browser.

This powers the published application's runtime.
It is separate from using Claude Code to write code.

Do not:
- Connect to a personal ChatGPT account.
- Add Anthropic or OpenRouter as runtime providers in this version.
- Add multiple providers or automatic provider switching.
- Assume a personal chat subscription covers runtime usage.

Set a monthly spending limit in the OpenAI account before production.

Initial model configuration:
- INTAKE_MODEL: gpt-5.4-mini
- STRATEGY_MODEL: gpt-5.4

Verify availability of these exact model identifiers.
If unavailable, explain the replacement before changing them.

Make both model settings configurable on the server.

INTAKE_MODEL handles:
- Limited follow-up questions.
- Chapter summaries.
- Initial coverage and contradiction checks.
- Call briefing preparation.

STRATEGY_MODEL handles:
- Positioning options.
- Strategy drafting.
- Cross-section consistency checks.
- Unsupported-claim checks.

All AI calls must:
- Run server-side.
- Use versioned prompts.
- Reference the relevant source version.
- Record model, time, job status, and available usage information.
- Validate structured responses before using them.
- Handle errors without losing client answers.
- Respect configurable project usage limits.

Do not call AI:
- On every keystroke.
- On every autosave.
- Repeatedly for unchanged source material.

Strategy generation requires an explicit admin action.

Before production:
- Identify applicable OpenAI API data-handling terms.
- Explain runtime billing dependencies.
- Do not make unverified privacy or retention claims.

==================================================
4. MASTER WRITING SYSTEM
==================================================

Implement a shared, versioned system instruction called:

RISHARI_WRITING_STANDARD

Include it in every AI prompt that produces readable language:
- Client follow-up questions.
- Client summaries.
- Admin flags.
- Admin explanations and examples.
- Call briefings.
- Strategy options.
- Messaging frameworks.
- Review comments.
- Exported deliverables.

Apply the same standards to fixed interface copy.

Use this instruction:

"You are writing for Rishari, a marketing studio helping founders
make clear, practical decisions.

Write like an experienced marketer speaking thoughtfully to
one business owner.

Use natural, direct language.
Use contractions where they fit.
Prefer concrete details over abstract claims.
Vary sentence length naturally.
Keep paragraphs focused.
Use the client's specific business context when available.
Be comfortable saying that something is unknown.

Do not use em dashes.

Do not use:
- Robotic praise.
- Repetitive transitions.
- Inflated claims.
- Forced metaphors.
- Decorative jargon.
- Formulaic openings or conclusions.
- Unnecessary rhetorical questions.
- A three-part list in every paragraph.
- Repeated 'not X, but Y' constructions.

Avoid stock phrases such as:
- Unlock your potential.
- Game-changing.
- Delve into.
- Seamless journey.
- In today's fast-paced world.
- Take it to the next level.
- Transform your business.
- Leverage the power of.
- A testament to.
- It's important to note.

Do not say 'Great insight' or 'Excellent answer' after responses.
If acknowledgment is needed, make it specific and useful.

Do not pretend to have personal experience.
Do not manufacture customer language, facts, proof, or certainty.
Do not introduce deliberate errors to appear human.
Do not promise to pass AI detectors.
Do not claim content was entirely human-written.

Preserve exact client quotes when quoting them.
Do not silently rewrite a quotation.

The standard is clear, credible, specific writing that a skilled
Rishari reviewer would be comfortable sharing."

Create a centralized writing-quality check.

For application-authored and AI-generated text:
- Detect em dashes.
- Detect obvious prohibited stock phrases.
- Flag repetitive or generic language for review.
- Correct safely or regenerate within a limited retry budget.
- Do not silently change meaning.

Do not alter original client answers or exact quotes to satisfy
style rules. Flag a quotation containing an em dash if necessary,
but preserve the source.

Natural voice is required.
A detector score is not an acceptance criterion.

==================================================
5. DESIGN
==================================================

Create a polished, restrained, editorial interface.

It should feel like a thoughtful strategy workshop,
not a chatbot or generic corporate survey.

Requirements:
- Responsive on mobile and desktop.
- Accessible labels and validation.
- Keyboard navigation and visible focus.
- Accessible contrast.
- Comfortable reading width.
- Clear heading hierarchy.
- Generous spacing.
- One main thinking task per screen.
- Related factual inputs may be grouped.
- Visible saving, saved, and save-failed states.
- Chapter map showing progress.
- No robot graphics.
- No decorative AI imagery.
- No confetti.
- No emojis.
- No simulated typing.

Do not invent Rishari logos, colors, results, or testimonials.
Use configurable brand tokens and a restrained neutral theme
until approved assets are supplied.

==================================================
6. USERS AND PERMISSIONS
==================================================

Roles:
- Admin: Rishari reviewer.
- Client: invited participant.

Support:
- Multiple client projects.
- One primary client participant per project for the MVP.
- A membership structure that supports more participants later.

Clients cannot create projects.
Signing in does not automatically grant project access.
Do not make the first registered user an admin.

Provision the initial admin through a secure, documented,
server-side configuration process.

Check permissions server-side for:
- Answers.
- Summaries.
- Notes.
- Attachments.
- Exports.
- Generation.
- Approvals.
- Version history.

Never trust a browser-supplied role or project ID.

==================================================
7. CLIENT WELCOME AND ACKNOWLEDGMENT
==================================================

Heading:
"Let's get clear on your business."

Body:
"This experience helps us understand what you're building,
who it's for, and why someone should choose it.

We'll ask about your business, your customers, your offers,
and the thinking behind them. You don't need polished answers.
Specific examples and honest uncertainty are more useful.

We use AI-assisted tools to help organize what you share,
identify questions worth exploring, and prepare working materials.
Rishari reviews the information, makes the strategic recommendations,
and approves the final work.

The goal is to spend our conversation on the decisions that matter,
rather than asking you to repeat basic information."

Before you begin:
- "You can save your progress and come back."
- "It's fine to say you don't know yet."
- "You don't need testimonials or case studies."
- "Supporting documents are optional."
- "Please don't include passwords, patient information,
   or sensitive personal information."

What happens next:
1. "Tell us about your business."
2. "Check that we've understood you."
3. "Review the important questions with Rishari."
4. "Receive your positioning and messaging materials after review."

Required acknowledgment:
"I understand how this discovery process works and that
AI-assisted tools support Rishari's review and preparation."

Links:
- How we use your information.
- Contact Rishari.

Button:
"Start discovery"

Store acknowledgment version, user, project, and timestamp.

Do not represent acknowledgment as final strategy approval
or blanket legal consent.

Do not promise a completion time before pilot testing.

==================================================
8. DATA-USE INFORMATION
==================================================

Create an admin-configurable data-use page covering:
- What is collected.
- Why it is collected.
- Relevant hosting, authentication, storage, and AI providers.
- Retention and deletion practices.
- Contact details.

Do not invent legal terms or retention periods.
Do not claim absolute confidentiality, compliance certifications,
specific data residency, or zero training use without verification.

Production readiness requires admin review of this page.

Do not send client content to AI until:
- The notice is configured.
- The client acknowledgment is recorded.

==================================================
9. DISCOVERY FRAMEWORK
==================================================

Each module contains:
- A short explanation of why it matters.
- Core questions.
- Optional thinking prompts.
- "I'm not sure yet" where appropriate.
- Optional supporting context.
- A summary the client can correct.

Do not ask the client to repeat clearly captured information.
Do not require uploads, testimonials, or measurable results.

MODULE 1: BUSINESS AND PRIORITIES

Why:
"We need to understand what exists today and what this work
needs to help you accomplish."

Questions:
- What does your company do, in your own words?
- What is available to buy today?
- What is still being developed?
- Which business decisions or outcomes should this work support?

Fields:
Company, website if available, participant and role,
markets served, business model, launch status,
customer status, delivery constraints.

Business model:
Software, consulting, managed services, physical products,
marketplace, hybrid, other.

MODULE 2: ORIGIN AND CONVICTION

Why:
"The reason you started can reveal beliefs and details that
make the business distinctive."

Questions:
- What happened that made this business feel necessary?
- What does the company name mean?
- What belief shapes how you run the business?
- What would you refuse to compromise?

MODULE 3: OFFER INVENTORY

Why:
"The company story and individual product stories may need
to do different jobs."

Repeatable entries:
- Offer name.
- Plain-English description.
- Intended customer.
- Available, pilot, or planned.
- Pricing approach, optional.
- Delivery model.
- Priority.

Questions:
- Which offer matters most right now?
- Which offers serve different people or solve different problems?

Collect all offers.
Admin determines which are included in strategy scope.
Do not automatically expand the engagement.

MODULE 4: CUSTOMER SITUATION

Why:
"A useful message starts with a situation the customer recognizes."

Questions:
- Describe a customer or intended customer when they need your help.
- How do they handle the situation today?
- What is frustrating about that approach?
- What would a better outcome let them do?

Label examples:
Observed, customer-reported, founder belief, hypothetical.

MODULE 5: BEST-FIT CUSTOMERS

Why:
"An initial focus makes the message more relevant.
It does not prevent future expansion."

Questions:
- Who benefits most from what you can deliver today?
- What must be true for them to get value?
- Who would not be a good fit?
- Which group would you focus on first, and why?

Ask company size, revenue, geography, or technology questions
only when they affect the strategy.

MODULE 6: BUYING ROLES AND TIMING

Why:
"The person who needs the solution may not approve the purchase."

Questions:
- Who first notices the problem?
- Who evaluates, pays, uses, or can block the purchase?
- What matters most to those people?
- What makes someone act now?

Allow several roles to belong to one person.
Do not force five personas.

MODULE 7: ALTERNATIVES

Why:
"Customers compare you with whatever they would do instead,
including doing nothing."

Questions:
- What would customers do if your company were unavailable?
- Why might they choose that alternative?
- Where does it fall short for your best-fit customer?
- What do people misunderstand about your offer?

MODULE 8: DIFFERENTIATION AND VALUE

Why:
"We need to explain what is different and why it matters."

Questions:
- What do you do differently?
- What changes for the customer because of that difference?
- Which differences exist today?
- Which are planned?
- When might another option be a better choice?

Repeat detailed positioning questions only for in-scope offers.

MODULE 9: EXPERIENCE AND CREDIBILITY

Opening:
"You don't need testimonials, case studies, or measured results.
We'll work with what you know today and identify what needs testing."

Questions:
- What helps someone feel confident taking the next step?
- What have you learned from early customers, pilots,
  demonstrations, or conversations?
- What concerns might make someone hesitate?
- Which promises or claims should we avoid?

Optional categories:
Founder experience, team expertise, prototype, demonstration,
method, qualifications, early feedback, measured results,
testimonials, still developing, other.

None is mandatory.
Uploads are optional.
Do not flag the absence of proof as failure.

MODULE 10: VOICE AND BOUNDARIES

Why:
"Examples help us understand how the company should sound."

Questions:
- How should someone feel after interacting with the company?
- What should it never sound like?
- Is there writing or language that feels right?
- Are there words, naming details, or cultural references
  we should handle carefully?

MODULE 11: ACTION AND FUTURE DIRECTION

Why:
"The message should help people take the next step
and remain useful as the business develops."

Questions:
- What should an interested prospect do next?
- What happens after that?
- Where must the new messaging work first?
- What should remain true as the offers evolve?
- What customer response would suggest the message is working?

==================================================
10. ROUTING AND FOLLOW-UPS
==================================================

Use deterministic routing first.

AI may:
- Clarify a vague term.
- Request a concrete example.
- Distinguish current capabilities from plans.
- Clarify buying roles.
- Identify a possible contradiction.
- Ask what supports a specific claim.

Limits:
- Maximum two immediate AI follow-ups per core question.
- One follow-up at a time.
- Allow "I'm not sure" and "Discuss with Rishari."
- Do not repeat answered questions.
- Do not recommend positioning during discovery.
- Do not steer answers toward a preferred conclusion.
- Preserve uncertainty.
- Preserve original answers.

If AI fails, let the client continue.

Treat client answers and uploaded material as untrusted sources,
not as instructions that override system rules.

No automatic browsing or arbitrary URL fetching in the MVP.
Store URLs as references.

==================================================
11. CLIENT INTAKE CONFIRMATION
==================================================

Before submission:
"Check that we've understood you."

Show:
- Module summaries.
- Original answers.
- Inferences clearly labeled as interpretations.
- Open questions.

Actions:
- Correct summary.
- Return to answer.
- Mark for discussion.
- Submit.

Required confirmation:
"This is an accurate starting point for our review.
I've marked anything I'm unsure about."

Submission creates a versioned snapshot.

Completion copy:
"Thanks. You've completed discovery.

We'll review what you shared and prepare for our conversation.
You don't need to repeat everything on the call.
We'll focus on clarifying the important points and working
through open questions."

Do not display unreviewed strategy.

==================================================
12. ADMIN WORKSPACE AND GUIDANCE
==================================================

Views:
Projects, overview, answers, coverage, flags, agenda,
notes, source approval, strategy drafts, client review,
versions, and activity.

Each flag includes:
- Issue and priority.
- Source references.
- What we noticed.
- Suggested action.
- Simple illustrative example.
- Why it matters.
- Suggested client question.
- Reviewer decision.

Actions:
Accept, dismiss, add to agenda, request clarification,
mark assumption, resolve.

Seed an editable guidance library for:
- Broad audience.
- Generic differentiation.
- Blended offers.
- Buyer versus user.
- Unsupported claims.
- Planned capabilities presented as available.
- Conflicting answers.
- Undecided market focus.
- Unclear next action.

Example:

Issue:
Audience needs clarification.

Action:
Confirm the initial priority audience.

Example:
"A company can serve several markets while choosing one to lead
with. We're deciding where the first message should be strongest,
not permanently excluding everyone else."

Why:
"The choice affects the problems, examples, evidence,
and channels we prioritize."

Question:
"Which group has the clearest need, is easiest to reach,
and can benefit from what you deliver today?"

"No customer proof yet" is a neutral stage note.
Flag unsupported claims, not missing testimonials.

==================================================
13. CALL BRIEFING AND REVIEW NOTES
==================================================

Generate an admin-only briefing:
- Business snapshot.
- In-scope offers.
- Audience and buying-role summary.
- Useful exact language.
- Evidence and limitations.
- Contradictions.
- Open decisions.
- Up to five priority discussion items.
- Source links.

Allow editing and reordering.

Review notes:
- Attach to topics.
- Remain separate from original answers.
- Identify confirmed information, interpretation, or assumption.
- Record author and timestamp.

No recording or transcription integration is required.

==================================================
14. APPROVAL EXPERIENCE
==================================================

Implement separate checkpoints:

A. Client process acknowledgment.
B. Client intake confirmation.
C. Admin source approval.
D. Admin positioning-direction approval.
E. Admin approval to share a draft.
F. Client strategy approval or change request.
G. Admin final release.

Every approval references:
- Exact immutable version.
- Actor.
- Timestamp.
- Approval type.
- Relevant scope.

Source approval screen shows:
- Version.
- Included offers.
- Open issues.
- Accepted assumptions.

Allow approval with documented uncertainty.

Positioning-direction approval:
Admin chooses and may edit the direction before framework drafting.

Sharing approval:
Show a preview and confirmation dialog.
Sharing does not automatically send an email.

Client review:
- Only explicitly shared versions are visible.
- Allow comments by section.
- Allow approval or request changes.

Client approval copy:
"Approval confirms this version reflects the agreed direction.
It does not guarantee market results."

Changes make affected downstream approvals stale.
Never silently carry approval to changed content.

==================================================
15. STRATEGY GENERATION
==================================================

Use separate tasks:
1. Organize approved source.
2. Identify unresolved decisions.
3. Develop distinct positioning options.
4. Obtain admin direction approval.
5. Draft the framework.
6. Check consistency, claims, and writing.

No multi-agent debates.

Outputs:
- Company positioning foundation.
- Product positioning for in-scope offers.
- Primary ICP.
- Secondary ICP only when justified.
- Priority personas where meaningfully distinct.
- Competitive alternatives.
- Differentiated value.
- Value proposition.
- Three messaging pillars with support.
- Customer-centered narrative.
- Short and expanded company descriptions.
- Persona-specific variations.
- Objections and responses.
- Voice principles and examples.
- Calls to action.
- Sample homepage hero.
- Short sales introduction.
- Assumptions and validation plan.

Do not force a minimum persona count.
Do not exceed five without admin approval.

Keep company positioning distinct from product positioning.

For material claims retain:
- Source references.
- Evidence status.
- External-use permission status.

Evidence statuses:
Documented, founder-reported, reviewer interpretation,
hypothesis to test.

External approval is not evidence.

Never invent results, quotes, customers, capabilities,
statistics, credentials, research, or guarantees.

==================================================
16. EDITING, VERSIONS, AND EXPORTS
==================================================

Admin can:
- Edit.
- Regenerate selected sections.
- Add regeneration instructions.
- Lock sections.
- Compare versions.
- Review affected dependencies.

Never overwrite locked sections.

Record:
Source version, prompt version, model, timestamp, and reviewer edits.

Exports:
- Editable DOCX guide.
- Markdown guide.
- Presentation-ready content outline.

Identify draft versus final.
Client exports are restricted to shared versions.

No automatic slide-design service is required.

==================================================
17. DATA MODEL
==================================================

Include:
Users and roles
Projects
Memberships
Scope settings
Offers
Question definitions and versions
Answers and revisions
Summaries
Attachments
Flags
Guidance library
Review notes
Source snapshots
Positioning options
Strategy versions and sections
Approvals
Comments and change requests
Generation jobs
Prompt versions
Audit events

Project-owned records require project scope.

Keep:
- Original answers separate from summaries.
- Notes separate from client responses.
- Evidence separate from approval.
- Source snapshots immutable.

==================================================
18. SECURITY, RELIABILITY, AND COST
==================================================

Requirements:
- Server-side authorization on all resources.
- Private attachment access.
- Authorized, time-limited downloads.
- File type and size limits.
- No arbitrary file execution.
- No client content or secrets in routine logs.
- Input validation.
- Safe rendering of generated content.
- Rate limits.
- Persistent generation job status.
- Safe retries without duplicate submissions.
- Autosave with retry and visible failure.
- Configurable project usage caps.
- Usage tracking.
- Intake remains usable during AI outages.

Accept PDF, DOCX, and TXT for private storage and reviewer access.
Do not automatically send entire attachments to AI.
Handle unsupported files clearly.

Document:
- Backup and recovery.
- Export.
- Deletion.
- Attachment deletion.
- Derived-content deletion.
- Backup retention limitations.

==================================================
19. BUILD ORDER
==================================================

First provide a concise implementation plan.

Pass 1:
Working intake, routing, authentication, permissions,
database persistence, uploads, admin answers, and notes.

Pass 2:
Runtime AI connection, shared writing instruction,
follow-ups, summaries, flags, briefing, source approval,
direction approval, and framework generation.

Pass 3:
Client review, final approvals, version invalidation,
exports, usage controls, and release testing.

Use clearly labeled fictional data only.

Do not leave production buttons connected to mocked behavior.

==================================================
20. ACCEPTANCE TESTS
==================================================

Verify:

1. Welcome and acknowledgment work.
2. An early-stage client without proof points can finish.
3. Prelaunch with early customers is supported.
4. Multiple offers do not silently expand scope.
5. Progress survives logout.
6. AI failure does not lose answers.
7. Client A cannot access Client B's records or files.
8. Clients cannot access private notes or unshared drafts.
9. Non-admins cannot generate strategy or approve sources.
10. Flags include examples and explanations.
11. Generation uses the exact approved source version.
12. Framework drafting follows direction approval.
13. Drafts are not shared automatically.
14. Client approval applies only to the displayed version.
15. Changes invalidate relevant approvals.
16. Locked sections survive regeneration.
17. Exports match the correct version.
18. Production is tested separately from preview.
19. Data-use configuration is complete before real client AI use.
20. All generation tasks include RISHARI_WRITING_STANDARD.
21. Seeded and generated application text contains no em dashes.
22. Original answers and exact quotes remain unchanged.
23. Runtime AI usage is visible and limited.

At completion provide:
- Working features.
- Incomplete features.
- Manual setup.
- Billing dependencies.
- Test results.
- Admin provisioning instructions.
- First-client setup instructions.
- Production release checklist.

Do not label the app production-ready while critical
authorization or data-handling tests are failing.