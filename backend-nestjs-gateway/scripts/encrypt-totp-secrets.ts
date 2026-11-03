/**
 * One-off backfill: encrypt any legacy plaintext TOTP secrets at rest.
 *
 * Usage:
 *   MFA_ENCRYPTION_KEY=<base64 32-byte key> \
 *     pnpm --filter @fitness-ai/backend-nestjs-gateway exec ts-node scripts/encrypt-totp-secrets.ts
 *
 * Idempotent: rows already in the `v1.` envelope are skipped.
 * Run as a DB user that owns/can read iam.user_totp (RLS FORCE would otherwise
 * hide rows when app.tenant_id is unset).
 */
import { PrismaClient } from '@prisma/client';
import { SecretBox } from '../src/common/secret-box';

async function main(): Promise<void> {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key) throw new Error('MFA_ENCRYPTION_KEY is required');
  const box = SecretBox.forKeys(Buffer.from(key, 'base64'));
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.$queryRaw<{ id: string; secret: string }[]>`
      SELECT id, secret FROM iam.user_totp
    `;
    let updated = 0;
    for (const row of rows) {
      if (SecretBox.isEncrypted(row.secret)) continue;
      const encrypted = box.encrypt(row.secret);
      await prisma.$executeRaw`
        UPDATE iam.user_totp SET secret = ${encrypted}, updated_at = NOW() WHERE id = ${row.id}
      `;
      updated += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`TOTP backfill complete: ${updated} encrypted, ${rows.length - updated} already encrypted`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
