# AI-04: Unified AI Tool Execution Registry Specification & Technical Documentation

## 1. Overview & Objective

The **Unified AI Tool Execution Registry** (`ToolRegistry`) is the canonical execution authority for all AI tool invocations across the Wellness Studio OS gateway. It eliminates ad-hoc ERP method calls, prevents bypassed permissions, enforces Zod schema validation, isolates tenant context server-side, guarantees pending-action confirmation for side-effecting operations, preserves idempotency, and records auditable execution trails with PII sanitization.

---

## 2. Architecture & Component Interaction

```
[User / Client]
       │
       ▼
[AiController]  (POST /api/v1/ai/assistant/actions/:pending_id/confirm)
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
[ConversationOrchestrator]     [ToolRegistry.execute]
(processMessage / executeTool)           │
       │                                 ├─► 1. Explicit Lookup & Safe Unknown Tool Handling
       └────────────────────────────────►├─► 2. Prohibited Tools Check (Phase 1)
                                         ├─► 3. Server-Side Tenant Context Enforcement
                                         ├─► 4. RBAC Authorization (TOOL_PERMISSIONS & ScopeRules)
                                         ├─► 5. Side-Effect & Confirmation Enforcement
                                         ├─► 6. Idempotency Cache Evaluation
                                         ├─► 7. Zod Schema Input Validation (strict)
                                         ├─► 8. Tool Execution (BaseTool subclass or ErpBridgeTool)
                                         ├─► 9. PII-Sanitized Audit Outbox Recording
                                         └─► 10. Structured Result Normalization (ToolResult)
```

---

## 3. Core Invariants & Security Enforcement

### 3.1 Explicit Lookup & Safe Unknown-Tool Handling
- Unknown tool names fail gracefully without throwing unhandled exceptions or crashing the process.
- Returns structured failure: `{ success: false, error: "Unknown tool: <name>", errorCode: "UNKNOWN_TOOL" }`.
- Records security audit event: `security.unknown_tool`.

### 3.2 Tenant Isolation
- `context.tenantId` must be non-empty and valid.
- Request arguments cannot override context tenant ID.
- Missing tenant context returns `{ success: false, error: "Tenant context is required for tool execution", errorCode: "MISSING_TENANT_CONTEXT" }`.

### 3.3 Server-Side RBAC Enforcement
- Verified against `TOOL_PERMISSIONS[toolName]` and `canUseTool(role, toolName)`.
- If caller role lacks permission (e.g. `member` attempting `createMember` or `reports:read` tools), access is rejected:
  `{ success: false, error: "Access denied: insufficient permissions for tool <name>", errorCode: "PERMISSION_DENIED" }`.
- Security audit event recorded: `security.unauthorized_tool_access`.

### 3.4 Side-Effecting Operations & Two-Phase Confirmation
- Write tools (`toolDef.requiresConfirmation === true` or `toolDef.risk === 'write'`) cannot be directly executed in an interactive chat turn.
- Direct execution attempt returns:
  `{ success: false, error: "Tool <name> requires pending-action confirmation before execution", errorCode: "CONFIRMATION_REQUIRED" }`.
- Execution is permitted only when `isConfirmedPendingAction === true` (initiated via `/assistant/actions/:pending_id/confirm` or `pendingActionService.confirmAndExecute`).

### 3.5 Prohibited Tools
- Tools defined in `PROHIBITED_TOOLS` (e.g. `bookSession` in Phase 1) are blocked before argument parsing:
  `{ success: false, error: "Tool <name> is prohibited in current phase", errorCode: "TOOL_PROHIBITED" }`.

### 3.6 Schema Validation (Zod)
- Input arguments are validated against `toolDef.args` (strict Zod schema).
- Missing required fields or incorrect types return detailed error messages:
  `{ success: false, error: "Invalid arguments: <details>", errorCode: "INVALID_ARGUMENTS" }`.
- Underlying domain services and ERP endpoints are never called with malformed arguments.

### 3.7 Idempotency & Duplicate Prevention
- An optional `idempotencyKey` can be supplied.
- Caches successful results scoped by `${tenantId}:${toolName}:${idempotencyKey}` for 10 minutes.
- Subsequent identical requests return the cached result without re-executing ERP mutations.

### 3.8 Audit Trail & PII Sanitization
- Every execution outcome is logged to `AuditOutboxService` (`ai.tool.<toolName>`).
- Sensitive keys (`phone`, `email`, `password`, `token`, `secret`, `key`, `ssn`, `aadhaar`, `pan`) are redacted via `PiiRedaction.sanitizeForLogging`.
- Errors are recorded truthfully; false successes are strictly prohibited.

---

## 4. Modified & New Files

| File | Type | Purpose |
|------|------|---------|
| `backend-nestjs-gateway/src/ai/tools/base-tool.ts` | Modified | Updated `BaseTool` to implement `AiTool` contract with `abstract execute`, `errorCode`, and `isConfirmedPendingAction`. |
| `backend-nestjs-gateway/src/ai/tools/tool-registry.ts` | **New** | Canonical Unified AI Tool Execution Registry with DI auto-discovery, ERP bridge fallback, RBAC, confirmation enforcement, and audit logging. |
| `backend-nestjs-gateway/src/ai/ai.module.ts` | Modified | Registered and exported `ToolRegistry` in `AiModule`. |
| `backend-nestjs-gateway/src/ai/orchestrator/conversation-loop.ts` | Modified | Injected `ToolRegistry` and routed `executeTool`, `callErpTool`, `confirmPendingAction`, and `executeApprovedAction` through it. |
| `backend-nestjs-gateway/src/ai/ai.controller.ts` | Modified | Injected `ToolRegistry` into `AiController` and routed `confirmAssistantAction` execution through it. |
| `backend-nestjs-gateway/src/tests/ai-tool-registry.spec.ts` | **New** | 20 regression tests covering registry dispatch, unknown tools, validation, RBAC, cross-tenant scoping, side-effect confirmation, idempotency, and audit trails. |
| `backend-nestjs-gateway/src/tests/ai-module-startup.spec.ts` | Modified | Added assertions verifying `ToolRegistry` resolution and tool population on live NestJS application startup. |

---

## 5. Verification Results

- **`src/tests/ai-tool-registry.spec.ts`**: 20/20 passed (100%).
- **`src/tests/ai-contract-alignment.spec.ts`**: 21/21 passed (100%).
- **`src/tests/ai-module-startup.spec.ts`**: 4/4 passed (100%).
- **`frontend-nextjs` test suite**: 37/37 passed across 17 suites (100%).
- **Backend Typecheck (`pnpm typecheck`)**: 0 errors (clean).
- **Backend Build (`pnpm build`)**: Compiled successfully (exit code 0).
- **`git diff --check`**: Clean (exit code 0).

---

## 6. Remaining Blockers & Limitations

1. **Live ERPNext Instance (BLOCKED for live end-to-end integration)**:
   - Live ERPNext HTTP backend (`wellness_studio` Frappe app) is not running on the local test runner.
   - All ERP interactions are mocked or verified via gateway regression tests using contract mocks.
2. **Live LLM Provider (BLOCKED for live generation)**:
   - Live Gemini / OpenAI API keys are unconfigured in local test environments; `LlmGatewayService` fallback and mock orchestration were verified.
