/**
 * AI-05 / PUB-05 — Public Enquiry Chat Widget Frontend Contract & Integration Tests
 * Verifies backend API integration, DTO compliance, CAPTCHA verification,
 * session lifecycle & expiry, lead submission with WhatsApp consent,
 * human handoff, error handling, and accessible UI controls.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PublicEnquiryApi,
  PublicEnquiryApiError,
} from '../api/public-enquiry-api';
import {
  PublicEnquirySessionResponse,
  PublicEnquiryMessageResponse,
  PublicEnquiryLeadResponse,
  PublicEnquiryHandoffResponse,
} from '../types/public-enquiry';

describe('AI-05 / PUB-05: Public Enquiry Chat Widget Contract & Integration Suite', () => {
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
  // 1. API Route Normalization and Endpoint Construction
  // =========================================================================
  describe('1. API Route Normalization and Endpoint Construction', () => {
    it('resolves default gateway URL and constructs documented /api/v1/public/ai/enquiry paths', () => {
      delete process.env.NEXT_PUBLIC_API_URL;
      assert.equal(PublicEnquiryApi.getBaseUrl(), 'http://localhost:3001');
      assert.equal(
        PublicEnquiryApi.getEndpoint('/sessions'),
        'http://localhost:3001/api/v1/public/ai/enquiry/sessions',
      );
    });

    it('trims trailing slashes from configured gateway URL', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://api.wellness-studio.com/';
      assert.equal(PublicEnquiryApi.getBaseUrl(), 'https://api.wellness-studio.com');
      assert.equal(
        PublicEnquiryApi.getEndpoint('/sessions/sess_123/messages'),
        'https://api.wellness-studio.com/api/v1/public/ai/enquiry/sessions/sess_123/messages',
      );
      assert.equal(
        PublicEnquiryApi.getEndpoint('/sessions/sess_123/lead'),
        'https://api.wellness-studio.com/api/v1/public/ai/enquiry/sessions/sess_123/lead',
      );
      assert.equal(
        PublicEnquiryApi.getEndpoint('/sessions/sess_123/handoff'),
        'https://api.wellness-studio.com/api/v1/public/ai/enquiry/sessions/sess_123/handoff',
      );
    });

    it('avoids duplicating /api/v1 prefix if already supplied', () => {
      process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3001/api/v1/';
      assert.equal(PublicEnquiryApi.getBaseUrl(), 'http://localhost:3001');
      assert.equal(
        PublicEnquiryApi.getEndpoint('/api/v1/public/ai/enquiry/sessions'),
        'http://localhost:3001/api/v1/public/ai/enquiry/sessions',
      );
    });
  });

  // =========================================================================
  // 2. Session Initiation Contract (POST /api/v1/public/ai/enquiry/sessions)
  // =========================================================================
  describe('2. Session Initiation Contract (POST /api/v1/public/ai/enquiry/sessions)', () => {
    it('initiates session with captcha_token and returns 201 with session_id and greeting', async () => {
      const mockSession: PublicEnquirySessionResponse = {
        session_id: 'session-uuid-pub-001',
        greeting: 'Hello! Welcome to our wellness studio. How can I assist you?',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };

      let requestedUrl = '';
      let requestMethod = '';
      let requestHeaders: any = {};
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestMethod = init.method;
        requestHeaders = init.headers;
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => mockSession,
        } as Response;
      };

      const result = await PublicEnquiryApi.createSession({
        captcha_token: 'cf_turnstile_mock_token_123',
        page_context: '/schedule',
      });

      assert.equal(requestedUrl, 'http://localhost:3001/api/v1/public/ai/enquiry/sessions');
      assert.equal(requestMethod, 'POST');
      assert.equal(requestHeaders['Content-Type'], 'application/json');
      assert.equal(sentBody.captcha_token, 'cf_turnstile_mock_token_123');
      assert.equal(sentBody.page_context, '/schedule');
      assert.equal(result.session_id, 'session-uuid-pub-001');
      assert.ok(result.greeting.includes('Welcome'));
      assert.ok(result.expires_at);
    });

    it('throws PublicEnquiryApiError with CAPTCHA_FAILED on HTTP 403', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 403,
          json: async () => ({
            error: { code: 'CAPTCHA_FAILED', message: 'CAPTCHA validation failed' },
          }),
        } as Response;
      };

      await assert.rejects(
        async () => {
          await PublicEnquiryApi.createSession({ captcha_token: 'invalid_captcha' });
        },
        (err: PublicEnquiryApiError) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'CAPTCHA_FAILED');
          assert.ok(err.message.includes('CAPTCHA validation failed'));
          return true;
        },
      );
    });

    it('throws PublicEnquiryApiError with AI_RATE_LIMITED on HTTP 429', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            error: {
              code: 'AI_RATE_LIMITED',
              message: 'Session creation limit exceeded (maximum 5 sessions per hour per IP)',
            },
          }),
        } as Response;
      };

      await assert.rejects(
        async () => {
          await PublicEnquiryApi.createSession({ captcha_token: 'valid_token' });
        },
        (err: PublicEnquiryApiError) => {
          assert.equal(err.status, 429);
          assert.equal(err.code, 'AI_RATE_LIMITED');
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 3. Message Submission Contract (POST /api/v1/public/ai/enquiry/sessions/:id/messages)
  // =========================================================================
  describe('3. Message Submission Contract (POST /api/v1/public/ai/enquiry/sessions/:id/messages)', () => {
    it('submits message and receives grounded answer with source references', async () => {
      const mockResponse: PublicEnquiryMessageResponse = {
        response: 'We offer Ashtanga Yoga on Tuesdays at 7:00 AM and Vinyasa on Thursdays.',
        source_refs: ['classes', 'faq'],
        lead_capture_prompt: false,
        tool_calls: [{ id: 'tc-1', name: 'getPublicClassSchedule', arguments: {} }],
      };

      let requestedUrl = '';
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => mockResponse,
        } as Response;
      };

      const result = await PublicEnquiryApi.postMessage('sess_999', {
        message: 'What yoga classes are on offer?',
      });

      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/public/ai/enquiry/sessions/sess_999/messages',
      );
      assert.equal(sentBody.message, 'What yoga classes are on offer?');
      assert.ok(result.response.includes('Ashtanga Yoga'));
      assert.equal(result.source_refs.length, 2);
      assert.ok(result.source_refs.includes('classes'));
      assert.ok(result.source_refs.includes('faq'));
      assert.equal(result.lead_capture_prompt, false);
    });

    it('sets lead_capture_prompt = true when visitor expresses joining interest', async () => {
      const mockResponse: PublicEnquiryMessageResponse = {
        response: 'Our Unlimited Monthly Membership is ₹3,000/month. Would you like to leave your details for a complimentary trial pass?',
        source_refs: ['plans'],
        lead_capture_prompt: true,
      };

      global.fetch = async () => {
        return {
          ok: true,
          status: 200,
          json: async () => mockResponse,
        } as Response;
      };

      const result = await PublicEnquiryApi.postMessage('sess_999', {
        message: 'I want to join. How much is membership?',
      });

      assert.equal(result.lead_capture_prompt, true);
      assert.ok(result.source_refs.includes('plans'));
    });

    it('throws PublicEnquiryApiError with SESSION_EXPIRED on HTTP 410 Gone', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 410,
          json: async () => ({
            error: {
              code: 'SESSION_EXPIRED',
              message: 'Enquiry session has expired. Please initiate a new session.',
            },
          }),
        } as Response;
      };

      await assert.rejects(
        async () => {
          await PublicEnquiryApi.postMessage('expired_sess', { message: 'Hello?' });
        },
        (err: PublicEnquiryApiError) => {
          assert.equal(err.status, 410);
          assert.equal(err.code, 'SESSION_EXPIRED');
          return true;
        },
      );
    });

    it('throws PublicEnquiryApiError with AI_UNAVAILABLE on HTTP 503 Service Unavailable', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            error: {
              code: 'AI_UNAVAILABLE',
              message: 'Assistant temporarily unavailable. Please submit an enquiry form.',
            },
          }),
        } as Response;
      };

      await assert.rejects(
        async () => {
          await PublicEnquiryApi.postMessage('sess_503', { message: 'Can I get help?' });
        },
        (err: PublicEnquiryApiError) => {
          assert.equal(err.status, 503);
          assert.equal(err.code, 'AI_UNAVAILABLE');
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 4. Lead Submission Contract (POST /api/v1/public/ai/enquiry/sessions/:id/lead)
  // =========================================================================
  describe('4. Lead Submission Contract (POST /api/v1/public/ai/enquiry/sessions/:id/lead)', () => {
    it('submits prospective lead with explicit WhatsApp consent and receives 201 Created', async () => {
      const mockLeadResponse: PublicEnquiryLeadResponse = {
        lead_id: 'crm-lead-uuid-777',
        message: 'Lead registered successfully',
        duplicate_flag: false,
      };

      let requestedUrl = '';
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => mockLeadResponse,
        } as Response;
      };

      const result = await PublicEnquiryApi.submitLead('sess_lead_01', {
        name: 'Aarav Patel',
        phone: '+919876543210',
        email: 'aarav@example.com',
        interest: 'Trial Class Pass',
        consent: {
          whatsapp: true,
        },
      });

      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/public/ai/enquiry/sessions/sess_lead_01/lead',
      );
      assert.equal(sentBody.name, 'Aarav Patel');
      assert.equal(sentBody.phone, '+919876543210');
      assert.equal(sentBody.consent.whatsapp, true);
      assert.equal(result.lead_id, 'crm-lead-uuid-777');
      assert.equal(result.message, 'Lead registered successfully');
    });

    it('handles duplicate lead response with duplicate_flag = true without throwing error', async () => {
      const mockLeadResponse: PublicEnquiryLeadResponse = {
        lead_id: 'crm-lead-existing-001',
        message: 'Lead already on file; follow-up recorded',
        duplicate_flag: true,
      };

      global.fetch = async () => {
        return {
          ok: true,
          status: 201,
          json: async () => mockLeadResponse,
        } as Response;
      };

      const result = await PublicEnquiryApi.submitLead('sess_dup', {
        name: 'Existing Member',
        phone: '+919876543210',
        interest: 'Studio Membership',
        consent: { whatsapp: true },
      });

      assert.equal(result.duplicate_flag, true);
      assert.equal(result.lead_id, 'crm-lead-existing-001');
    });

    it('throws PublicEnquiryApiError with CONSENT_REQUIRED on HTTP 422 if WhatsApp consent was not granted', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            error: {
              code: 'CONSENT_REQUIRED',
              message: 'Explicit consent for WhatsApp communication is required',
            },
          }),
        } as Response;
      };

      await assert.rejects(
        async () => {
          await PublicEnquiryApi.submitLead('sess_consent_fail', {
            name: 'No Consent',
            phone: '+919876543210',
            interest: 'Yoga',
            consent: { whatsapp: false },
          });
        },
        (err: PublicEnquiryApiError) => {
          assert.equal(err.status, 422);
          assert.equal(err.code, 'CONSENT_REQUIRED');
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 5. Human Handoff Contract (POST /api/v1/public/ai/enquiry/sessions/:id/handoff)
  // =========================================================================
  describe('5. Human Handoff Contract (POST /api/v1/public/ai/enquiry/sessions/:id/handoff)', () => {
    it('requests human handoff and receives 202 Accepted with handoff_id', async () => {
      const mockHandoffResponse: PublicEnquiryHandoffResponse = {
        handoff_id: 'handoff-uuid-888',
        message: 'Your enquiry has been escalated to studio concierge',
      };

      let requestedUrl = '';
      let sentBody: any = null;

      global.fetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        sentBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 202,
          json: async () => mockHandoffResponse,
        } as Response;
      };

      const result = await PublicEnquiryApi.requestHandoff('sess_handoff_01', {
        reason: 'Complex corporate membership query',
        contact: '+919123456789',
      });

      assert.equal(
        requestedUrl,
        'http://localhost:3001/api/v1/public/ai/enquiry/sessions/sess_handoff_01/handoff',
      );
      assert.equal(sentBody.reason, 'Complex corporate membership query');
      assert.equal(sentBody.contact, '+919123456789');
      assert.equal(result.handoff_id, 'handoff-uuid-888');
    });

    it('enforces 3 handoffs per session limit returning HTTP 429', async () => {
      global.fetch = async () => {
        return {
          ok: false,
          status: 429,
          json: async () => ({
            error: {
              code: 'AI_RATE_LIMITED',
              message: 'Handoff request limit reached for this session (maximum 3 requests)',
            },
          }),
        } as Response;
      };

      await assert.rejects(
        async () => {
          await PublicEnquiryApi.requestHandoff('sess_too_many_handoffs', { reason: '4th handoff' });
        },
        (err: PublicEnquiryApiError) => {
          assert.equal(err.status, 429);
          assert.equal(err.code, 'AI_RATE_LIMITED');
          return true;
        },
      );
    });
  });

  // =========================================================================
  // 6. UI Component Code and Layout Verification
  // =========================================================================
  describe('6. UI Component Code and Layout Verification', () => {
    it('verifies (public)/layout.tsx embeds PublicEnquiryChatWidget', () => {
      const layoutPath = path.resolve(__dirname, '../../../app/(public)/layout.tsx');
      assert.ok(fs.existsSync(layoutPath), 'Public layout must exist');
      const content = fs.readFileSync(layoutPath, 'utf-8');
      assert.ok(content.includes('PublicEnquiryChatWidget'), 'Public layout must import and embed PublicEnquiryChatWidget');
    });

    it('verifies PublicEnquiryChatWidget includes all documented accessibility and test IDs', () => {
      const widgetPath = path.resolve(__dirname, '../components/PublicEnquiryChatWidget.tsx');
      assert.ok(fs.existsSync(widgetPath), 'Widget component file must exist');
      const code = fs.readFileSync(widgetPath, 'utf-8');

      // Verify trigger and modal test IDs
      assert.ok(code.includes('id="public-enquiry-widget-trigger"'), 'Must have widget trigger ID');
      assert.ok(code.includes('id="public-enquiry-chat-window"'), 'Must have chat window ID');
      assert.ok(code.includes('id="public-enquiry-messages"'), 'Must have messages container ID');
      assert.ok(code.includes('id="public-enquiry-input"'), 'Must have input field ID');
      assert.ok(code.includes('id="public-enquiry-send"'), 'Must have send button ID');
      assert.ok(code.includes('id="public-enquiry-close-button"'), 'Must have close button ID');

      // Verify in-chat lead form IDs
      assert.ok(code.includes('id="public-enquiry-lead-name"'), 'Must have lead name input ID');
      assert.ok(code.includes('id="public-enquiry-lead-phone"'), 'Must have lead phone input ID');
      assert.ok(code.includes('id="public-enquiry-lead-email"'), 'Must have lead email input ID');
      assert.ok(code.includes('id="public-enquiry-lead-interest"'), 'Must have lead interest select ID');
      assert.ok(code.includes('id="public-enquiry-lead-whatsapp-consent"'), 'Must have WhatsApp consent checkbox ID');
      assert.ok(code.includes('id="public-enquiry-lead-submit"'), 'Must have lead submit button ID');

      // Verify human handoff IDs
      assert.ok(code.includes('id="public-enquiry-handoff-button"'), 'Must have handoff button ID');
      assert.ok(code.includes('id="public-enquiry-handoff-modal"'), 'Must have handoff modal ID');

      // Verify accessibility attributes
      assert.ok(code.includes('role="dialog"'), 'Must specify role="dialog"');
      assert.ok(code.includes('aria-label='), 'Must specify aria-label');
      assert.ok(code.includes('aria-expanded='), 'Must specify aria-expanded');
    });

    it('verifies features/ai/index.ts exports PublicEnquiryChatWidget and types', () => {
      const indexPath = path.resolve(__dirname, '../index.ts');
      const content = fs.readFileSync(indexPath, 'utf-8');
      assert.ok(content.includes("export * from './components/PublicEnquiryChatWidget'"));
      assert.ok(content.includes("export * from './api/public-enquiry-api'"));
      assert.ok(content.includes("export * from './types/public-enquiry'"));
    });
  });
});
