import { normalizeStudioRole, type StudioRole } from './studio-auth';

type VerifiedSession = { role: StudioRole; roles: string[]; subject: string; tenantId: string; sessionId: string };

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}

function decodeJson(value: string): Record<string, unknown> | null {
  try { return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as Record<string, unknown>; }
  catch { return null; }
}

/** Verify the gateway-issued HS256 JWT in the Edge runtime before trusting role claims. */
export async function verifyStaffSessionJwt(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<VerifiedSession | null> {
  const [headerPart, payloadPart, signaturePart, extra] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart || extra || !secret) return null;
  const header = decodeJson(headerPart);
  if (header?.alg !== 'HS256' || header.typ !== 'JWT') return null;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, asArrayBuffer(decodeBase64Url(signaturePart)), new TextEncoder().encode(`${headerPart}.${payloadPart}`));
    if (!valid) return null;
  } catch { return null; }
  const claims = decodeJson(payloadPart);
  if (!claims || typeof claims.sub !== 'string' || typeof claims.tenant !== 'string' || typeof claims.sid !== 'string') return null;
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) return null;
  const issuedAt = claims.iat as number;
  const expiresAt = claims.exp as number;
  if (issuedAt > nowSeconds + 60 || expiresAt <= nowSeconds || expiresAt - issuedAt > 3600) return null;
  if (!Array.isArray(claims.roles) || claims.roles.some((role) => typeof role !== 'string')) return null;
  const role = normalizeStudioRole(typeof claims.role === 'string' ? claims.role : claims.roles[0] as string | undefined);
  if (!role) return null;
  return { role, roles: claims.roles as string[], subject: claims.sub, tenantId: claims.tenant, sessionId: claims.sid };
}
