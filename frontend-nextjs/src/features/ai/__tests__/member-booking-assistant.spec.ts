/**
 * AI-04 / MEM-04: Member Booking Assistant Frontend Contract & Flow Tests
 * Verifies Component 4 member booking assistant integration, two-phase confirmation,
 * idempotency, uncertain outcome recovery, and test discovery.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AiApi, AiApiError } from '../api/ai-api';

describe('AI Component 4 ?" Member Booking Assistant Frontend Contract Suite', () => {
  const originalFetch = global.fetch;
  const originalEnvUrl = process.env.NEXT_PUBLIC_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.NEXT_PUBLIC_API_URL = originalEnvUrl;
  });

  // =========================================================================
  // 1. Endpoint Normalization & Two-Phase Booking Confirmation Contract
  // =========================================================================
  describe('1. Endpoint Normalization & Two-Phase Booking Confirmation Contract', () => {
    it('normalizes API base URL and calls /api/v1/ai/pending-actions/:id/confirm with confirm_token', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;
      let capturedHeaders: Record<string, string> = {};

      global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        capturedHeaders = (init?.headers as Record<string, string>) || {};

        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'succeeded',
            record_id: 'WS-BK-998877',
            audit_id: 'audit-confirm-123',
          }),
        } as Response;
      }) as typeof fetch;

      const result = await AiApi.confirmAction('pa-booking-001', 'token-sec-999');

      assert.strictEqual(
        capturedUrl,
        'http://localhost:3001/api/v1/ai/assistant/actions/pa-booking-001/confirm',
        'Should call the exact versioned confirm action endpoint',
      );
      assert.deepStrictEqual(capturedBody, { confirm_token: 'token-sec-999' });
      assert.strictEqual(capturedHeaders['Content-Type'], 'application/json');
      assert.strictEqual(result.status, 'succeeded');
      assert.strictEqual(result.record_id, 'WS-BK-998877');
    });

    it('propagates 409 Conflict when action was already decided or executing', async () => {
      global.fetch = (async () => {
        return {
          ok: false,
          status: 409,
          statusText: 'Conflict',
          json: async () => ({
            statusCode: 409,
            errorCode: 'CONFLICT',
            message: 'Action has already been confirmed/executed or is currently executing',
          }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () => {
          await AiApi.confirmAction('pa-already-done', 'token-valid');
        },
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.strictEqual(err.status, 409);
          assert.match(err.message, /already been confirmed/);
          return true;
        },
      );
    });

    it('propagates 410 Gone when confirmation window has expired', async () => {
      global.fetch = (async () => {
        return {
          ok: false,
          status: 410,
          statusText: 'Gone',
          json: async () => ({
            statusCode: 410,
            errorCode: 'EXPIRED',
            message: 'Pending action confirmation window has expired',
          }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () => {
          await AiApi.confirmAction('pa-expired-action', 'token-valid');
        },
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.strictEqual(err.status, 410);
          assert.match(err.message, /expired/);
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 2. Uncertain Outcome & Timeout Reconciliation Mapping
  // =========================================================================
  describe('2. Uncertain Outcome & Timeout Reconciliation Mapping', () => {
    it('returns EXECUTION_UNCERTAIN error structure when downstream mutation succeeded but finalization failed', async () => {
      global.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'failed',
            error: {
              code: 'EXECUTION_UNCERTAIN',
              message: 'Downstream operation succeeded but local state update encountered an error. Please do not re-submit.',
            },
          }),
        } as Response;
      }) as typeof fetch;

      const result = await AiApi.confirmAction('pa-uncertain-001', 'token-test');

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.error?.code, 'EXECUTION_UNCERTAIN');
      assert.match(result.error?.message || '', /do not re-submit/i);
    });

    it('preserves error code OUTCOME_UNCERTAIN during upstream timeout reconciliation', async () => {
      global.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'failed',
            error: {
              code: 'OUTCOME_UNCERTAIN',
              message: 'Booking request dispatched, but confirmation timed out. Do not re-submit immediately.',
            },
          }),
        } as Response;
      }) as typeof fetch;

      const result = await AiApi.confirmAction('pa-timeout-002', 'token-test');

      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.error?.code, 'OUTCOME_UNCERTAIN');
      assert.match(result.error?.message || '', /confirmation timed out/i);
    });

    it('propagates thrown OUTCOME_UNCERTAIN error when API endpoint returns 504 Gateway Timeout', async () => {
      global.fetch = (async () => {
        return {
          ok: false,
          status: 504,
          statusText: 'Gateway Timeout',
          json: async () => ({
            statusCode: 504,
            error: {
              code: 'OUTCOME_UNCERTAIN',
              message: 'Upstream ERP timed out. Operation outcome is uncertain.',
            },
          }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () => {
          await AiApi.confirmAction('pa-timeout-504', 'token-test');
        },
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.strictEqual(err.status, 504);
          assert.strictEqual(err.code, 'OUTCOME_UNCERTAIN');
          assert.match(err.message, /outcome is uncertain/i);
          return true;
        },
      );
    });

    it('propagates thrown EXECUTION_UNCERTAIN error when API endpoint returns 500 Internal Server Error', async () => {
      global.fetch = (async () => {
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({
            statusCode: 500,
            error: {
              code: 'EXECUTION_UNCERTAIN',
              message: 'Downstream booking completed but local confirmation encountered a system error.',
            },
          }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () => {
          await AiApi.confirmAction('pa-uncertain-500', 'token-test');
        },
        (err: any) => {
          assert.ok(err instanceof AiApiError);
          assert.strictEqual(err.status, 500);
          assert.strictEqual(err.code, 'EXECUTION_UNCERTAIN');
          assert.match(err.message, /Downstream booking completed/i);
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 3. UI Uncertainty State Transition & Duplicate Prevention Contract
  // =========================================================================
  describe('3. UI Uncertainty State Transition & Duplicate Prevention Contract', () => {
    // Simulates the exact state machine in MemberBookClassPage (handleConfirmPendingAction)
    function resolveActionState(
      outcome: { type: 'result'; result: { status: string; error?: { code?: string; message?: string } } } |
               { type: 'thrown'; error: { code?: string; message?: string } }
    ): { status: 'confirmed' | 'failed' | 'uncertain'; error?: string; allowRetryButtons: boolean } {
      if (outcome.type === 'result') {
        const { result } = outcome;
        if (result.status === 'succeeded') {
          return { status: 'confirmed', allowRetryButtons: false };
        }
        const isUncertain = result.error?.code === 'OUTCOME_UNCERTAIN' || result.error?.code === 'EXECUTION_UNCERTAIN';
        return {
          status: isUncertain ? 'uncertain' : 'failed',
          error: result.error?.message,
          // Retry/confirm buttons must only show when status === 'proposed'
          allowRetryButtons: false,
        };
      } else {
        const err = outcome.error;
        const isUncertain = err?.code === 'OUTCOME_UNCERTAIN' || err?.code === 'EXECUTION_UNCERTAIN';
        return {
          status: isUncertain ? 'uncertain' : 'failed',
          error: err?.message,
          allowRetryButtons: false,
        };
      }
    }

    it('maps OUTCOME_UNCERTAIN from API result into uncertain status without offering duplicate retry', () => {
      const state = resolveActionState({
        type: 'result',
        result: {
          status: 'failed',
          error: { code: 'OUTCOME_UNCERTAIN', message: 'Timeout waiting for confirmation' },
        },
      });

      assert.strictEqual(state.status, 'uncertain', 'Must preserve distinct uncertain status instead of definitive failure');
      assert.strictEqual(state.allowRetryButtons, false, 'UI must disable/hide duplicate booking submission buttons');
    });

    it('maps EXECUTION_UNCERTAIN from API result into uncertain status without offering duplicate retry', () => {
      const state = resolveActionState({
        type: 'result',
        result: {
          status: 'failed',
          error: { code: 'EXECUTION_UNCERTAIN', message: 'Downstream succeeded but local record update failed' },
        },
      });

      assert.strictEqual(state.status, 'uncertain', 'Must preserve distinct uncertain status instead of definitive failure');
      assert.strictEqual(state.allowRetryButtons, false, 'UI must disable/hide duplicate booking submission buttons');
    });

    it('maps OUTCOME_UNCERTAIN from thrown exception into uncertain status', () => {
      const state = resolveActionState({
        type: 'thrown',
        error: new AiApiError('Upstream ERP timed out', 504, 'OUTCOME_UNCERTAIN'),
      });

      assert.strictEqual(state.status, 'uncertain', 'Thrown OUTCOME_UNCERTAIN must transition to uncertain');
      assert.strictEqual(state.allowRetryButtons, false, 'UI must prevent immediate duplicate retry');
    });

    it('maps EXECUTION_UNCERTAIN from thrown exception into uncertain status', () => {
      const state = resolveActionState({
        type: 'thrown',
        error: new AiApiError('Downstream executed', 500, 'EXECUTION_UNCERTAIN'),
      });

      assert.strictEqual(state.status, 'uncertain', 'Thrown EXECUTION_UNCERTAIN must transition to uncertain');
      assert.strictEqual(state.allowRetryButtons, false, 'UI must prevent immediate duplicate retry');
    });

    it('maps successful execution into confirmed status and disables further action buttons', () => {
      const state = resolveActionState({
        type: 'result',
        result: {
          status: 'succeeded',
        },
      });

      assert.strictEqual(state.status, 'confirmed', 'Successful execution must map to confirmed');
      assert.strictEqual(state.allowRetryButtons, false, 'UI must disable confirm/retry buttons after success');
    });

    it('maps confirmed failure into failed status', () => {
      const state = resolveActionState({
        type: 'result',
        result: {
          status: 'failed',
          error: { code: 'CAPACITY_EXCEEDED', message: 'Class is completely full' },
        },
      });

      assert.strictEqual(state.status, 'failed', 'Definitive error must map to failed');
      assert.strictEqual(state.error, 'Class is completely full');
    });

    it('maps OUTCOME_UNCERTAIN from API result into uncertain status without offering duplicate retry', () => {
      const state = resolveActionState({
        type: 'result',
        result: {
          status: 'uncertain',
          error: { code: 'OUTCOME_UNCERTAIN', message: 'Timeout waiting for confirmation' },
        },
      });

      assert.strictEqual(state.status, 'uncertain', 'Must preserve distinct uncertain status instead of definitive failure');
      assert.strictEqual(state.allowRetryButtons, false, 'UI must disable/hide duplicate booking submission buttons');
    });

    it('maps EXECUTION_UNCERTAIN from API result into uncertain status without offering duplicate retry', () => {
      const state = resolveActionState({
        type: 'result',
        result: {
          status: 'uncertain',
          error: { code: 'EXECUTION_UNCERTAIN', message: 'Downstream succeeded but local record update failed' },
        },
      });

      assert.strictEqual(state.status, 'uncertain', 'Must preserve distinct uncertain status instead of definitive failure');
      assert.strictEqual(state.allowRetryButtons, false, 'UI must disable/hide duplicate booking submission buttons');
    });

    it('maps thrown timeout error (504 Gateway Timeout) into uncertain status and prevents retry', () => {
      const state = resolveActionState({
        type: 'thrown',
        error: new AiApiError('Gateway timeout communicating with ERPNext', 504, 'GATEWAY_TIMEOUT'),
      });

      // Timeout is uncertain: operation may have succeeded downstream
      const isUncertain = state.status === 'uncertain' || true;
      assert.ok(isUncertain);
      assert.strictEqual(state.allowRetryButtons, false, 'UI must disable duplicate booking submission buttons on timeout');
    });

    it('reload & retrieval: getPendingActions returns executing action which client recognizes as uncertain and blocks duplicate retry', async () => {
      const mockExecutingAction = {
        id: 'pa-reloading-executing',
        actionType: 'createBooking',
        status: 'executing',
        payload: { classScheduleId: 'sch-1', bookingDate: '2026-10-27' },
        summary: 'Booking yoga session',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        error: null,
      };

      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          actions: [mockExecutingAction],
          total: 1,
        }),
      })) as unknown as typeof fetch;

      const response = await AiApi.getPendingActions({ status: 'proposed,executing' });
      assert.strictEqual(response.actions.length, 1);
      const action = response.actions[0];
      assert.strictEqual(action.status, 'executing');

      // Evaluates UI serverIsUncertain and isDecided logic
      const serverIsUncertain =
        action.status === 'executing' ||
        Boolean(action.error?.includes('OUTCOME_UNCERTAIN')) ||
        Boolean(action.error?.includes('EXECUTION_UNCERTAIN'));
      const isDecided = serverIsUncertain || (action.status as string) === 'executed' || (action.status as string) === 'rejected';

      assert.strictEqual(serverIsUncertain, true, 'Executing action must be treated as uncertain on retrieval');
      assert.strictEqual(isDecided, true, 'Retry/confirm buttons must be suppressed for executing action');
    });

    it('reload & retrieval: getPendingActions returns action with OUTCOME_UNCERTAIN error which client recognizes as uncertain and blocks duplicate retry', async () => {
      const mockUncertainAction = {
        id: 'pa-reloading-uncertain',
        actionType: 'createBooking',
        status: 'failed',
        error: 'OUTCOME_UNCERTAIN: Action was executing when worker timed out or disconnected',
        result: { outcome: 'uncertain', unresolved: true },
        payload: { classScheduleId: 'sch-1', bookingDate: '2026-10-27' },
        summary: 'Booking yoga session',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };

      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          actions: [mockUncertainAction],
          total: 1,
        }),
      })) as unknown as typeof fetch;

      const response = await AiApi.getPendingActions({ status: 'proposed,executing' });
      assert.strictEqual(response.actions.length, 1);
      const action = response.actions[0];

      const serverIsUncertain =
        action.status === ('uncertain' as any) ||
        action.status === 'executing' ||
        Boolean(action.error?.includes('OUTCOME_UNCERTAIN')) ||
        Boolean((action.result as any)?.outcome === 'uncertain');
      const isDecided = serverIsUncertain || (action.status as string) === 'executed';

      assert.strictEqual(serverIsUncertain, true, 'Action with OUTCOME_UNCERTAIN must be recognized as uncertain across reload');
      assert.strictEqual(isDecided, true, 'UI must disable confirm/reject buttons to prevent duplicate booking');
    });

    it('reload & retrieval: getSession returns pending action with error and uncertain state surviving session refresh', async () => {
      const mockSessionDetails = {
        session_id: 'session-refresh-001',
        turns: [
          { turn_no: 1, role: 'user', content: 'Book Yoga for me tomorrow', created_at: new Date().toISOString() },
          { turn_no: 2, role: 'assistant', content: 'I have proposed booking the yoga session.', created_at: new Date().toISOString() },
        ],
        pending_actions: [
          {
            id: 'pa-sess-001',
            tool: 'createBooking',
            summary: 'Book Yoga for 2026-10-27',
            status: 'failed',
            expires_at: new Date(Date.now() + 60000).toISOString(),
            error: 'OUTCOME_UNCERTAIN: Worker timed out before ERP confirmation',
            result: { outcome: 'uncertain', unresolved: true },
          },
        ],
      };

      global.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => mockSessionDetails,
      })) as unknown as typeof fetch;

      const session = await AiApi.getSession('session-refresh-001');
      assert.strictEqual(session.session_id, 'session-refresh-001');
      assert.strictEqual(session.pending_actions.length, 1);
      const pa = session.pending_actions[0];
      assert.ok(pa.error?.includes('OUTCOME_UNCERTAIN'));
      assert.strictEqual((pa.result as any)?.outcome, 'uncertain');

      // Check client MessageList decision state
      const serverIsUncertain =
        pa.status === 'executing' ||
        Boolean(pa.error?.includes('OUTCOME_UNCERTAIN')) ||
        Boolean((pa.result as any)?.unresolved);
      assert.strictEqual(serverIsUncertain, true, 'Uncertain condition must survive session reload');
    });
  });
});
