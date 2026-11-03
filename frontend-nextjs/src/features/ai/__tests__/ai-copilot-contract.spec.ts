/**
 * AI-02 — Admin Copilot Frontend Integration & Contract Alignment Tests
 * Verifies backend API integration, DTO compliance, auth handling, error statuses,
 * pending action confirmation/rejection lifecycle, and mock separation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AiApi, AiApiError } from '../api/ai-api';
import { useAiStore } from '../stores/aiStore';
import {
  AssistantSessionResponse,
  AssistantMessageResponse,
  ActionExecutionResponse,
  RejectActionResponse,
  ChatMessage,
} from '../types';

describe('AI-02: Admin Copilot Contract & Integration Suite', () => {
  const originalFetch = global.fetch;
  const originalEnvUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
    useAiStore.getState().resetSession();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalEnvUrl;
  });

  describe('1. API Base URL and Endpoint Resolution', () => {
    it('resolves default gateway URL and builds correct /api/v1/ai paths', () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      assert.equal(AiApi.getBaseUrl(), 'http://localhost:3001');
      assert.equal(
        AiApi.getEndpoint('/assistant/sessions'),
        'http://localhost:3001/api/v1/ai/assistant/sessions',
      );
    });

    it('trims trailing slashes from configured gateway URL', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://api.wellness-studio.com/';
      assert.equal(AiApi.getBaseUrl(), 'https://api.wellness-studio.com');
      assert.equal(
        AiApi.getEndpoint('assistant/sessions/sess_123/messages'),
        'https://api.wellness-studio.com/api/v1/ai/assistant/sessions/sess_123/messages',
      );
    });
  });

  describe('2. Session Creation (POST /api/v1/ai/assistant/sessions)', () => {
    it('creates an authenticated session and returns valid AssistantSessionResponse', async () => {
      const mockSessionResponse: AssistantSessionResponse = {
        session_id: 'session-uuid-12345',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        tools: ['member_lookup', 'class_schedule_query', 'lead_create', 'member_freeze'],
        disclaimer: 'AI assistant responses and actions are advisory.',
      };

      let requestedUrl = '';
      let requestMethod = '';
      let requestHeaders: any = {};

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestMethod = init.method;
        requestHeaders = init.headers;
        return {
          ok: true,
          status: 201,
          json: async () => mockSessionResponse,
        } as Response;
      };

      const result = await AiApi.createSession({ locale: 'en-IN' });

      assert.equal(requestedUrl, 'http://localhost:3001/api/v1/ai/assistant/sessions');
      assert.equal(requestMethod, 'POST');
      assert.equal(requestHeaders['Content-Type'], 'application/json');
      assert.equal(result.session_id, 'session-uuid-12345');
      assert.equal(result.tools.length, 4);
      assert.ok(result.disclaimer.includes('advisory'));
    });
  });

  describe('3. Messaging & Envelope Contract (POST /api/v1/ai/assistant/sessions/:id/messages)', () => {
    it('sends message with correct session ID and parses standard response envelope', async () => {
      const mockEnvelope: AssistantMessageResponse = {
        session_id: 'session-uuid-12345',
        turn_no: 2,
        type: 'answer',
        text: 'The studio has 142 active members and 12 renewals due this week.',
        tools_used: [{ name: 'member_lookup', status: 'success' }],
        correlation_id: 'msg_corr_888',
      };

      let requestedUrl = '';
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => mockEnvelope,
        } as Response;
      };

      const result = await AiApi.sendMessage('session-uuid-12345', 'How many active members?');

      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/ai/assistant/sessions/session-uuid-12345/messages',
      );
      assert.equal(sentBody.message, 'How many active members?');
      assert.equal(result.type, 'answer');
      assert.equal(result.turn_no, 2);
      assert.equal(result.tools_used[0].name, 'member_lookup');
      assert.equal(result.tools_used[0].status, 'success');
      assert.equal(result.correlation_id, 'msg_corr_888');
    });

    it('correctly maps proposed action preview when type is confirmation', async () => {
      const mockConfirmation: AssistantMessageResponse = {
        session_id: 'session-uuid-12345',
        turn_no: 4,
        type: 'confirmation',
        text: 'Please confirm freezing John Doe membership for 14 days.',
        pending_action: {
          id: 'action-uuid-999',
          tool: 'member_freeze',
          summary: 'Freeze membership for member John Doe from Oct 15 to Oct 29',
          arguments_preview: { member_id: 'mem_1', days: 14 },
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
        tools_used: [],
        correlation_id: 'msg_corr_999',
      };

      global.fetch = async () =>
        ({
          ok: true,
          status: 200,
          json: async () => mockConfirmation,
        }) as Response;

      const result = await AiApi.sendMessage('session-uuid-12345', 'Freeze John Doe for 14 days');

      assert.equal(result.type, 'confirmation');
      assert.ok(result.pending_action);
      assert.equal(result.pending_action?.id, 'action-uuid-999');
      assert.equal(result.pending_action?.tool, 'member_freeze');
      assert.deepEqual(result.pending_action?.arguments_preview, { member_id: 'mem_1', days: 14 });
    });
  });

  describe('4. Pending Action Confirmation (POST /api/v1/ai/assistant/actions/:pending_id/confirm)', () => {
    it('confirms pending action and returns execution success with record_id', async () => {
      const mockConfirmResult: ActionExecutionResponse = {
        status: 'succeeded',
        record_id: 'rec_freeze_101',
        audit_id: 'audit_log_202',
      };

      let requestedUrl = '';
      let requestMethod = '';

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestMethod = init.method;
        return {
          ok: true,
          status: 200,
          json: async () => mockConfirmResult,
        } as Response;
      };

      const result = await AiApi.confirmAction('action-uuid-999');

      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/ai/assistant/actions/action-uuid-999/confirm',
      );
      assert.equal(requestMethod, 'POST');
      assert.equal(result.status, 'succeeded');
      assert.equal(result.record_id, 'rec_freeze_101');
      assert.equal(result.audit_id, 'audit_log_202');
    });

    it('passes confirm_token in body when calling confirmAction with token', async () => {
      let requestedUrl = '';
      let requestBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'succeeded', record_id: 'rec_1' }),
        } as Response;
      };

      const result = await AiApi.confirmAction('action-uuid-999', 'secure_token_xyz');

      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/ai/assistant/actions/action-uuid-999/confirm',
      );
      assert.deepEqual(requestBody, { confirm_token: 'secure_token_xyz' });
      assert.equal(result.status, 'succeeded');
    });

    it('handles execution failure returned as 200 { status: failed, error } without throwing', async () => {
      const mockFailedResult: ActionExecutionResponse = {
        status: 'failed',
        error: {
          code: 'CONFLICT_DUPLICATE',
          message: 'Member freeze already active for these dates',
        },
      };

      global.fetch = async () =>
        ({
          ok: true,
          status: 200,
          json: async () => mockFailedResult,
        }) as Response;

      const result = await AiApi.confirmAction('action-uuid-999');
      assert.equal(result.status, 'failed');
      assert.equal(result.error?.code, 'CONFLICT_DUPLICATE');
      assert.ok(result.error?.message.includes('already active'));
    });

    it('throws AiApiError with AI_ACTION_EXPIRED on HTTP 410 Gone', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 410,
          statusText: 'Gone',
          json: async () => ({
            error: {
              code: 'AI_ACTION_EXPIRED',
              message: 'Pending action confirmation window has expired',
            },
          }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.confirmAction('action-uuid-expired'),
        (err: any) => {
          assert.equal(err instanceof AiApiError, true);
          assert.equal(err.status, 410);
          assert.equal(err.code, 'AI_ACTION_EXPIRED');
          assert.ok(err.message.includes('expired'));
          return true;
        },
      );
    });

    it('throws AiApiError with AI_ACTION_ALREADY_DECIDED on HTTP 409 Conflict', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 409,
          statusText: 'Conflict',
          json: async () => ({
            error: {
              code: 'AI_ACTION_ALREADY_DECIDED',
              message: 'Action is no longer in proposed status',
            },
          }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.confirmAction('action-uuid-decided'),
        (err: any) => {
          assert.equal(err instanceof AiApiError, true);
          assert.equal(err.status, 409);
          assert.equal(err.code, 'AI_ACTION_ALREADY_DECIDED');
          return true;
        },
      );
    });

    it('throws AiApiError with PERMISSION_DENIED on HTTP 403 Forbidden', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({
            error: {
              code: 'PERMISSION_DENIED',
              message: 'User lacks required tool execution permission',
            },
          }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.confirmAction('action-uuid-forbidden'),
        (err: any) => {
          assert.equal(err instanceof AiApiError, true);
          assert.equal(err.status, 403);
          assert.equal(err.code, 'PERMISSION_DENIED');
          return true;
        },
      );
    });
  });

  describe('5. Pending Action Rejection (POST /api/v1/ai/assistant/actions/:pending_id/reject)', () => {
    it('rejects pending action with optional reason', async () => {
      const mockRejectResult: RejectActionResponse = {
        status: 'rejected',
      };

      let requestedUrl = '';
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => mockRejectResult,
        } as Response;
      };

      const result = await AiApi.rejectAction('action-uuid-999', 'Customer changed their mind');

      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/ai/assistant/actions/action-uuid-999/reject',
      );
      assert.equal(sentBody.reason, 'Customer changed their mind');
      assert.equal(result.status, 'rejected');
    });
  });

  describe('6. Session Retrieval and Purge (GET & DELETE /api/v1/ai/assistant/sessions/:id)', () => {
    it('retrieves session turns and pending actions', async () => {
      const mockSessionDetails = {
        session_id: 'session-uuid-12345',
        turns: [
          { turn_no: 1, role: 'user', content: 'Hello', created_at: '2026-10-15T00:00:00Z' },
          { turn_no: 2, role: 'assistant', content: 'Hi there!', created_at: '2026-10-15T00:00:01Z' },
        ],
        pending_actions: [],
      };

      global.fetch = async () =>
        ({
          ok: true,
          status: 200,
          json: async () => mockSessionDetails,
        }) as Response;

      const details = await AiApi.getSession('session-uuid-12345');
      assert.equal(details.session_id, 'session-uuid-12345');
      assert.equal(details.turns.length, 2);
    });

    it('purges session on DELETE returning 204 No Content', async () => {
      let requestMethod = '';
      let requestedUrl = '';

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestMethod = init.method;
        return {
          ok: true,
          status: 204,
        } as Response;
      };

      await AiApi.deleteSession('session-uuid-12345');
      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/ai/assistant/sessions/session-uuid-12345',
      );
      assert.equal(requestMethod, 'DELETE');
    });
  });

  describe('7. Store State Synchronization and Resolution Updates', () => {
    it('initializes session and updates message resolutions on action confirm', () => {
      const store = useAiStore.getState();

      store.setSession({
        session_id: 'test-session-1',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        tools: ['member_freeze'],
        disclaimer: 'Advisory notice',
      });

      assert.equal(useAiStore.getState().sessionId, 'test-session-1');
      assert.equal(useAiStore.getState().availableTools[0], 'member_freeze');

      const msg: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Please confirm freeze',
        type: 'confirmation',
        pendingAction: {
          id: 'action-99',
          tool: 'member_freeze',
          summary: 'Freeze John Doe',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
        createdAt: new Date().toISOString(),
      };

      store.addMessage(msg);
      assert.equal(useAiStore.getState().messages.length, 1);

      // Transition to confirming
      store.updateMessageResolution('action-99', {
        pendingId: 'action-99',
        status: 'confirming',
      });

      let updated = useAiStore.getState().messages[0];
      assert.equal(updated.resolution?.status, 'confirming');

      // Transition to confirmed
      store.updateMessageResolution('action-99', {
        pendingId: 'action-99',
        status: 'confirmed',
        outcome: { status: 'succeeded', record_id: 'freeze-rec-1' },
      });

      updated = useAiStore.getState().messages[0];
      assert.equal(updated.resolution?.status, 'confirmed');
      assert.equal((updated.resolution?.outcome as any)?.record_id, 'freeze-rec-1');
    });
  });

  describe('8. Mock Separation & Production Route Verification', () => {
    it('verifies production route imports real AiCopilotWrapper, isolating mock AskAiPage', () => {
      const routePath = path.resolve(__dirname, '../../../app/admin/ai-assistant/page.tsx');
      assert.ok(fs.existsSync(routePath), 'Route /admin/ai-assistant page.tsx must exist');
      const routeContent = fs.readFileSync(routePath, 'utf-8');

      // Verifies route uses AiCopilotWrapper from @/features/ai
      assert.ok(
        routeContent.includes('AiCopilotWrapper'),
        'Route /admin/ai-assistant must render AiCopilotWrapper',
      );
      assert.ok(
        routeContent.includes('@/features/ai'),
        'Route must import from features/ai',
      );
      assert.ok(
        !routeContent.includes('generateAdminAuraResponse'),
        'Route must NOT use deterministic mock generator generateAdminAuraResponse',
      );
    });
  });

  describe('9. AI-03: Configuration, Route Normalization, Envelope Unwrapping & Robust Error Handling', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalApiTenant = process.env.API_TENANT_HOST;
    const originalPublicTenant = process.env.NEXT_PUBLIC_TENANT_HOST;

    afterEach(() => {
      (process.env as any).NODE_ENV = originalNodeEnv;
      process.env.API_TENANT_HOST = originalApiTenant;
      process.env.NEXT_PUBLIC_TENANT_HOST = originalPublicTenant;
    });

    it('getBaseUrl strips trailing /api/v1 from NEXT_PUBLIC_API_URL and avoids duplicate prefixes', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://gateway.fitness.studio/api/v1/';
      assert.equal(AiApi.getBaseUrl(), 'https://gateway.fitness.studio');
      assert.equal(
        AiApi.getEndpoint('/assistant/sessions'),
        'https://gateway.fitness.studio/api/v1/ai/assistant/sessions',
      );
    });

    it('getEndpoint normalizes paths that already include /api/v1/ai or /api/v1 without duplicating', () => {
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
      assert.equal(
        AiApi.getEndpoint('/api/v1/ai/assistant/sessions'),
        'http://localhost:3001/api/v1/ai/assistant/sessions',
      );
      assert.equal(
        AiApi.getEndpoint('api/v1/ai/audit'),
        'http://localhost:3001/api/v1/ai/audit',
      );
      assert.equal(
        AiApi.getEndpoint('/api/v1/assistant/sessions'),
        'http://localhost:3001/api/v1/ai/assistant/sessions',
      );
    });

    it('getBaseUrl returns empty string in production when unconfigured, preventing hardcoded localhost', () => {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.NEXT_PUBLIC_API_URL;

      assert.equal(AiApi.getBaseUrl(), '');
      assert.equal(
        AiApi.getEndpoint('/assistant/sessions'),
        '/api/v1/ai/assistant/sessions',
      );
    });

    it('unwraps NestJS standard response envelope { success: true, data: T, request_id }', async () => {
      const wrappedPayload = {
        success: true,
        data: {
          session_id: 'session-envelope-unwrap-123',
          expires_at: '2026-10-16T00:00:00.000Z',
          tools: ['member_lookup'],
          disclaimer: 'Advisory notice',
        },
        request_id: 'req_envelope_999',
      };

      global.fetch = async () =>
        ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(wrappedPayload),
        }) as Response;

      const result = await AiApi.createSession();
      assert.equal(result.session_id, 'session-envelope-unwrap-123');
      assert.deepEqual(result.tools, ['member_lookup']);
    });

    it('formats array error messages from class-validator into readable error string', async () => {
      const validationErrorPayload = {
        statusCode: 400,
        message: ['message must be a string', 'message should not be empty'],
        error: 'Bad Request',
      };

      global.fetch = async () =>
        ({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => JSON.stringify(validationErrorPayload),
        }) as Response;

      await assert.rejects(
        async () => AiApi.sendMessage('sess-1', ''),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 400);
          assert.equal(err.message, 'message must be a string; message should not be empty');
          return true;
        },
      );
    });

    it('handles non-JSON error bodies (HTML 502/504 gateway timeout) gracefully', async () => {
      const htmlBody = '<html><body>502 Bad Gateway</body></html>';

      global.fetch = async () =>
        ({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          text: async () => htmlBody,
        }) as Response;

      await assert.rejects(
        async () => AiApi.getSession('sess-1'),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 502);
          assert.ok(err.message.includes('502 Bad Gateway'));
          return true;
        },
      );
    });

    it('queries pending actions with pagination parameters', async () => {
      let requestedUrl = '';
      global.fetch = async (url: any) => {
        requestedUrl = String(url);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ actions: [], total: 0, page: 2, limit: 10 }),
        } as Response;
      };

      const result = await AiApi.getPendingActions({ status: 'proposed', page: 2, limit: 10 });
      assert.equal(requestedUrl, 'http://localhost:3001/api/v1/ai/pending-actions?status=proposed&page=2&limit=10');
      assert.deepEqual(result.actions, []);
      assert.equal(result.page, 2);
    });
  });

  describe('10. AI-05: AI Audit Log Retrieval Contract & Frontend Integration', () => {
    it('constructs correct GET /api/v1/ai/audit query URL with documented filters and tenant Host header', async () => {
      let requestedUrl = '';
      let capturedHeaders: Record<string, string> = {};

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        capturedHeaders = init?.headers || {};
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              {
                id: 'audit_101',
                actor: 'usr_admin_1',
                tool: 'createMember',
                arguments_redacted: { full_name: 'Jane Doe', plan: 'Gold' },
                decision: 'approved',
                approval: { approved_by: 'usr_admin_1' },
                result: { record_id: 'MEM-001' },
                at: '2026-10-15T12:00:00Z',
              },
            ]),
        } as Response;
      };

      const logs = await AiApi.getAuditLogs({
        tool: 'createMember',
        user_id: 'usr_admin_1',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-15T23:59:59Z',
        page: 1,
        limit: 25,
      });

      assert.ok(requestedUrl.includes('/api/v1/ai/audit?'));
      assert.ok(requestedUrl.includes('tool=createMember'));
      assert.ok(requestedUrl.includes('user_id=usr_admin_1'));
      assert.ok(requestedUrl.includes('page=1'));
      assert.ok(requestedUrl.includes('limit=25'));
      assert.ok(capturedHeaders['Host'] === 'pilot-studio.fitness.local' || capturedHeaders['Host'] === 'demo.fitness.local');
      assert.equal(logs.length, 1);
      assert.equal(logs[0].id, 'audit_101');
      assert.equal(logs[0].tool, 'createMember');
      assert.equal(logs[0].decision, 'approved');
      assert.equal(logs[0].arguments_redacted.full_name, 'Jane Doe');
    });

    it('supports Document 5 filter[user_id] and filter[tool] aliases', async () => {
      let requestedUrl = '';
      global.fetch = async (url: any) => {
        requestedUrl = String(url);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([]),
        } as Response;
      };

      await AiApi.getAuditLogs({
        'filter[tool]': 'getRevenueSummary',
        'filter[user_id]': 'usr_owner_9',
      });

      assert.ok(requestedUrl.includes('tool=getRevenueSummary'));
      assert.ok(requestedUrl.includes('user_id=usr_owner_9'));
    });

    it('unwraps NestJS ResponseEnvelopeInterceptor wrapper { success: true, data: [...] } for audit logs', async () => {
      global.fetch = async () =>
        ({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              success: true,
              data: [
                {
                  id: 'audit_wrap_1',
                  actor: 'usr_admin',
                  tool: 'getExpiringMemberships',
                  arguments_redacted: { days: 7 },
                  decision: null,
                  approval: null,
                  result: 'succeeded',
                  at: '2026-10-15T10:00:00Z',
                },
              ],
              request_id: 'req_audit_wrap',
            }),
        }) as Response;

      const logs = await AiApi.getAuditLogs();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].id, 'audit_wrap_1');
      assert.equal(logs[0].tool, 'getExpiringMemberships');
    });

    it('throws AiApiError with status 403 and code PERMISSION_DENIED on unauthorized role access', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          text: async () =>
            JSON.stringify({
              statusCode: 403,
              message: 'Insufficient permissions: audit:read required',
              error: {
                code: 'PERMISSION_DENIED',
                message: 'Insufficient permissions: audit:read required',
              },
            }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.getAuditLogs(),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 403);
          assert.equal(err.code, 'PERMISSION_DENIED');
          assert.ok(err.message.includes('audit:read required'));
          return true;
        },
      );
    });

    it('propagates 400 Bad Request error when date range is invalid (from > to)', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () =>
            JSON.stringify({
              statusCode: 400,
              message: '"from" date must be earlier than or equal to "to" date.',
            }),
        }) as Response;

      await assert.rejects(
        async () =>
          AiApi.getAuditLogs({
            from: '2026-10-20T00:00:00Z',
            to: '2026-10-10T00:00:00Z',
          }),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 400);
          assert.ok(err.message.includes('earlier than or equal to'));
          return true;
        },
      );
    });

    it('propagates honest 500 error when database fails without fabricating fake data', async () => {
      global.fetch = async () =>
        ({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: async () =>
            JSON.stringify({
              statusCode: 500,
              message: 'Failed to retrieve audit logs due to database error',
              code: 'DATABASE_ERROR',
            }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.getAuditLogs(),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 500);
          assert.equal(err.code, 'DATABASE_ERROR');
          return true;
        },
      );
    });

    it('verifies AiCopilotPage integrates Audit Trail tab and imports AiAuditLogsPanel', () => {
      const pagePath = path.resolve(__dirname, '../pages/AiCopilotPage.tsx');
      assert.ok(fs.existsSync(pagePath), 'AiCopilotPage.tsx must exist');
      const content = fs.readFileSync(pagePath, 'utf-8');

      assert.ok(
        content.includes('AiAuditLogsPanel'),
        'AiCopilotPage must import and render AiAuditLogsPanel',
      );
      assert.ok(
        content.includes('Audit Trail'),
        'AiCopilotPage must render Audit Trail tab button',
      );
      assert.ok(
        content.includes("setActiveTab('audit')"),
        "AiCopilotPage must support switching to 'audit' tab",
      );
    });

    it('verifies AiAuditLogsPanel component implements filtering, loading, empty, and permission states', () => {
      const panelPath = path.resolve(__dirname, '../components/AiAuditLogsPanel.tsx');
      assert.ok(fs.existsSync(panelPath), 'AiAuditLogsPanel.tsx must exist');
      const content = fs.readFileSync(panelPath, 'utf-8');

      assert.ok(content.includes('getAuditLogs'), 'AiAuditLogsPanel must call AiApi.getAuditLogs');
      assert.ok(content.includes('audit:read'), 'AiAuditLogsPanel must respect audit:read permission');
      assert.ok(content.includes('arguments_redacted'), 'AiAuditLogsPanel must display redacted arguments');
      assert.ok(content.includes('handleExportCsv'), 'AiAuditLogsPanel must implement CSV export');
      assert.ok(content.includes('handleExportJson'), 'AiAuditLogsPanel must implement JSON export');
      assert.ok(content.includes('Rows per page:'), 'AiAuditLogsPanel must implement pagination limit selector');
    });
  });

  describe('11. Authentication Token Handling & Fail-Closed Security (Phase 1, Step 2)', () => {
    const originalWindow = (global as any).window;
    const originalLocalStorage = (global as any).localStorage;
    const originalNodeEnv = process.env.NODE_ENV;

    const setupMockBrowser = (storage: Record<string, string> = {}) => {
      (global as any).window = {
        location: { host: 'localhost:3000' },
      };
      (global as any).localStorage = {
        getItem: (k: string) => storage[k] || null,
        setItem: (k: string, v: string) => {
          storage[k] = v;
        },
        removeItem: (k: string) => {
          delete storage[k];
        },
      };
    };

    afterEach(() => {
      if (originalWindow !== undefined) {
        (global as any).window = originalWindow;
      } else {
        delete (global as any).window;
      }
      if (originalLocalStorage !== undefined) {
        (global as any).localStorage = originalLocalStorage;
      } else {
        delete (global as any).localStorage;
      }
      (process.env as any).NODE_ENV = originalNodeEnv;
    });

    it('uses legitimate staff token when ws_staff_token is present in localStorage', async () => {
      setupMockBrowser({
        ws_staff_token: 'legit-staff-token-12345',
      });

      const headers = AiApi.getAuthHeaders();
      assert.equal(headers['Authorization'], 'Bearer legit-staff-token-12345');

      let capturedHeaders: any = {};
      global.fetch = async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 201,
          json: async () => ({ session_id: 'sess-auth-staff' }),
        } as Response;
      };

      await AiApi.createSession();
      assert.equal(capturedHeaders['Authorization'], 'Bearer legit-staff-token-12345');
    });

    it('uses legitimate member token when ws_member_token is present in localStorage', async () => {
      setupMockBrowser({
        ws_member_token: 'legit-member-token-67890',
      });

      const headers = AiApi.getAuthHeaders();
      assert.equal(headers['Authorization'], 'Bearer legit-member-token-67890');

      let capturedHeaders: any = {};
      global.fetch = async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 201,
          json: async () => ({ session_id: 'sess-auth-member' }),
        } as Response;
      };

      await AiApi.createSession();
      assert.equal(capturedHeaders['Authorization'], 'Bearer legit-member-token-67890');
    });

    it('fails closed and omits Authorization header when token is missing (even in development mode)', async () => {
      (process.env as any).NODE_ENV = 'development';
      setupMockBrowser({});

      const headers = AiApi.getAuthHeaders();
      assert.equal(headers['Authorization'], undefined);
      assert.equal('Authorization' in headers, false);

      let capturedHeaders: any = {};
      global.fetch = async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 201,
          json: async () => ({ session_id: 'sess-no-auth' }),
        } as Response;
      };

      await AiApi.createSession();
      assert.equal(capturedHeaders['Authorization'], undefined);
      assert.equal('Authorization' in capturedHeaders, false);
    });

    it('never attaches any hardcoded development owner JWT when token is missing', async () => {
      (process.env as any).NODE_ENV = 'test';
      setupMockBrowser({});

      const headers = AiApi.getAuthHeaders();
      assert.equal(headers['Authorization'], undefined);

      let capturedHeaders: any = {};
      global.fetch = async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'succeeded' }),
        } as Response;
      };

      await AiApi.confirmAction('act-1', 'valid-tok');
      assert.equal(capturedHeaders['Authorization'], undefined);
      assert.equal(JSON.stringify(capturedHeaders).includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), false);
    });

    it('handles authentication failure (HTTP 401) by throwing AiApiError with code UNAUTHORIZED', async () => {
      setupMockBrowser({});

      global.fetch = async () =>
        ({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: async () =>
            JSON.stringify({
              statusCode: 401,
              message: 'Authentication token missing or invalid',
              code: 'UNAUTHORIZED',
            }),
        }) as Response;

      await assert.rejects(
        async () => AiApi.createSession(),
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.equal(err.status, 401);
          assert.equal(err.code, 'UNAUTHORIZED');
          assert.equal(err.message, 'Authentication token missing or invalid');
          return true;
        },
      );
    });

    it('existing authenticated API requests continue to work with valid session', async () => {
      setupMockBrowser({
        ws_staff_token: 'auth-session-valid-token',
      });

      const mockResponse: AssistantMessageResponse = {
        session_id: 'session-auth-check',
        turn_no: 1,
        type: 'answer',
        text: 'Authenticated response from assistant',
        tools_used: [],
        correlation_id: 'corr-auth-check',
      };

      let capturedHeaders: any = {};
      global.fetch = async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          json: async () => mockResponse,
        } as Response;
      };

      const result = await AiApi.sendMessage('session-auth-check', 'Status check');
      assert.equal(capturedHeaders['Authorization'], 'Bearer auth-session-valid-token');
      assert.equal(result.text, 'Authenticated response from assistant');
    });
  });

  describe('13. Cross-Tab Pending Actions Cache & Resolution Synchronization (Defect 4)', () => {
    it('sends POST /api/v1/ai/assistant/actions/:id/confirm with confirm_token body payload', async () => {
      let requestedUrl = '';
      let requestMethod = '';
      let requestBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestMethod = init.method;
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: 'succeeded',
              record_id: 'MEM-SYNC-001',
              audit_id: 'audit-sync-001',
            }),
        } as Response;
      };

      const result = await AiApi.confirmAction('pa-sync-100', 'valid-sync-token');
      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/ai/assistant/actions/pa-sync-100/confirm',
      );
      assert.equal(requestMethod, 'POST');
      assert.equal(requestBody.confirm_token, 'valid-sync-token');
      assert.equal(result.status, 'succeeded');
      assert.equal(result.record_id, 'MEM-SYNC-001');
    });

    it('sends POST /api/v1/ai/assistant/actions/:id/reject with reason in request body', async () => {
      let requestedUrl = '';
      let requestMethod = '';
      let requestBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestMethod = init.method;
        requestBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: 'rejected',
            }),
        } as Response;
      };

      const result = await AiApi.rejectAction('pa-sync-200', 'Duplicate request');
      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/ai/assistant/actions/pa-sync-200/reject',
      );
      assert.equal(requestMethod, 'POST');
      assert.equal(requestBody.reason, 'Duplicate request');
      assert.equal(result.status, 'rejected');
    });

    it('sends POST /api/v1/ai/pending-actions/:id/approval-token via requestApprovalToken', async () => {
      let requestedUrl = '';
      let requestMethod = '';

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestMethod = init.method;
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              confirm_token: 'token-issued-from-queue',
            }),
        } as Response;
      };

      const result = await AiApi.requestApprovalToken('pa-queue-555');
      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/ai/pending-actions/pa-queue-555/approval-token',
      );
      assert.equal(requestMethod, 'POST');
      assert.equal(result.confirm_token, 'token-issued-from-queue');
    });

    it('automatically requests approval token when confirmAction is called without a token', async () => {
      const calls: Array<{ url: string; method: string; body?: any }> = [];

      global.fetch = async (url: any, init: any) => {
        const urlStr = String(url);
        calls.push({
          url: urlStr,
          method: init.method,
          body: init.body ? JSON.parse(init.body) : undefined,
        });

        if (urlStr.includes('/approval-token')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ confirm_token: 'auto-requested-token-999' }),
          } as Response;
        }

        if (urlStr.includes('/confirm')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                status: 'succeeded',
                record_id: 'MEM-AUTO-001',
              }),
          } as Response;
        }

        throw new Error(`Unexpected url: ${urlStr}`);
      };

      const result = await AiApi.confirmAction('pa-queue-auto');
      assert.equal(calls.length, 2);
      assert.equal(
        calls[0].url,
        'http://localhost:3001/api/v1/ai/pending-actions/pa-queue-auto/approval-token',
      );
      assert.equal(
        calls[1].url,
        'http://localhost:3001/api/v1/ai/assistant/actions/pa-queue-auto/confirm',
      );
      assert.equal(calls[1].body.confirm_token, 'auto-requested-token-999');
      assert.equal(result.status, 'succeeded');
      assert.equal(result.record_id, 'MEM-AUTO-001');
    });
  });
});

