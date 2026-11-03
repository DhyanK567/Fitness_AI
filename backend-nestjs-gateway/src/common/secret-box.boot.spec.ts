import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { SecretBox } from './secret-box';
import { PrismaService } from '../common/prisma.service';

const TENANT_A = '11111111-1111-4111-8111-111111111111';

describe('SecretBox bootstrap validation', () => {
  let prisma: any;
  let config: ConfigService;

  beforeEach(() => {
    prisma = {
      userTotp: { rows: [], create: () => Promise.resolve(), findFirst: () => Promise.resolve() },
      totpRecoveryCode: { rows: [], create: () => Promise.resolve(), findFirst: () => Promise.resolve() },
      $transaction: async (tx: any) => tx,
    } as any;

    config = {
      get: <T>(key: string) => {
        if (key === 'MFA_ENCRYPTION_KEY') return undefined;
        if (key === 'MFA_ENCRYPTION_KEY_PREVIOUS') return undefined;
        return 'test-secret';
      },
    } as unknown as ConfigService;
  });

  it('throws on missing MFA_ENCRYPTION_KEY at bootstrap', () => {
    // SecretBox.fromConfig will throw because key is not configured
    expect(() => SecretBox.fromConfig(config as any)).toThrow(
      'MFA_ENCRYPTION_KEY is not configured'
    );
  });

  it('throws on 31-byte MFA_ENCRYPTION_KEY at bootstrap', () => {
    const config31: ConfigService = {
      get: <T>(key: string) => {
        if (key === 'MFA_ENCRYPTION_KEY') return Buffer.alloc(31).toString('base64');
        if (key === 'MFA_ENCRYPTION_KEY_PREVIOUS') return undefined;
        return 'test-secret';
      },
    } as unknown as ConfigService;
    expect(() => SecretBox.fromConfig(config31 as any)).toThrow(
      'MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte (256-bit) key'
    );
  });
});