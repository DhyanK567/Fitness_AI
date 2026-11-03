import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHmacSignature(payload: string | Buffer, signature: string, secret: string): boolean {
  if (!payload || !signature || !secret) return false;
  const hmac = createHmac('sha256', secret);
  if (Buffer.isBuffer(payload)) {
    if (payload.length === 0) return false;
    hmac.update(payload);
  } else {
    if (typeof payload !== 'string' || payload.length === 0) return false;
    hmac.update(payload, 'utf8');
  }
  const expected = hmac.digest('hex');
  const supplied = signature.replace(/^sha256=/, '').trim().toLowerCase();
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
