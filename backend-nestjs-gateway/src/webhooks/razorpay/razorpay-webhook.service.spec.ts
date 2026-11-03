import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import { RazorpayWebhookService } from './razorpay-webhook.service';
import { WebhookIngestDatabaseService } from './webhook-ingest-database.service';

describe('RazorpayWebhookService', () => {
  const TEST_SECRET = 'whsec_test_razorpay_secret_key_32chars_long!';
  let service: RazorpayWebhookService;
  let mockConfigService: any;
  let mockIngestDb: any;

  function signPayload(payload: string | Buffer, secret = TEST_SECRET): string {
    const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    return createHmac('sha256', secret).update(buffer).digest('hex');
  }

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'RAZORPAY_WEBHOOK_SECRET') return TEST_SECRET;
        return undefined;
      }),
    };

    mockIngestDb = {
      recordEvent: jest.fn().mockResolvedValue({
        inserted: true,
        duplicate: false,
        providerEventId: 'evt_123',
      }),
    };

    service = new RazorpayWebhookService(
      mockConfigService as ConfigService,
      mockIngestDb as unknown as WebhookIngestDatabaseService,
    );
  });

  describe('Signature Verification', () => {
    it('accepts valid HMAC signature with Buffer rawBody and persists event', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_sub_charged_001',
        event: 'subscription.charged',
        payload: { subscription: { entity: { id: 'sub_live_001' } } },
      });
      const rawBuffer = Buffer.from(rawPayload, 'utf8');
      const signature = signPayload(rawBuffer);

      mockIngestDb.recordEvent.mockResolvedValueOnce({
        inserted: true,
        duplicate: false,
        providerEventId: 'evt_sub_charged_001',
      });

      const result = await service.processWebhook({
        signature,
        rawBody: rawBuffer,
      });

      expect(result).toEqual({
        success: true,
        duplicate: false,
        event_id: 'evt_sub_charged_001',
      });

      const expectedSha256 = createHash('sha256').update(rawBuffer).digest('hex');
      expect(mockIngestDb.recordEvent).toHaveBeenCalledWith({
        provider: 'razorpay',
        providerEventId: 'evt_sub_charged_001',
        eventType: 'subscription.charged',
        payload: JSON.parse(rawPayload),
        rawBodySha256: expectedSha256,
      });
    });

    it('accepts valid HMAC signature with string rawBody', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_sub_activated_002',
        event: 'subscription.activated',
      });
      const signature = signPayload(rawPayload);

      mockIngestDb.recordEvent.mockResolvedValueOnce({
        inserted: true,
        duplicate: false,
        providerEventId: 'evt_sub_activated_002',
      });

      const result = await service.processWebhook({
        signature,
        rawBody: rawPayload,
      });

      expect(result.success).toBe(true);
      expect(result.event_id).toBe('evt_sub_activated_002');
    });

    it('rejects missing signature header without writing to database', async () => {
      const rawBuffer = Buffer.from(JSON.stringify({ id: 'evt_1', event: 'subscription.charged' }));

      await expect(
        service.processWebhook({ signature: undefined, rawBody: rawBuffer }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.processWebhook({ signature: '', rawBody: rawBuffer }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.processWebhook({ signature: '   ', rawBody: rawBuffer }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects missing or empty rawBody without writing to database', async () => {
      await expect(
        service.processWebhook({ signature: 'any_signature', rawBody: undefined }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.processWebhook({ signature: 'any_signature', rawBody: Buffer.alloc(0) }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.processWebhook({ signature: 'any_signature', rawBody: '' }),
      ).rejects.toThrow(BadRequestException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects invalid or tampered signature without writing to database', async () => {
      const rawBuffer = Buffer.from(JSON.stringify({ id: 'evt_1', event: 'subscription.charged' }));
      const wrongSignature = 'a'.repeat(64);

      await expect(
        service.processWebhook({ signature: wrongSignature, rawBody: rawBuffer }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects signature signed with wrong secret without writing to database', async () => {
      const rawBuffer = Buffer.from(JSON.stringify({ id: 'evt_1', event: 'subscription.charged' }));
      const forgedSignature = signPayload(rawBuffer, 'attacker_secret_key_123456789012');

      await expect(
        service.processWebhook({ signature: forgedSignature, rawBody: rawBuffer }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects when webhook verification secret is not configured in environment', async () => {
      mockConfigService.get.mockReturnValueOnce(undefined);
      const rawBuffer = Buffer.from(JSON.stringify({ id: 'evt_1', event: 'subscription.charged' }));

      await expect(
        service.processWebhook({ signature: 'some_sig', rawBody: rawBuffer }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });
  });

  describe('Payload Parsing and Validation', () => {
    it('rejects malformed JSON payload without writing to database', async () => {
      const malformedRaw = '{"id": "evt_1", "event": "subscription.charged", invalid_json';
      const signature = signPayload(malformedRaw);

      await expect(
        service.processWebhook({ signature, rawBody: malformedRaw }),
      ).rejects.toThrow(BadRequestException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects JSON payload that is not a JSON object (e.g. array)', async () => {
      const arrayRaw = JSON.stringify(['item1', 'item2']);
      const signature = signPayload(arrayRaw);

      await expect(
        service.processWebhook({ signature, rawBody: arrayRaw }),
      ).rejects.toThrow(BadRequestException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects payload missing event identifier', async () => {
      const noIdPayload = JSON.stringify({ event: 'subscription.charged', foo: 'bar' });
      const signature = signPayload(noIdPayload);

      await expect(
        service.processWebhook({ signature, rawBody: noIdPayload }),
      ).rejects.toThrow(BadRequestException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects payload missing event type', async () => {
      const noTypePayload = JSON.stringify({ id: 'evt_no_type_001', foo: 'bar' });
      const signature = signPayload(noTypePayload);

      await expect(
        service.processWebhook({ signature, rawBody: noTypePayload }),
      ).rejects.toThrow(BadRequestException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects event ID exceeding 160 characters', async () => {
      const longIdPayload = JSON.stringify({ id: 'x'.repeat(161), event: 'subscription.charged' });
      const signature = signPayload(longIdPayload);

      await expect(
        service.processWebhook({ signature, rawBody: longIdPayload }),
      ).rejects.toThrow(BadRequestException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });

    it('rejects event type exceeding 80 characters', async () => {
      const longTypePayload = JSON.stringify({ id: 'evt_1', event: 'x'.repeat(81) });
      const signature = signPayload(longTypePayload);

      await expect(
        service.processWebhook({ signature, rawBody: longTypePayload }),
      ).rejects.toThrow(BadRequestException);

      expect(mockIngestDb.recordEvent).not.toHaveBeenCalled();
    });
  });

  describe('Deduplication and Idempotency', () => {
    it('returns success with duplicate=true when event has already been recorded', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_duplicate_001',
        event: 'subscription.halted',
      });
      const signature = signPayload(rawPayload);

      mockIngestDb.recordEvent.mockResolvedValueOnce({
        inserted: false,
        duplicate: true,
        providerEventId: 'evt_duplicate_001',
      });

      const result = await service.processWebhook({
        signature,
        rawBody: rawPayload,
      });

      expect(result).toEqual({
        success: true,
        duplicate: true,
        event_id: 'evt_duplicate_001',
      });
      expect(mockIngestDb.recordEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('Database Failure Handling', () => {
    it('propagates database failure so that Razorpay is notified via non-2xx status to retry', async () => {
      const rawPayload = JSON.stringify({
        id: 'evt_db_fail_001',
        event: 'subscription.charged',
      });
      const signature = signPayload(rawPayload);

      mockIngestDb.recordEvent.mockRejectedValueOnce(new Error('PostgreSQL connection timeout'));

      await expect(
        service.processWebhook({ signature, rawBody: rawPayload }),
      ).rejects.toThrow('PostgreSQL connection timeout');
    });
  });
});
