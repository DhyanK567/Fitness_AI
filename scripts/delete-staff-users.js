const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://wellness_user:WellnessDB@2026@129.225.123.163:5432/wellness_studio' },
  },
});

async function main() {
  try {
    let r;
    r = await prisma.$executeRawUnsafe('DELETE FROM iam.auth_sessions');
    console.log('Deleted auth_sessions:', r);
    r = await prisma.$executeRawUnsafe('DELETE FROM iam.auth_action_tokens');
    console.log('Deleted auth_action_tokens:', r);
    r = await prisma.$executeRawUnsafe('DELETE FROM iam.totp_recovery_codes');
    console.log('Deleted totp_recovery_codes:', r);
    r = await prisma.$executeRawUnsafe('DELETE FROM iam.user_totp');
    console.log('Deleted user_totp:', r);
    r = await prisma.$executeRawUnsafe('DELETE FROM iam.user_role_assignments');
    console.log('Deleted user_role_assignments:', r);
    r = await prisma.$executeRawUnsafe('DELETE FROM iam.user_credentials');
    console.log('Deleted user_credentials:', r);
    r = await prisma.$executeRawUnsafe("DELETE FROM iam.users WHERE user_type = 'staff'");
    console.log('Deleted staff users:', r);
    console.log('\nAll done! Database cleared of staff users and sessions.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
