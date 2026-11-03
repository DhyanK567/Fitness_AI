# Fitness AI - API Endpoints Reference

**Base URL:** `https://api.fitness-ai.com/api/v1` (or `http://localhost:3000/api/v1` in development)

**Authentication:** Bearer token (JWT) in `Authorization: Bearer <token>` header. Public endpoints marked with 🔓.

---

## Health & Version (Public)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/health/live` 🔓 | Liveness probe - always 200, no dependency calls | None |
| GET | `/health/ready` 🔓 | Readiness probe - 503 if DB/Redis down; ERP/LLM = degraded; LLM cached 60s | None |
| GET | `/health` 🔓 | Alias of `/health/ready` | None |
| GET | `/version` 🔓 | Version info - build date, commit, env | None |

---

## Authentication (Staff - B2B)

All staff routes are tenant-scoped: the tenant is resolved from the request host
(`<tenant>.<TENANT_BASE_DOMAIN>`). Tokens use one JWT format:
`{ sub, tenant, roles, role, userType, exp }`.

| Method | Path | Description | Permission | Roles |
|--------|------|-------------|------------|-------|
| POST | `/auth/staff/login` 🔓 | Password login. Returns tokens, or an MFA challenge (`mfa_required` / `mfa_enrollment_required`) | - | all staff |
| POST | `/auth/staff/refresh` 🔓 | Rotate refresh token; reusing a rotated token revokes the whole family | - | staff |
| POST | `/auth/staff/logout` 🔓 | Revoke a single refresh token | - | staff |
| POST | `/auth/staff/logout-all` | Revoke every active session for the user | - | staff |
| POST | `/auth/staff/invite` | Invite staff, returns a single-use invite token (48h) | `staff:write` | owner, admin |
| POST | `/auth/staff/reset-password/request` | Issue a single-use password-reset token (60m, no enumeration) | `staff:write` | owner, admin |
| POST | `/auth/staff/reset-password` 🔓 | Consume an invite/reset token to set the password | - | public |
| POST | `/auth/staff/totp/enroll` | Start TOTP enrollment (requires enrollment token); returns secret, otpauth URL, 10 recovery codes | - | owner, admin |
| POST | `/auth/staff/totp/verify` | Confirm TOTP enrollment with a 6-digit code | - | owner, admin |
| GET | `/auth/staff/me` | Current user, roles, tenant and permissions | - | staff |

**Forced MFA:** `owner` and `admin` cannot hold an access token until TOTP is enrolled. The first successful password login returns `mfa_enrollment_required` plus a 10-minute `enrollment_token` (scope `mfa_enroll`) that is only accepted by `/auth/staff/totp/*`. After enrollment, login requires `totp_code` (or a single-use `recovery_code`).

---

## B2C Member Auth

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/member/signup` | B2C member signup with consent; creates member, hashes password, assigns `member` role, sends OTP | 🔓 public |
| POST | `/auth/member/otp/request` | Request 6-digit OTP for member verification; always returns success silently (no email enumeration) | 🔓 public |
| POST | `/auth/member/otp/verify` | Verify 6-digit OTP code; issues access + refresh tokens on success | 🔓 public |
| GET | `/auth/member/me` | Current member profile (id, email, displayName, userType, role, tenant, permissions) | Bearer |
| PATCH | `/auth/member/me` | Update member profile name (name-only update) | Bearer |
| DELETE | `/auth/member/me` | DPDP-anonymize and delete member account (email → `(anonymized)`, displayName cleared) | Bearer |

**OTP Policy:**
- Length: 6 digits
- Expiry: 10 minutes
- Max Attempts: 5 per account (then locked for 15 minutes)
- Rate Limits: Per-email and per-IP
- No Enumeration: OTP request always returns success silently

**Token Format:** `{ sub, tenant, role, userType, scope }` - one format for all users

**DPDP Compliance:** On DELETE, email is cleared to `(anonymized)`, displayName set to null, `anonymousAt` timestamp kept for audit.

---

## AI Chat

| Method | Path | Description | Permission | Roles |
|--------|------|-------------|------------|-------|
| GET | `/ai/agents` | List enabled AI agents (from feature flags) | `ai:chat` | owner, admin, front_desk, trainer, member |
| POST | `/ai/chat` | Send message to Admin AI | `ai:chat` | owner, admin, front_desk, trainer, member |
| POST | `/ai/chat` (SSE) | Streaming chat with events | `ai:chat` | owner, admin, front_desk, trainer, member |
| GET | `/ai/conversations` | List user conversations | `ai:chat` | owner, admin, front_desk, trainer, member |
| GET | `/ai/conversations/:id` | Get conversation with messages | `ai:chat` | owner, admin, front_desk, trainer, member |
| PATCH | `/ai/conversations/:id/archive` | Archive conversation | `ai:chat` | owner, admin, front_desk, trainer, member |
| DELETE | `/ai/conversations/:id` | Delete conversation | `ai:chat` | owner, admin, front_desk, trainer, member |

---

## Pending Actions (Two-Phase Writes)

| Method | Path | Description | Permission | Roles |
|--------|------|-------------|------------|-------|
| GET | `/ai/pending-actions` | List pending actions | `ai:approve` | owner, admin, front_desk |
| GET | `/ai/pending-actions/:id` | Get pending action details | `ai:approve` | owner, admin, front_desk |
| POST | `/ai/pending-actions/:id/approve` | Approve pending action | `ai:approve` | owner, admin, front_desk |
| POST | `/ai/pending-actions/:id/reject` | Reject pending action | `ai:approve` | owner, admin, front_desk |
| POST | `/ai/pending-actions/:id/execute` | Execute approved action | `ai:approve` | owner, admin, front_desk |
| POST | `/ai/pending-actions/:id/cancel` | Cancel pending action | `ai:approve` | owner, admin, front_desk |

---

## Notifications

| Method | Path | Description | Permission | Roles |
|--------|------|-------------|------------|-------|
| GET | `/notifications` | List user notifications | `notifications:read` | all authenticated |
| POST | `/notifications/:id/read` | Mark notification as read | `notifications:read` | all authenticated |

---

## ERPNext Integration

| Method | Path | Description | Permission | Roles |
|--------|------|-------------|------------|-------|
| GET | `/erpnext/user` | Get logged-in ERP user | `reports:read` | owner, admin, front_desk, trainer |
| GET | `/erpnext/health` | ERP health check | `reports:read` | owner, admin, front_desk, trainer |
| GET | `/erpnext/version` | ERP version info | `reports:read` | owner, admin, front_desk, trainer |

---

## Core Domain Entities (Staff)

### Members

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/members` | `members:write` | owner, admin, front_desk |
| GET | `/members` | `members:read` | owner, admin, front_desk, trainer, member |
| GET | `/members/:id` | `members:read` | owner, admin, front_desk, trainer, member |
| PATCH | `/members/:id` | `members:write` | owner, admin, front_desk |
| DELETE | `/members/:id` | `members:write` | owner, admin, front_desk |

