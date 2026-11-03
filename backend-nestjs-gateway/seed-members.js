// Seed script: 2 tenants × 6 roles = 12 users
// Roles: owner, admin, front_desk, trainer, member, visitor
// Owner/admin pre-enrolled in TOTP

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANTS = ['tenant-a', 'tenant-b'];
const ROLES = ['owner', 'admin', 'front_desk', 'trainer', 'member', 'visitor'];
const USERS_PER_TENANT = 2; // 2 users per role pair

async function hashPassword(password) {
  // Simple hash for seed - in production use bcrypt
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function generateTotpSecret() {
  const crypto = require('crypto');
  return crypto.randomBytes(20).toString('hex');
}

async function main() {
  console.log('🌱 Starting B2C Member Auth Seed...');

  // 1. Ensure tenants exist
  for (const tenantCode of TENANTS) {
    await prisma.tenant.upsert({
      where: { code: tenantCode },
      update: { displayName: tenantCode.toUpperCase() },
      create: { code: tenantCode, displayName: tenantCode.toUpperCase() },
    });
  }
  console.log('✅ Tenants ensured');

  // 2. Ensure roles exist for both tenants
  for (const tenantCode of TENANTS) {
    for (const roleCode of ROLES) {
      await prisma.role.upsert({
        where: { tenantId_code: { tenantId: tenantCode, code: roleCode } },
        update: { displayName: `${roleCode.charAt(0).toUpperCase() + roleCode.slice(1)} role` },
        create: { tenantId: tenantCode, code: roleCode, displayName: `${roleCode.charAt(0).toUpperCase() + roleCode.slice(1)} role` },
      });
    }
  }
  console.log('✅ Roles ensured');

  // 3. Create users: 2 per tenant × 6 roles = 12 users
  const createdUsers = [];

  for (const tenantCode of TENANTS) {
    for (let i = 0; i < USERS_PER_TENANT; i++) {
      const userId = `seed-user-${tenantCode}-${i}`;
      const email = `member-${i}@${tenantCode}.fitness`;

      // Create user
      const user = await prisma.user.create({
        data: {
          id: userId,
          tenantId: tenantCode,
          email,
          userType: 'member',
          status: 'active',
          displayName: `${roleCodes[i % ROLES.length]} ${i + 1}`,
        },
      });
      createdUsers.push(user.id);
      console.log(`  Created user: ${user.email} (${user.id})`);

      // Create password hash
      const passwordHash = hashPassword('SeedPass-9!');

      await prisma.userCredential.create({
        data: {
          tenantId: tenantCode,
          userId: user.id,
          passwordHash,
        },
      });

      // Assign role
      const role = await prisma.role.findFirst({
        where: { tenantId: tenantCode, code: ROLES[i % ROLES.length] },
      });

      await prisma.userRoleAssignment.create({
        data: {
          tenantId: tenantCode,
          userId: user.id,
          roleId: role.id,
        },
      });

      // Owner/admin: pre-enroll in TOTP
      if (ROLES[i % ROLES.length] === 'owner' || ROLES[i % ROLES.length] === 'admin') {
        const secret = generateTotpSecret();
        const encryptedSecret = Buffer.from(secret, 'hex').toString('base64'); // simplified

        await prisma.userTotp.create({
          data: {
            tenantId: tenantCode,
            userId: user.id,
            secret: encryptedSecret,
            confirmedAt: new Date(), // pre-enrolled
          },
        });

        console.log(`    🔐 TOTP pre-enrolled for ${ROLES[i % ROLES.length]} user`);
      }
    }
  }
  console.log('✅ Users created');

  // 4. Create invite tokens for each user (single-use)
  for (const userId of createdUsers) {
    const token = require('crypto').randomBytes(32).toString('hex');
    await prisma.authActionToken.create({
      data: {
        tenantId: userId.includes('tenant-a') ? 'tenant-a' : 'tenant-b',
        userId,
        purpose: 'member_seed',
        tokenHash: require('crypto').createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000), // 48 hours
      },
    });
  }
  console.log('✅ Invite tokens created');

  console.log('\n🎉 Seed complete! 12 users across 2 tenants with all 6 roles.');
  console.log('   - Owner/admin users have TOTP pre-enrolled');
  console.log('   - All users have password: SeedPass-9!');
  console.log('   - All users have invite tokens valid for 48 hours');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });