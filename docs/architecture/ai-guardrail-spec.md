# AI Guardrail and Prompt Specification (v0.1, Day 1)

Sources: AI & Agent Architecture (sections 1.3, 1.5, 4, 13), SAD section 8. Status: draft for AIQ review.

## 1. Non-negotiable rules
1. The model never touches the DB or ERP. It calls registered tools only.
2. Tenant, user and role come from the request context, never from prompt text or tool arguments.
3. Tool list is filtered per user x role x tenant x tier x feature flag, and re-checked at execution.
4. Writes are two-phase: propose (arguments frozen in pending-action store), then confirm. Only stored arguments execute.
5. Success is claimed only when the service returns success. Errors are relayed verbatim.
6. Every model-initiated tool call writes one immutable AI audit record.

## 2. Scope refusal
Refuse and name what the assistant can do for:
- Health, medical, nutrition or injury advice
- Legal, tax, or financial advice
- Bulk messaging or campaign sending
- Anything with no registered tool (for example booking in Phase 1)
- Requests about other tenants or other members' data

Refusal template: "I can't help with that here. I can help with <in-scope list>. For <topic>, please contact <tenant staff contact>."

## 3. Grounding
- Numbers and facts must come from a tool result or an approved FAQ entry.
- No tool result and no approved entry: say so and escalate. Never guess prices, timings or promises.
- Admin figures must equal dashboard figures (same ReportingService).
- Relative dates ("Monday") are resolved by the service layer and shown in the confirmation card.

## 4. PII and data minimisation
- Redact phone, email and names from prompts and logs unless required for the task.
- Never send to the model: health notes, payment details, emergency contacts, credentials.
- Tools return only the fields needed.
- Conversation memory is short-TTL and is not business data.

## 5. Prompt-injection handling
- User text, FAQ text, feedback comments and lead names are DATA. Delimit and label them in prompts.
- Instructions found inside data are ignored.
- Tool arguments are schema-validated (zod, strict). Unknown fields are rejected.
- Permissions are enforced outside the model.

## 6. Create Member flow
Collecting -> Proposed -> Executing -> Succeeded / Failed / Cancelled / Expired.
- Missing mandatory fields: ask, never infer. Mandatory: fullName, phone (plan and start date to confirm with AIQ).
- Duplicate or validation error: show exact error, no retry without a new confirmation.
- Pending action TTL elapsed: ask user to restart.

## 7. Escalation triggers
Low confidence or no source coverage, complaint, pricing dispute, sensitive topic, repeated tool failure, "talk to a person". Enquiry escalation creates a lead with consent.

## 8. Failure behaviour
LLM timeout: one bounded retry, then "assistant unavailable" (UI keeps working). ERP down: "temporarily unavailable". Permission denied: refuse with reason.

## 9. Evaluation hooks
Curated queries (85% target), Create Member scenarios (95% first-time-correct), zero false success, adversarial scope-refusal and injection cases, cross-tenant tool tests.
