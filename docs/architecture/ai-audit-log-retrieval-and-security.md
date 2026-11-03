# AI-05: AI Audit Log Retrieval, Filtering, and Security Specification & Technical Documentation

## 1. Overview & Objective

The **AI Audit Log Retrieval, Filtering, and Security Architecture** provides a tamper-evident, privacy-preserving, and strictly tenant-isolated audit ledger for all AI activities across the Wellness Studio OS. Aligned with Document 5 Section 6.2 and Document 6 (AI & Agent Architecture), this system enables studio owners, general managers, and auditors to inspect, reconstruct, filter, and export the entire execution trail of model-initiated tool invocations, human confirmation/rejection decisions, authorization denials, and execution outcomes without leaking member PII or system credentials.

---

## 2. Authoritative API Contract (`GET /api/v1/ai/audit`)

### 2.1 Endpoint Specification

- **Method**: `GET`
- **Path**: `/api/v1/ai/audit`
- **Security**: Bearer JWT (`AuthGuard`), `PermissionGuard`, requires `audit:read` permission.
- **Tenant Context**: Server-derived strictly from caller session (`user.tenantId`). No query parameter can alter or bypass tenant scoping.
- **Rate Limit**: 30 requests / minute / user.

### 2.2 Query Parameters & Filters

| Parameter | Type | Required | Description | Validation Rules |
|---|---|---|---|---|
| `cursor` | string | Optional | Pagination cursor identifier (UUID). | If provided, applies cursor pagination (`cursor: { id }, skip: 1`). |
| `user_id` | string | Optional | Filter by actor/user ID. | UUID or actor string matching `audit_logs.actor_id`. |
| `filter[user_id]` | string | Optional | Document 5 alias for `user_id`. | Normalized to `user_id`. |
| `tool` | string | Optional | Filter by tool or action name. | Matches `resourceRef`, `afterData.toolName`, or `action`. |
| `filter[tool]` | string | Optional | Document 5 alias for `tool`. | Normalized to `tool`. |
| `from` | string | Optional | Start timestamp filter (inclusive). | Must be valid ISO-8601 date string. Rejects invalid dates with 400. |
| `to` | string | Optional | End timestamp filter (inclusive). | Must be valid ISO-8601 date string. Must be $\ge$ `from`. Rejects `from > to` with 400. |
| `limit` | integer | Optional | Records per page (default: 50). | Integer between 1 and 100. Non-integers or values outside range reject with 400. |
| `page` | integer | Optional | Page number for offset pagination (default: 1). | Integer $\ge$ 1. Rejects $< 1$ with 400. |

### 2.3 Response Envelope & Schema

Returns HTTP 200 with JSON array of audit records conforming to Document 5 §6.2:

```typescript
[
  {
    "id": "c1f7a83d-e49c-4bf7-a379-994df55845c1",
    "actor": "33333333-3333-3333-3333-333333333333",
    "tool": "createMember",
    "arguments_redacted": {
      "full_name": "Jane Doe",
      "plan": "Gold",
      "phone": "[REDACTED]"
    },
    "decision": "approved",
    "approval": {
      "approved_by": "33333333-3333-3333-3333-333333333333"
    },
    "result": {
      "record_id": "MEM-00043"
    },
    "at": "2026-10-15T12:00:00.000Z"
  }
]
```

---

## 3. Security, Privacy, and Tenant Isolation Invariants

### 3.1 Strict Server-Derived Tenant Isolation
- Every database query is executed through `prisma.withTenant(user.tenantId, ...)`.
- The PostgreSQL session variable `app.current_tenant_id` is set to canonical UUID format before query execution.
- The `where` clause strictly mandates `tenantId: user.tenantId`.
- Even if a client injects `tenantId` or `tenant_id` into query parameters, the controller never consumes it for tenant scoping.

### 3.2 Role-Based Access Control (RBAC)
- Only roles granted `audit:read` are permitted to invoke `GET /api/v1/ai/audit`:
  - `owner`: Full audit access (`*` wildcard permission).
  - `admin`: Granted `audit:read` by policy.
  - `front_desk`, `trainer`, `member`, `visitor`: Access rejected with HTTP 403 Forbidden (`PERMISSION_DENIED`).
- Unauthenticated requests are rejected with HTTP 401 Unauthorized.

