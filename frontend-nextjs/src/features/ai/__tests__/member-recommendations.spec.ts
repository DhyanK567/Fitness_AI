/**
 * AI-04 / B2C-09: Member Recommendations Frontend Contract & Flow Tests
 * Verifies Recommendation Assistant frontend integration, ApiClient.getRecommendations,
 * parameter serialization, empty states, and booking deep-link generation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../../../lib/api-client';

describe('AI Component 4 — Member Recommendations Frontend Suite', () => {
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
  // 1. ApiClient.getRecommendations Request Serialisation & Routing
  // =========================================================================
  describe('1. ApiClient.getRecommendations Serialization', () => {
    it('serializes goal and days query parameters to GET /api/v1/recommendations', async () => {
      let capturedUrl = '';
      let capturedMethod = '';

      global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedMethod = init?.method || 'GET';

        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [
              {
                session_id: 'sess-101',
                class_name: 'Flow Yoga',
                category: 'Yoga',
                trainer: 'Elena',
                session_date: '2026-10-26',
                start_time: '08:00',
                available_spots: 8,
                match_score: 95,
                reason: 'Directly aligns with your flexibility focus.',
                book_href: '/member/book-class?classId=sess-101&className=Flow%20Yoga&category=Yoga',
              },
            ],
          }),
        } as Response;
      }) as typeof fetch;

      const results = await ApiClient.getRecommendations({
        goal: 'flexibility & mobility',
        days: 14,
      });

      assert.strictEqual(capturedMethod, 'GET');
      assert.ok(
        capturedUrl.includes('/recommendations?'),
        `Expected URL to contain /recommendations?, got ${capturedUrl}`,
      );
      assert.ok(
        capturedUrl.includes('goal=flexibility'),
        `Expected goal param in URL, got ${capturedUrl}`,
      );
      assert.ok(
        capturedUrl.includes('days=14'),
        `Expected days param in URL, got ${capturedUrl}`,
      );

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].sessionId, 'sess-101');
      assert.strictEqual(results[0].className, 'Flow Yoga');
      assert.strictEqual(results[0].category, 'Yoga');
      assert.strictEqual(results[0].availableSpots, 8);
      assert.strictEqual(results[0].matchScore, 95);
      assert.strictEqual(
        results[0].bookHref,
        '/member/book-class?classId=sess-101&className=Flow%20Yoga&category=Yoga',
      );
    });

    it('returns empty array when gateway returns 0 recommendations without fabricating items', async () => {
      global.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [],
          }),
        } as Response;
      }) as typeof fetch;

      const results = await ApiClient.getRecommendations({ goal: 'strength' });
      assert.strictEqual(results.length, 0);
      assert.deepStrictEqual(results, []);
    });

    it('propagates error when gateway returns an API failure', async () => {
      global.fetch = (async () => {
        return {
          ok: false,
          status: 403,
          json: async () => ({
            success: false,
            message: 'Members can only request their own recommendations',
          }),
        } as Response;
      }) as typeof fetch;

      await assert.rejects(
        async () => {
          await ApiClient.getRecommendations({ memberId: 'other-user' });
        },
        /Members can only request their own recommendations/,
      );
    });
  });

  // =========================================================================
  // 2. Booking Deep-Link Generation & Parameter Normalization
  // =========================================================================
  describe('2. Booking Link Parameter Propagation', () => {
    it('generates encoded bookHref linking to /member/book-class with classId, className, and category', async () => {
      global.fetch = (async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [
              {
                session_id: 'rec-uuid-999',
                class_name: 'High Intensity & Conditioning',
                category: 'HIIT & Cardio',
                trainer: 'Marcus',
                session_date: '2026-10-27',
                start_time: '18:30',
                available_spots: 4,
                match_score: 98,
                reason: 'Matches your conditioning track.',
              },
            ],
          }),
        } as Response;
      }) as typeof fetch;

      const results = await ApiClient.getRecommendations();
      assert.strictEqual(results.length, 1);

      const item = results[0];
      assert.ok(item.bookHref);
      assert.ok(item.bookHref.startsWith('/member/book-class?'));
      assert.ok(item.bookHref.includes('classId=rec-uuid-999'));
      assert.ok(item.bookHref.includes('className=High%20Intensity%20%26%20Conditioning'));
      assert.ok(item.bookHref.includes('category=HIIT%20%26%20Cardio'));
    });
  });
});
