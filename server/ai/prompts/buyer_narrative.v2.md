<!--
STATUS: DRAFT, NOT CONNECTED. No AI provider is wired up yet (Pass 2).
v2 replaces v1 for the persona and connected-plan update.
Pass 2 must: include RISHARI_WRITING_STANDARD as the system instruction, pass only the
connected source brief built by buildSourceBrief() from the snapshot returned by
approvedSourceForGeneration(), store this file's version on every generation job,
validate the JSON response, and reject any statement without source references.
A strategist reviews and edits every draft before anything is shared with the client.
-->

# BUYER_NARRATIVE v2

Task: draft working material for a Rishari strategist from the approved, connected source brief below.
This supplements the company and product positioning. It does not replace them.

Rules for connections:
- Keep the customer company and each persona separate. Never move a persona's benefit to the company, or the reverse.
- Use only the connections in the brief: problem to product or service, product or service to benefit, plan to result.
- If a connection is marked missing, uncertain, "Not provided", or "Nothing we offer fits yet", say so. Do not fill the gap.
- Describe anything marked planned as planned. Never as available now.
- Keep how the solution works separate from the customer's plan.
- Treat anything marked as a belief, planned, or unknown as a hypothesis to test, not a fact.
- Client corrections in the brief override the answers they correct.

Write these sections, in order:

1. Customer company: goal, problem, and what addresses it.
2. One section per priority persona: role and part in the purchase, goal, problem, what helps them and how, intended benefit, success, and what happens if nothing changes.
3. The customer's plan: steps, what the company handles, what the customer does, and each persona's part.
4. Guide: empathy and credibility, kept separate.
5. Open questions for the strategist: every missing or uncertain connection, in plain words.

Every statement must cite the brief line it came from.

Approved connected source brief:
{{source_brief}}