### Bookings

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/bookings` | `bookings:write` | owner, admin, front_desk, member |
| GET | `/bookings` | `bookings:read` | owner, admin, front_desk, trainer, member |
| GET | `/bookings/:id` | `bookings:read` | owner, admin, front_desk, trainer, member |
| PATCH | `/bookings/:id` | `bookings:write` | owner, admin, front_desk, member |
| POST | `/bookings/:id/cancel` | `bookings:write` | owner, admin, front_desk, member |
| POST | `/bookings/:id/promote-waitlist` | `bookings:write` | owner, admin, front_desk, member |

### Memberships

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/memberships` | `memberships:write` | owner, admin, front_desk |
| GET | `/memberships` | `memberships:read` | owner, admin, front_desk, trainer, member |
| GET | `/memberships/:id` | `memberships:read` | owner, admin, front_desk, trainer, member |
| PATCH | `/memberships/:id` | `memberships:write` | owner, admin, front_desk |
| POST | `/memberships/:id/cancel` | `memberships:write` | owner, admin, front_desk |

### Classes

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/classes` | `classes:write` | owner, admin, front_desk |
| GET | `/classes` | `classes:read` | owner, admin, front_desk, trainer, member, visitor |
| GET | `/classes/:id` | `classes:read` | owner, admin, front_desk, trainer, member, visitor |
| PATCH | `/classes/:id` | `classes:write` | owner, admin, front_desk |
| DELETE | `/classes/:id` | `classes:write` | owner, admin, front_desk |

### Staff

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/staff` | `staff:write` | owner, admin |
| GET | `/staff` | `staff:read` | owner, admin, front_desk |
| GET | `/staff/:id` | `staff:read` | owner, admin, front_desk |
| PATCH | `/staff/:id` | `staff:write` | owner, admin |
| DELETE | `/staff/:id` | `staff:write` | owner, admin |

### Payments

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/payments` | `payments:write` | owner, admin, front_desk |
| GET | `/payments` | `payments:read` | owner, admin, front_desk, trainer, member |
| GET | `/payments/:id` | `payments:read` | owner, admin, front_desk, trainer, member |
| PATCH | `/payments/:id` | `payments:write` | owner, admin, front_desk |
| POST | `/payments/:id/refund` | `payments:write` | owner, admin, front_desk |

### Attendance

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/attendance` | `attendance:write` | owner, admin, front_desk, trainer |
| GET | `/attendance` | `attendance:read` | owner, admin, front_desk, trainer, member |
| GET | `/attendance/:id` | `attendance:read` | owner, admin, front_desk, trainer, member |
| PATCH | `/attendance/:id` | `attendance:write` | owner, admin, front_desk, trainer |

