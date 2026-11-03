# n8n credentials (names only, no secrets)

Create these in the n8n UI under Credentials. Never commit values.

| Credential name | Type | Used by | Mode |
|---|---|---|---|
| wsos-api-service | Header Auth (service token) | All workflows calling the internal automation API | dev, beta |
| wsos-hmac-secret | Environment variable HMAC_SECRET_N8N | Verifying signed webhooks from the outbox dispatcher | dev, beta |
| whatsapp-cloud-api | HTTP Header Auth (Bearer) | send-message (live branch only) | live only |
| email-provider | TBD | send-message email branch | Phase 2 |

Rules:
- WHATSAPP_MODE=mock in dev and beta, so no WhatsApp credential is needed yet.
- Per-tenant credentials are supported by design; do not hard-code a tenant.
- Values live in the secret store or environment, never in workflow JSON.