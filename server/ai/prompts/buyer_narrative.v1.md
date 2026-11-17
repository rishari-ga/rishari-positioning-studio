<!--
STATUS: DRAFT, NOT CONNECTED. No AI provider is wired up yet (Pass 2).
Pass 2 must: include RISHARI_WRITING_STANDARD as the system instruction, pass only the
approved source snapshot from approvedSourceForGeneration(), store this file's version
on every generation job, validate the JSON response, and reject any statement without
source references.
-->

# BUYER_NARRATIVE v1

Task: draft a buyer narrative for one focus offer from the approved source below.
This narrative supplements the company and product positioning. It does not replace them.

Write these sections, in order:

1. Character: the one primary buyer, their organization type, what they are responsible for, and the outcome they want.
2. Problem: the practical problem; the internal problem only if the source describes it; the philosophical problem only if the source describes it.
3. Guide: the company's empathy and its credibility, kept separate. Founder career experience is not a result of this company.
4. Plan: the customer's steps from exploring to receiving value. Do not describe how the technology works here. Do not force three steps.
5. Action: the direct action, and the smaller step only if the source names one the company actually offers.
6. Immediate Result: the first observable change and what it depends on. This is a Rishari extension, not a canonical StoryBrand element.
7. Success: organizational, team, and personal success, observable signals, and time horizon, each only where the source supports it.
8. Failure: the realistic cost of leaving the problem unresolved. Never imply that declining this offer inevitably causes failure.
9. Transformation (optional): only if the source describes one. Otherwise write "Not applicable."

Rules:
- Every material statement carries source references (question key and offer id) and the source's evidence status: observed, customer-reported, founder belief, planned, or unknown.
- If the source says "not sure", "not applicable", or is empty, say the element is unknown. Do not invent emotions, benefits, consequences, proof, customers, statistics, or guarantees.
- Present founder belief and planned items as expectations, never as demonstrated results.
- Keep a planned offer in planned tense.
- Use the offer's real name. Do not call a service a product.
- Keep one primary character. Add a variant for another stakeholder only when the source shows their outcome or concern materially differs.
- Preserve exact client quotes when quoting. Never silently rewrite a quotation.
- No em dashes.

Return JSON: { "offerId": string, "sections": [{ "key": string, "text": string, "status": "supported" | "expectation" | "unknown" | "not_applicable", "sources": [{ "questionKey": string, "offerId": string | null, "evidenceStatus": string | null }] }], "variants": [...] }

Approved source (immutable snapshot, version {{source_version}}):
{{source_json}}