### Events

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/events` | `events:write` | owner, admin |
| GET | `/events` | `events:read` | owner, admin |
| GET | `/events/:id` | `events:read` | owner, admin |
| PATCH | `/events/:id` | `events:write` | owner, admin |
| DELETE | `/events/:id` | `events:write` | owner, admin |

### Leads

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| POST | `/leads` | `leads:write` | owner, admin |
| GET | `/leads` | `leads:read` | owner, admin |
| GET | `/leads/:id` | `leads:read` | owner, admin |
| PATCH | `/leads/:id` | `leads:write` | owner, admin |
| POST | `/leads/:id/convert` | `leads:write` | owner, admin |

### Reports

| Method | Path | Permission | Roles |
|--------|------|------------|-------|
| GET | `/reports/revenue` | `reports:read` | owner, admin, front_desk, trainer |
| GET | `/reports/revenue/trends` | `reports:read` | owner, admin, front_desk, trainer |
| GET | `/reports/attendance` | `reports:read` | owner, admin, front_desk, trainer |
| GET | `/reports/memberships` | `reports:read` | owner, admin, front_desk, trainer |
| GET | `/reports/dashboard` | `reports:read` | owner, admin, front_desk, trainer |

---

## Webhooks (Public - Signature Verified)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/payments/webhook` | Razorpay payment webhook |
| POST | `/webhooks/razorpay` | Razorpay events |
| POST | `/webhooks/erp-events` | ERP event callbacks |
| POST | `/webhooks/n8n/callback` | n8n workflow callbacks |

---

## SSE Streaming Events (POST /ai/chat)

When using the streaming endpoint (`Accept: text/event-stream`), the following event types are sent:

| Event | Data | Description |
|-------|------|-------------|
| `message.delta` | `{ delta: string }` | Incremental text response |
| `tool.started` | `{ toolCallId: string, name: string, arguments: object }` | Tool execution started |
| `tool.finished` | `{ toolCallId: string, name: string, result: any, error?: string }` | Tool execution completed |
| `action.pending` | `{ pendingActionId: string, confirmToken: string, toolName: string, arguments: object }` | Write tool requires confirmation |
| `error` | `{ code: string, message: string, retryable: boolean }` | Error occurred |
| `done` | `{ conversationId: string }` | Stream completed |

---

## Error Response Format

All endpoints return a standardized envelope:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  },
  "meta": {
    "correlationId": "req_abc123",
    "timestamp": "2026-10-11T12:00:00.000Z"
  }
}
```

Common error codes:
- `AUTH_REQUIRED` (401) - No token provided
- `AUTH_INVALID` (401) - Invalid credentials / token
- `AUTH_EXPIRED` (401) - Expired token
- `MFA_REQUIRED` (401) - TOTP code required to finish login
- `MFA_INVALID` (401) - Invalid TOTP or recovery code
- `MFA_ENROLLMENT_REQUIRED` (403) - Owner/admin must enroll TOTP before proceeding
- `RECOVERY_CODE_INVALID` (401) - Recovery code invalid or already used
- `ACCOUNT_LOCKED` (423) - Account locked after repeated failed logins
- `TOKEN_REUSED` (401) - Refresh-token reuse detected; family revoked
- `INVITE_INVALID` (400) / `INVITE_EXPIRED` (410) - Invite token invalid/expired
- `RESET_TOKEN_INVALID` (400) / `RESET_TOKEN_EXPIRED` (410) - Reset token invalid/expired
- `OTP_INVALID` (400) / `OTP_EXPIRED` (410) - Member OTP invalid/expired
- `OTP_TOO_MANY_ATTEMPTS` (429) - Member OTP attempts exceeded
- `FORBIDDEN` (403) - Insufficient permissions
- `NOT_FOUND` (404) - Resource not found
- `VALIDATION_ERROR` (400) - Request validation failed
- `RATE_LIMITED` (429) - Too many requests
- `SERVICE_UNAVAILABLE` (503) - Dependency unavailable
- `INTERNAL_ERROR` (500) - Unexpected server error

---

## Role Permissions Matrix

| Permission | owner | admin | front_desk | trainer | member | visitor |
|------------|-------|-------|------------|---------|--------|---------|
| `*` (all) | ✅ | | | | | |
| `members:read` | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `members:write` | ✅ | ✅ | ✅ | | | |
| `bookings:read` | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `bookings:write` | ✅ | ✅ | ✅ | | ✅ | |
| `memberships:read` | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `memberships:write` | ✅ | ✅ | ✅ | | | |
| `classes:read` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `classes:write` | ✅ | ✅ | ✅ | | | |
| `payments:read` | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `payments:write` | ✅ | ✅ | ✅ | | | |
| `attendance:read` | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `attendance:write` | ✅ | ✅ | ✅ | ✅ | | |
| `staff:read` | ✅ | ✅ | ✅ | | | |
| `staff:write` | ✅ | ✅ | | | | |
| `reports:read` | ✅ | ✅ | ✅ | ✅ | | |
| `ai:chat` | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `ai:approve` | ✅ | ✅ | ✅ | | | |
| `events:read` | ✅ | ✅ | | | | |
| `events:write` | ✅ | ✅ | | | | |
| `leads:read` | ✅ | ✅ | | | | |
| `leads:write` | ✅ | ✅ | | | | |
| `feedback:read` | ✅ | ✅ | | | | |
| `feedback:write` | ✅ | ✅ | | | | |
| `schedules:read` | ✅ | ✅ | | | | |
| `schedules:write` | ✅ | ✅ | | | | |
| `dashboard:read` | ✅ | ✅ | | | | |
| `recommendations:read` | ✅ | ✅ | | | | |