import { createHmac } from 'node:crypto';
import { verifyHmacSignature } from './signature';

describe('verifyHmacSignature', () => {
  it('accepts a valid ERP callback signature', () => {
    const body = '{"event":"membership.expired"}';
    const signature = createHmac('sha256', 'secret').update(body).digest('hex');
    expect(verifyHmacSignature(body, `sha256=${signature}`, 'secret')).toBe(true);
  });

  it('rejects altered payloads and malformed signatures', () => {
    expect(verifyHmacSignature('{"event":"membership.expired"}', 'bad', 'secret')).toBe(false);
    expect(verifyHmacSignature('{"event":"membership.expired"}', '', 'secret')).toBe(false);
    expect(verifyHmacSignature('', 'sha256=123', 'secret')).toBe(false);
    expect(verifyHmacSignature('{"event":"test"}', '123', '')).toBe(false);
  });

  it('accepts raw Buffer payload with Razorpay raw hex signature', () => {
    const rawBuffer = Buffer.from('{"event":"subscription.activated","id":"evt_123"}', 'utf8');
    const signature = createHmac('sha256', 'test_secret_key_1234567890123456').update(rawBuffer).digest('hex');
    expect(verifyHmacSignature(rawBuffer, signature, 'test_secret_key_1234567890123456')).toBe(true);
  });

  it('rejects empty or modified Buffer payload', () => {
    const validBuffer = Buffer.from('{"event":"subscription.activated"}', 'utf8');
    const signature = createHmac('sha256', 'secret').update(validBuffer).digest('hex');

    expect(verifyHmacSignature(Buffer.alloc(0), signature, 'secret')).toBe(false);
    expect(verifyHmacSignature(Buffer.from('{"event":"tampered"}'), signature, 'secret')).toBe(false);
  });
});
