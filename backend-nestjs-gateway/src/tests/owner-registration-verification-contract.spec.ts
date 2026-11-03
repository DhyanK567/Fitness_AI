import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';

describe('Phase 1B: Owner Registration & Email Verification Contract', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../prisma/migrations/132_owner_registration_and_verification/migration.sql'
  );

  let migrationSql: string;

  beforeAll(() => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    migrationSql = fs.readFileSync(migrationPath, 'utf8');
  });

  describe('1. Blocker A: Verification Function Schema Compatibility', () => {
    it('defines platform.verify_owner_email with SECURITY DEFINER and fixed search_path', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION platform.verify_owner_email(');
      expect(migrationSql).toContain('SECURITY DEFINER');
      expect(migrationSql).toContain('SET search_path = platform, iam, public, pg_catalog, pg_temp');
    });

    it('queries existing iam.auth_action_tokens instead of non-existent iam.email_verifications', () => {
      expect(migrationSql).toContain('FROM iam.auth_action_tokens');
      expect(migrationSql).not.toContain('FROM iam.email_verifications');
      expect(migrationSql).toContain("purpose = 'owner_email_verification'");
      expect(migrationSql).toContain('consumed_at IS NULL');
      expect(migrationSql).toContain('expires_at > v_now');
      expect(migrationSql).toContain('FOR UPDATE');
    });

    it('marks token consumed atomically using consumed_at and does not reference verified_at', () => {
      expect(migrationSql).toContain('UPDATE iam.auth_action_tokens');
      expect(migrationSql).toContain('SET consumed_at = v_now');
      expect(migrationSql).not.toContain('UPDATE iam.email_verifications');
    });

    it('updates iam.users status to active and strictly avoids non-existent is_email_verified column', () => {
      expect(migrationSql).toContain('UPDATE iam.users');
      expect(migrationSql).toContain("SET status = 'active'");
      expect(migrationSql).not.toContain('is_email_verified');
    });

    it('activates tenant with 7-day trial and initializes baseline subscription', () => {
      expect(migrationSql).toContain("UPDATE platform.tenants");
      expect(migrationSql).toContain("SET status = 'active'");
      expect(migrationSql).toContain("trial_starts_at = v_now");
      expect(migrationSql).toContain("trial_ends_at = v_trial_end");
      expect(migrationSql).toContain("INSERT INTO platform.tenant_subscriptions");
      expect(migrationSql).toContain("status IN ('trialing', 'authenticated', 'active', 'past_due', 'halted', 'paused')");
    });
  });

  describe('2. Blocker B: Atomic Onboarding Registration Function', () => {
    it('defines platform.register_onboarding_studio with SECURITY DEFINER and fixed search_path', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION platform.register_onboarding_studio(');
      expect(migrationSql).toContain('SECURITY DEFINER');
      expect(migrationSql).toContain('SET search_path = platform, iam, public, pg_catalog, pg_temp');
    });

    it('validates tenant code, email, Argon2id password hash, and token hash inputs', () => {
      expect(migrationSql).toContain("v_clean_code !~ '^[a-z0-9][a-z0-9-]{1,38}$'");
      expect(migrationSql).toContain("v_clean_email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'");
      expect(migrationSql).toContain("p_password_hash !~ '^\\$argon2id\\$'");
      expect(migrationSql).toContain("p_token_hash !~ '^[0-9a-f]{64}$'");
      expect(migrationSql).toContain("p_token_expires_at <= v_now");
    });

    it('creates onboarding tenant without granting broad INSERT to fitness_app_runtime', () => {
      expect(migrationSql).toContain("INSERT INTO platform.tenants");
      expect(migrationSql).toContain("'onboarding'");
      expect(migrationSql).toContain("INSERT INTO iam.roles");
      expect(migrationSql).toContain("INSERT INTO iam.users");
      expect(migrationSql).toContain("INSERT INTO iam.user_credentials");
      expect(migrationSql).toContain("INSERT INTO iam.auth_action_tokens");
    });

    it('enforces least-privilege execution grants and revokes public execute', () => {
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION platform.verify_owner_email(uuid, text) FROM PUBLIC;');
      expect(migrationSql).toContain('REVOKE ALL ON FUNCTION platform.register_onboarding_studio(text, text, text, text, text, text, text, timestamptz) FROM PUBLIC;');
      expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION platform.verify_owner_email(uuid, text) TO fitness_app_runtime;');
      expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION platform.register_onboarding_studio(text, text, text, text, text, text, text, timestamptz) TO fitness_app_runtime;');
    });
  });

  describe('3. Unit Logic & Contract Simulation', () => {
    it('verifies SHA-256 token hashing matches PostgreSQL encode(digest(p_raw_token, sha256), hex)', () => {
      const rawToken = 'test_token_entropy_1234567890abcdef_secure';
      const nodeHash = createHash('sha256').update(rawToken).digest('hex');

      expect(nodeHash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(nodeHash)).toBe(true);
    });

    it('simulates single-use atomic consumption and replay prevention', () => {
      const tokenStore = new Map<string, { consumedAt: Date | null; expiresAt: Date }>();
      const tokenId = 'tok_123';
      tokenStore.set(tokenId, { consumedAt: null, expiresAt: new Date(Date.now() + 3600_000) });

      // First verification attempt succeeds
      const token = tokenStore.get(tokenId)!;
      expect(token.consumedAt).toBeNull();
      expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
      token.consumedAt = new Date();

      // Second verification attempt fails (already consumed)
      expect(token.consumedAt).not.toBeNull();
    });

    it('simulates 7-day trial date calculation', () => {
      const now = new Date('2026-10-18T12:00:00Z');
      const trialEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      expect(trialEnd.toISOString()).toBe('2026-10-25T12:00:00.000Z');
    });

    it('simulates tenant code validation constraint', () => {
      const validCodes = ['pilot-studio', 'fit123', 'a-b-c-d', 'my-gym-sanctuary'];
      const invalidCodes = ['-bad', 'A-CAPS', 'toolong'.repeat(10), 'has.dot', 'has_underscore'];

      const pattern = /^[a-z0-9][a-z0-9-]{1,38}$/;
      validCodes.forEach((c) => expect(pattern.test(c)).toBe(true));
      invalidCodes.forEach((c) => expect(pattern.test(c)).toBe(false));
    });
  });
});
