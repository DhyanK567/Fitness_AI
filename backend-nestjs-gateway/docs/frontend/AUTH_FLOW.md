# B2C Member Auth Flow

## Overview
B2C member authentication uses email OTP (one-time password) with a consent-based signup flow. All endpoints follow the standard `(sub, tenant, role, userType, scope)` token format.

## Endpoints

### 1. POST /auth/member/signup
**Description**: B2C member signup with consent to terms. Creates member user, hashes password, assigns `member` role, and sends OTP for verification.

**Curl Example**:
```bash
curl -X POST https://api.fitness-ai.com/auth/member/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "member@acme.fitness",
    "password": "Secure-Pass-9",
    "confirmEmail": "member@acme.fitness",
    "consent": "I agree to the terms and conditions"
  }'
```

**Fetch Example**:
```javascript
const response = await fetch('https://api.fitness-ai.com/auth/member/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'member@acme.fitness',
    password: 'Secure-Pass-9',
    confirmEmail: 'member@acme.fitness',
    consent: 'I agree to the terms and conditions'
  })
});
const data = await response.json();
console.log(data);
// { status: 'sent', user_id: '...', tenant_id: '...', expires_in: 14400, consent_verified: true }
```

**Responses**:
- `201` - Member created, OTP sent
- `400` - Email/confirm email mismatch, password too short, or email already registered
- `409` - Email already registered (enumeration-safe response)

---

### 2. POST /auth/member/otp/request
**Description**: Request OTP for member verification. Always returns success silently to prevent email enumeration.

**Curl Example**:
```bash
curl -X POST https://api.fitness-ai.com/auth/member/otp/request \
  -H "Content-Type: application/json" \
  -d '{
    "email": "member@acme.fitness",
    "consent": "I agree to the terms and conditions"
  }'
```

**Fetch Example**:
```javascript
const response = await fetch('https://api.fitness-ai.com/auth/member/otp/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'member@acme.fitness',
    consent: 'I agree to the terms and conditions'
  })
});
const data = await response.json();
console.log(data);
// { status: 'sent' }
```

**Responses**:
- `200` - OTP sent (always succeeds silently)

---

### 3. POST /auth/member/otp/verify
**Description**: Verify 6-digit OTP code. Issues access token and refresh token on success.

**Curl Example**:
```bash
curl -X POST https://api.fitness-ai.com/auth/member/otp/verify \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

**Fetch Example**:
```javascript
const response = await fetch('https://api.fitness-ai.com/auth/member/otp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: '123456' })
});
const data = await response.json();
console.log(data);
// { status: 'verified', access_token: '...', refresh_token: '...', token_type: 'Bearer', expires_in: 900 }
```

**Responses**:
- `200` - OTP verified, tokens issued
- `400` - Invalid or expired OTP code
- `429` - Too many attempts, account locked

---

### 4. GET /auth/member/me
**Description**: Get current member profile including role, tenant, and permissions.

**Curl Example**:
```bash
curl -X GET https://api.fitness-ai.com/auth/member/me \
  -H "Authorization: Bearer <access_token>"
```

**Fetch Example**:
```javascript
const response = await fetch('https://api.fitness-ai.com/auth/member/me', {
  method: 'GET',
  headers: { 'Authorization': 'Bearer ' + accessToken }
});
const data = await response.json();
console.log(data);
// { user: { id: '...', email: 'member@acme.fitness', displayName: 'Member', userType: 'member', status: 'active' },
//   roles: ['member'],
//   role: 'member',
//   tenant: { id: 'tenant-1', code: 'tenant-1', name: 'Tenant 1' },
//   permissions: ['read', 'write'] }
```

**Responses**:
- `200` - Member profile
- `401` - Invalid or missing token

---

### 5. PATCH /auth/member/me
**Description**: Update member profile name (DPDP-compliant, only name field allowed).

**Curl Example**:
```bash
curl -X PATCH https://api.fitness-ai.com/auth/member/me \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Name"}'
```

**Fetch Example**:
```javascript
const response = await fetch('https://api.fitness-ai.com/auth/member/me', {
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer ' + accessToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'New Name' })
});
const data = await response.json();
console.log(data);
// { status: 'updated' }
```

**Responses**:
- `200` - Profile updated
- `401` - Invalid or missing token

---

### 6. DELETE /auth/member/me
**Description**: DPDP-anonymize and delete member account. Email is cleared to `(anonymized)`, displayName set to null.

**Curl Example**:
```bash
curl -X DELETE https://api.fitness-ai.com/auth/member/me \
  -H "Authorization: Bearer <access_token>"
```

**Fetch Example**:
```javascript
const response = await fetch('https://api.fitness-ai.com/auth/member/me', {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer ' + accessToken }
});
const data = await response.json();
console.log(data);
// { status: 'deleted' }
```

**Responses**:
- `200` - Account deleted (anonymized)
- `401` - Invalid or missing token

## OTP Policy
- **Length**: 6 digits
- **Expiry**: 10 minutes
- **Max Attempts**: 5 per account (then locked for 15 minutes)
- **Rate Limits**: Per-email and per-IP
- **No Enumeration**: OTP request always returns success silently

## Token Format
All tokens contain: `(sub, tenant, role, userType, scope)`
- `sub`: User UUID
- `tenant`: Tenant identifier
- `role`: User role (member, visitor, front_desk, trainer, admin, owner)
- `userType`: 'member' or 'staff'
- `scope`: Optional permission scope

## DPDP Compliance
- **On DELETE**: Email cleared to `(anonymized)`, `displayName` set to null, `anonymousAt` timestamp kept for audit
- **On signup**: Consent must be explicitly provided
- **No email enumeration**: All OTP-related endpoints return identical responses regardless of email existence