import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

/**
 * Authenticated encryption for secrets at rest (AES-256-GCM).
 *
 * Stored format is versioned so the key can be rotated without re-encrypting
 * everything at once:
 *   v1.<nonce base64url>.<authTag base64url>.<ciphertext base64url>
 *
 * - A random 96-bit nonce is generated per record.
 * - Decryption accepts a list of keys: the current key first, then any previous
 *   key (`MFA_ENCRYPTION_KEY_PREVIOUS`) so old rows still decrypt during rotation.
 * - Values without the `v1.` prefix are treated as legacy plaintext and returned
 *   unchanged, so the backfill script can upgrade them safely.
 */
const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

function decodeKey(name: string, value: string | undefined): Buffer | undefined {
  if (!value) return undefined;
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`${name} must be a base64-encoded 32-byte (256-bit) key`);
  }
  return key;
}

export class SecretBox {
  private constructor(private readonly keys: Buffer[]) {
    if (keys.length === 0) throw new Error('SecretBox requires at least one key');
  }

  /** Build from `MFA_ENCRYPTION_KEY` (+ optional `MFA_ENCRYPTION_KEY_PREVIOUS`). */
  static fromConfig(config: ConfigService): SecretBox {
    const current = decodeKey('MFA_ENCRYPTION_KEY', config.get<string>('MFA_ENCRYPTION_KEY'));
    if (!current) throw new Error('MFA_ENCRYPTION_KEY is not configured');
    const previous = decodeKey('MFA_ENCRYPTION_KEY_PREVIOUS', config.get<string>('MFA_ENCRYPTION_KEY_PREVIOUS'));
    return new SecretBox(previous ? [current, previous] : [current]);
  }

  /** Explicit keys (current first) — used by tests and key-rotation tooling. */
  static forKeys(...keys: Buffer[]): SecretBox {
    for (const key of keys) {
      if (key.length !== KEY_BYTES) throw new Error('SecretBox keys must be 32 bytes');
    }
    return new SecretBox(keys);
  }

  static isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(`${VERSION}.`);
  }

  encrypt(plaintext: string): string {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.keys[0], nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, nonce.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
  }

  decrypt(stored: string): string {
    if (!SecretBox.isEncrypted(stored)) throw new Error('Secret encryption expected (v1. prefix required)');
    const [version, nonceB64, tagB64, ciphertextB64] = stored.split('.');
    if (version !== VERSION || !nonceB64 || !tagB64 || !ciphertextB64) {
      throw new Error('Malformed encrypted secret');
    }
    const nonce = Buffer.from(nonceB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');
    let lastError: unknown;
    for (const key of this.keys) {
      try {
        const decipher = createDecipheriv(ALGORITHM, key, nonce);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error('Secret decryption failed (wrong key or tampered ciphertext)');
  }
}
