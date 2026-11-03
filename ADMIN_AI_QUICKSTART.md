# 🚀 Admin AI (Studio Copilot) - Quick Start Checklist

## ✅ Backend Code Status: **READY**
All code compiles, tests pass (16/16 test suites, 43 tests), contract tests pass (25/25).

---

## 🔧 Infrastructure Setup (Do First)

### 1. Database Migration
```bash
cd backend-nestjs-gateway
npx prisma migrate deploy
```
Creates `ai` schema with: `conversations`, `messages`, `pending_actions` tables with RLS.

### 2. Verify PostgreSQL
```bash
# Check connection
psql -U wellness_app -d wellness_studio -c "\dn"  # Should show 'ai' schema
```

---

## 🔐 Environment Variables (`.env`)

### **Current `.env` Status** ⚠️ **INCOMPLETE**

| Variable | Current | Required | Action |
|----------|---------|----------|--------|
| `PORT` | `3000` | ✅ | OK |
| `FRAPPE_BASE_URL` | `http://127.0.0.1:8000` | ✅ | OK (if ERPNext runs here) |
| `FRAPPE_API_KEY` | **EMPTY** | ✅ **REQUIRED** | Get from ERPNext |
| `FRAPPE_API_SECRET` | **EMPTY** | ✅ **REQUIRED** | Get from ERPNext |
| `FRAPPE_CALLBACK_SECRET` | MISSING | ✅ **REQUIRED** | Add to `.env` |
| `FRAPPE_TIMEOUT_MS` | `5000` | ⚠️ Low | Use `10000` (see `.env.example`) |
| `JWT_SECRET` | **EMPTY** | ✅ **REQUIRED** | Generate strong secret |
| `DATABASE_URL` | `postgresql://wellness_app:change-me@...` | ✅ **REQUIRED** | Fix password |
| `LLM_PROVIDER` | `gemini` | ✅ | OK |
| `LLM_MODEL` | `gemini-3.8-flash` | ⚠️ | Use `gemini-1.5-flash` or `gemini-1.5-pro` |
| `LLM_API_KEY` | **PLACEHOLDER** | ✅ **REQUIRED** | Get from Google AI Studio |
| `FRAPPE_CALLBACK_SECRET` | MISSING | ✅ **REQUIRED** | Add for ERP callbacks |
| `RAZORPAY_WEBHOOK_SECRET` | MISSING | If using payments | Add if using Razorpay |
| `NODE_ENV` | MISSING | ✅ | Add `development` |
| `TRUST_PROXY_HOPS` | MISSING | If behind proxy | Add `1` |
| `CORS_ALLOWED_ORIGINS` | MISSING | ✅ | Add frontend URL |

### **Quick Fix - Copy from example:**
```bash
cp backend-nestjs-gateway/.env.example backend-nestjs-gateway/.env
# Then edit .env with real values
```

---

## 🤖 LLM Provider Setup

### Option A: Google Gemini (Current)
1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create API key
2. Set in `.env`:
   ```env
   LLM_PROVIDER=gemini
   LLM_MODEL=gemini-1.5-flash  # or gemini-1.5-pro
   LLM_API_KEY=your-actual-key-here
   ```

### Option B: OpenAI (Alternative)
```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-...
```

---

## 🏷️ Feature Flag (Required)

Enable AI for your test tenant:
```sql
INSERT INTO config.tenant_feature_flags (tenant_id, feature_code, is_enabled)
VALUES ('your-tenant-uuid', 'ai.admin', true)
ON CONFLICT (tenant_id, feature_code) DO UPDATE SET is_enabled = true;
```

Or via Prisma:
```bash
npx prisma db seed  # if seed includes feature flags
```

---

## 🏃 Quick Test (After Setup)

### 1. Start Services
```bash
# Terminal 1: ERPNext (port 8000)
cd erpnext-custom-app && bench start

# Terminal 2: NestJS Gateway (port 3000)
cd backend-nestjs-gateway && npm run dev

# Terminal 3: Frontend (port 3000)
cd frontend-nextjs && npm run dev
```

### 2. Test Chat Endpoint
```bash
# Get JWT token first (via auth login)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password"}' | jq -r .accessToken)

# Test AI chat
curl -X POST http://localhost:3000/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "How many active members do we have?"}'
```

**Expected Response:**
```json
{
  "response": "According to getMemberCount, you have 214 active members (data as of 2026-10-06 14:30 IST).",
  "conversationId": "uuid...",
  "toolCalls": [{"id":"...","name":"getMemberCount","arguments":{"status":"active"}}]
}
```

---

## 🧪 Test Checklist

| Test | Command | Expected |
|------|---------|----------|
| Health | `curl localhost:3000/health` | `{"status":"ok"}` |
| ERP Health | `curl -H "Auth: $TOKEN" localhost:3000/erpnext/health` | ERP responds |
| AI Chat | `POST /ai/chat` with token | AI responds with tool calls |
| Conversations | `GET /ai/conversations` | List conversations |
| Pending Actions | `GET /ai/pending-actions` | List (requires `ai.approve`) |

---

## 🔍 Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `LLM_API_KEY invalid` | Wrong key | Check Google AI Studio |
| `FRAPPE_API_KEY unauthorized` | Wrong ERP credentials | Check ERPNext API keys |
| `Tenant not found` | JWT tenant mismatch | Check JWT payload |
| `RLS policy violation` | Missing `app.current_tenant` | Check Prisma middleware |
| `Migration failed` | DB locked | Ensure no other connections |

---

## 📞 Team Contacts

| Area | Owner | Slack |
|------|-------|-------|
| Backend (NestJS) | [Backend Lead] | #backend |
| ERPNext | [ERP Engineer] | #erpnext |
| Frontend | [Frontend Lead] | #frontend |
| DevOps | [DevOps] | #devops |
| AI/ML | [AI Engineer] | #ai-ml |

---

## 📝 Post-Launch Monitoring

| Metric | Alert Threshold |
|--------|-----------------|
| LLM Error Rate | > 5% |
| p95 Latency | > 3s |
| Token Budget | > 80% daily |
| Cross-tenant Test | Any failure = critical |
| Pending Action Age | > 24h proposed = alert |

---

**Last Updated:** 2026-10-06  
**Backend Version:** Phase 1 Complete  
**Next Review:** After frontend integration