### 3.3 Zero-Leakage PII & Secret Redaction
- Redaction occurs at two independent layers:
  1. **Persistence Ingestion**: In `ToolRegistry` and `AiController`, tool arguments are sanitized via `PiiRedaction.sanitizeForLogging` and `AuditOutboxService.recordInTransaction`, masking phone numbers, emails, passwords, tokens, API keys, card numbers, CVVs, Aadhaar, PAN, and credentials.
  2. **Retrieval Sanitization**: When constructing `arguments_redacted` for the response, all credentials (`password`, `token`, `secret`, `cvv`, `credit_card`, `pin`, `otp`, `auth_token`) are guaranteed masked as `[REDACTED]`.

### 3.4 Honest Error Reporting (No False Success or Fake Data)
- Database errors throw honest HTTP 500 `InternalServerErrorException` with error code `DATABASE_ERROR`.
- Database failures never produce a misleading HTTP 200 with empty array `[]`.
- Audit logs represent actual execution outcomes (successful, failed, rejected, unauthorized) rather than inferred success.

---

## 4. Frontend Integration (`AiAuditLogsPanel`)

### 4.1 UI Component Architecture

Mounted in `AiCopilotPage` under the **Audit Trail** tab:

```
[AiCopilotPage]
  ├── Header (Chat | Approvals | Audit Trail)
  └── Workspace Body
        ├── activeTab === 'chat'    -> [MessageList] & [ChatInput]
        ├── activeTab === 'pending' -> [PendingActionsPanel]
        └── activeTab === 'audit'   -> [AiAuditLogsPanel]
                                         ├── Header & Export (CSV, JSON, Refresh)
                                         ├── Filter Bar (Tool, Actor, Date From/To)
                                         ├── Audit Log Table (Timestamp, Actor, Tool, Decision, Result)
                                         ├── Redacted Arguments Inspector (Collapsible JSON)
                                         ├── Pagination Controls (Limit selector, Prev/Next)
                                         └── Loading / Empty / Permission-Denied States
```

### 4.2 Error & State Handling
- **Loading State**: Clean spinner with message "Loading verified audit trail from gateway...".
- **Empty State**: Clear informational message when no audit logs match active filter criteria.
- **Error State**: Displays real gateway error details with a "Retry" button.
- **Permission Denied State**: Displays clear notice when caller role lacks `audit:read`, preventing unauthorized staff from attempting audit retrieval.
- **Exporting**: Supports one-click CSV and formatted JSON download of all retrieved records.

---

## 5. Verification & Regression Test Matrix

| Test Suite | Spec File | Tests | Status |
|---|---|---|---|
| **AI Audit Retrieval & Filtering** | `backend-nestjs-gateway/src/tests/ai-audit.spec.ts` | 20 / 20 | **PASS (100%)** |
| **AI Contract Alignment** | `backend-nestjs-gateway/src/tests/ai-contract-alignment.spec.ts` | 21 / 21 | **PASS (100%)** |
| **Tool Registry Specification** | `backend-nestjs-gateway/src/tests/ai-tool-registry.spec.ts` | 20 / 20 | **PASS (100%)** |
| **AI Module Startup** | `backend-nestjs-gateway/src/tests/ai-module-startup.spec.ts` | 4 / 4 | **PASS (100%)** |
| **Admin Copilot Contract & Frontend** | `frontend-nextjs/src/features/ai/__tests__/ai-copilot-contract.spec.ts` | 23 / 23 | **PASS (100%)** |
| **Real-Data Integrity Suite** | `frontend-nextjs/src/tests/real-data-integrity.spec.ts` | 22 / 22 | **PASS (100%)** |
| **Backend Static Typecheck** | `npm run typecheck` (`tsc --noEmit`) | 0 errors | **PASS** |
| **Frontend Static Typecheck** | `pnpm run typecheck` (`tsc --noEmit`) | 0 errors | **PASS** |
| **Frontend Production Build** | `pnpm run build` (`next build`) | 56/56 pages | **PASS** |
| **Git Whitespace & Formatting** | `git diff --check` | 0 issues | **PASS** |

---

## 6. Known Limitations & Non-Production Blockers

1. **Local Test Runner Test Database**:
   - Automated unit and integration tests run against configured test mocks and in-memory test doubles.
   - Verification against a live multi-node PostgreSQL cluster with live Row-Level Security policies requires live database infrastructure, marked as **BLOCKED on live infrastructure**.
2. **Live Frappe/ERPNext Instance**:
   - The ERPNext backend is mocked via `ErpBridgeTool` and gateway regression test stubs.
