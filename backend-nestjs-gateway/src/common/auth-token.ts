import * as argon2 from '@node-rs/argon2';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

function base64(value: string) { return Buffer.from(value).toString('base64url'); }

/** Deterministic SHA-256 hex digest used to store opaque tokens at rest. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cryptographically-random opaque token (refresh / invite / reset). */
export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { algorithm: argon2.Algorithm.Argon2id });
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof encoded !== 'string') return false;
  if (encoded.startsWith('$argon2id$')) {
    try {
      return await argon2.verify(encoded, password);
    } catch {
      return false;
    }
  }

  // Existing accounts were stored as scrypt$<hex salt>$<hex digest>.
  // Continue verifying them so a successful login can migrate them in place.
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{64})$/i.exec(encoded);
  if (!match) return false;
  const [, salt, expectedHex] = match;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function needsPasswordHashUpgrade(encoded: string): boolean {
  return encoded.startsWith('scrypt$');
}

export function signAccessToken(payload: Record<string, unknown>, secret: string, ttlSeconds = 3600): string {
  const header = base64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const unsigned = `${header}.${body}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export type AccessTokenClaims = {
  sub: string;
  tenant: string;
  roles: string[];
  sid?: string;
  purpose?: string;
  iat: number;
  exp: number;
  /** Unified token format: primary role, user type and tenant id. */
  role?: string;
  userType?: 'staff' | 'member' | 'platform';
  userId?: string;
  tenantId?: string;
  /** Set to 'mfa_enroll' for the forced-MFA enrollment token. */
  scope?: string;
};

export type PurposeTokenClaims = { sub: string; tenant: string; purpose: string; fingerprint?: string; iat: number; exp: number };

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function signPurposeToken(payload: Omit<PurposeTokenClaims, 'iat' | 'exp'>, secret: string, ttlSeconds: number): string {
  if (ttlSeconds < 1 || ttlSeconds > 72 * 60 * 60) throw new Error('Invalid purpose-token lifetime');
  return signAccessToken(payload, secret, ttlSeconds);
}

export function verifyPurposeToken(token: string, secret: string, purpose: string): PurposeTokenClaims | undefined {
  const parsed = verifyToken(token, secret, 72 * 60 * 60) as PurposeTokenClaims | undefined;
  return parsed?.purpose === purpose ? parsed : undefined;
}

export function verifyAccessToken(token: string, secret: string): AccessTokenClaims | undefined {
  const parsed = verifyToken(token, secret, 3600) as AccessTokenClaims | undefined;
  if (!parsed || typeof parsed.sid !== 'string' || !parsed.sid || !Array.isArray(parsed.roles) || parsed.roles.some((role) => typeof role !== 'string')) return undefined;
  return parsed;
}

/** Verifies a short-lived MFA enrollment token (scope: 'mfa_enroll') issued during login when MFA enrollment is required. */
export function verifyEnrollmentToken(token: string, secret: string): AccessTokenClaims | undefined {
  const parsed = verifyToken(token, secret, 600) as AccessTokenClaims | undefined;
  if (!parsed || parsed.scope !== 'mfa_enroll' || !Array.isArray(parsed.roles) || parsed.roles.some((role) => typeof role !== 'string')) return undefined;
  return parsed;
}

function verifyToken(token: string, secret: string, maxTtlSeconds: number): Record<string, any> | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const [header, body, signature] = parts;
  if (!header || !body || !signature) return undefined;
  try {
    const protectedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: unknown; typ?: unknown };
    if (protectedHeader.alg !== 'HS256' || protectedHeader.typ !== 'JWT') return undefined;
  } catch {
    return undefined;
  }
  const unsigned = `${header}.${body}`;
  const expected = createHmac('sha256', secret).update(unsigned).digest('base64url');
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, any>;
    const now = Math.floor(Date.now() / 1000);
    if (!parsed.sub || !parsed.tenant || !Number.isInteger(parsed.iat) || !Number.isInteger(parsed.exp) || parsed.iat > now + 60 || parsed.exp <= now || parsed.exp - parsed.iat > maxTtlSeconds) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}
