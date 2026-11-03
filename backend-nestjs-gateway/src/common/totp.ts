import { createHmac, randomBytes } from 'node:crypto';
import { hashToken } from './auth-token';

/**
 * Minimal RFC 6238 TOTP (SHA-1, 6 digits, 30s step) and RFC 4648 base32.
 * Implemented in-house to avoid adding an external dependency for a single,
 * well-specified algorithm.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(secret: string): Buffer {
  const normalized = secret.replace(/=+$/g, '').toUpperCase().replace(/\s|-/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a new base32 TOTP secret (default 160-bit / 32 chars). */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function totpCode(secret: string, atMillis: number = Date.now(), stepSeconds = DEFAULT_STEP_SECONDS, digits = DEFAULT_DIGITS): string {
  const counter = Math.floor(atMillis / 1000 / stepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** Verify a submitted code, accepting the adjacent time steps to tolerate clock skew. */
export function verifyTotp(
  secret: string,
  code: string,
  options: { atMillis?: number; window?: number; stepSeconds?: number; digits?: number } = {},
): boolean {
  const { atMillis = Date.now(), window = 2, stepSeconds = DEFAULT_STEP_SECONDS, digits = DEFAULT_DIGITS } = options;
  const candidate = (code ?? '').replace(/\s/g, '');
  if (!/^\d+$/.test(candidate)) return false;
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = totpCode(secret, atMillis + drift * stepSeconds * 1000, stepSeconds, digits);
    if (expected.length === candidate.length && expected === candidate) return true;
  }
  return false;
}

export function buildOtpAuthUrl(issuer: string, accountName: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Normalise a recovery code for comparison (strip separators, uppercase). */
export function normalizeRecoveryCode(code: string): string {
  return (code ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Generate human-friendly single-use recovery codes plus their stored hashes. */
export function generateRecoveryCodes(count = 10): { plain: string[]; hashes: string[] } {
  const plain: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = randomBytes(10).toString('hex').toUpperCase().slice(0, 10);
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { plain, hashes: plain.map((code) => hashToken(normalizeRecoveryCode(code))) };
}
