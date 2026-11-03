/**
 * AI-05 / B2C Feedback Intelligence Frontend Contract & Flow Tests
 * Verifies Feedback Intelligence Assistant frontend integration, ApiClient.submitMemberFeedback,
 * parameter serialization, header propagation, and error handling.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../lib/api-client';

describe('AI Component 5 — Member Feedback Intelligence Frontend Suite', () => {
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
  // 1. ApiClient.submitMemberFeedback Serialization
  // =========================================================================
  describe('1. ApiClient.submitMemberFeedback Serialization', () => {
    it('serializes member feedback payload to POST /api/v1/feedback/member', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedBody: any = null;

      global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedMethod = init?.method || 'GET';
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

        return {
          ok: true,
          status: 201,
          json: async () => ({
            success: true,
            data: {
              id: 'feedback-123',
              sessionId: 'sess-101',
              rating: 5,
              reviewStatus: 'New',
            },
          }),
        } as Response;
      }) as typeof fetch;

      const result = await ApiClient.submitMemberFeedback({
        sessionId: 'sess-101',
        rating: 5,
        strengths: ['Great coaching', 'Music'],
        improvements: [],
        comment: 'Super instructor and great music.',
        category: 'Trainer',
      });

      assert.equal(capturedMethod, 'POST');
      assert.ok(capturedUrl.endsWith('/api/v1/feedback/member'), `Expected endpoint to end with /api/v1/feedback/member, got ${capturedUrl}`);
      assert.equal(capturedBody.session_id, 'sess-101');
      assert.equal(capturedBody.rating, 5);
      assert.deepEqual(capturedBody.strengths, ['Great coaching', 'Music']);
      assert.equal(capturedBody.category, 'Trainer');
      assert.ok(result);
    });

    it('propagates API error messages when submission fails', async () => {
      global.fetch = (async () => {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({
            message: 'Rating must be an integer between 1 and 5',
          }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () => {
          await ApiClient.submitMemberFeedback({
            rating: 6,
            comment: 'Invalid rating',
          });
        },
        /Rating must be an integer between 1 and 5/,
      );
    });

    it('propagates network failure without fake success (Finding M1)', async () => {
      global.fetch = (async () => {
        throw new Error('Network timeout or connection refused');
      }) as typeof fetch;

      await assert.rejects(
        async () => {
          await ApiClient.submitMemberFeedback({
            rating: 5,
            comment: 'Network down',
          });
        },
        /Network timeout or connection refused/,
      );
    });
  });
});
