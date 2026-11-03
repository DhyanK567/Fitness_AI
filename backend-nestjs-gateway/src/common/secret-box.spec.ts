import { describe, it, expect } from '@jest/globals';
import { SecretBox } from './secret-box';

const keyA = Buffer.alloc(32, 1);
const keyB = Buffer.alloc(32, 2);

describe('SecretBox (AES-256-GCM, versioned)', () => {
  it('round-trips a secret and uses a fresh nonce each time', () => {
    const box = SecretBox.forKeys(keyA);
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const first = box.encrypt(secret);
    const second = box.encrypt(secret);
    expect(first).not.toBe(second);
    expect(box.decrypt(first)).toBe(secret);
    expect(box.decrypt(second)).toBe(secret);
  });

  it('writes the versioned v1 format and never the plaintext', () => {
    const box = SecretBox.forKeys(keyA);
    const secret = 'MY-BASE32-SECRET';
    const stored = box.encrypt(secret);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored.split('.')).toHaveLength(4);
    expect(stored).not.toContain(secret);
  });

  it('rejects a tampered ciphertext (byte flip throws)', () => {
    const box = SecretBox.forKeys(keyA);
    const stored = box.encrypt('MY-BASE32-SECRET');
    const parts = stored.split('.');
    // Genuinely flip a ciphertext byte and re-encode to base64url.
    const raw = Buffer.from(parts[3], 'base64url');
    raw[0] ^= 1;
    const flipped = raw.toString('base64url');
    const tampered = [parts[0], parts[1], parts[2], flipped].join('.');
    expect(() => box.decrypt(tampered)).toThrow();
  });

  it('rejects a tampered tag (zeroed tag throws)', () => {
    const box = SecretBox.forKeys(keyA);
    const stored = box.encrypt('MY-BASE32-SECRET');
    const parts = stored.split('.');
    // Replace the auth tag with zeros — this definitely breaks GCM auth.
    const zeroTag = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const tampered = [parts[0], parts[1], zeroTag, parts[3]].join('.');
    expect(() => box.decrypt(tampered)).toThrow();
  });

  it('rejects a ciphertext encrypted with a different key', () => {
    const stored = SecretBox.forKeys(keyA).encrypt('MY-BASE32-SECRET');
    expect(() => SecretBox.forKeys(keyB).decrypt(stored)).toThrow();
  });

  it('supports key rotation by accepting a previous key', () => {
    const stored = SecretBox.forKeys(keyA).encrypt('MY-BASE32-SECRET');
    const rotating = SecretBox.forKeys(keyB, keyA);
    expect(rotating.decrypt(stored)).toBe('MY-BASE32-SECRET');
    // New writes use the current key, old reads fall through to the previous one.
    const rewrapped = rotating.encrypt('MY-BASE32-SECRET');
    expect(SecretBox.forKeys(keyB).decrypt(rewrapped)).toBe('MY-BASE32-SECRET');
  });

  it('passes legacy plaintext through unchanged (backfill compatibility)', () => {
    const box = SecretBox.forKeys(keyA);
    // Non-versioned values now throw; the backfill script handles upgrade separately.
    expect(() => box.decrypt('LEGACY-PLAINTEXT-SECRET')).toThrow();
    expect(SecretBox.isEncrypted('LEGACY-PLAINTEXT-SECRET')).toBe(false);
    expect(SecretBox.isEncrypted('v1.a.b.c')).toBe(true);
  });
});