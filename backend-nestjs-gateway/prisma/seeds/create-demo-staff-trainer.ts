import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../src/common/auth-token';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { code: 'demo' },
  });

  if (!tenant || tenant.status !== 'active') {
    throw new Error('Active studio tenant not found. No accounts created.');
  }

  const accounts = [
    {
      email: 'staff@fitnessstudio.demo',
      password: 'Staff@123',
      displayName: 'Demo Studio Staff',
      roleCode: 'front_desk',
      roleName: 'Front Desk Staff',
    },
    {
      email: 'trainer@fitnessstudio.demo',
      password: 'Trainer@123',
      displayName: 'Demo Studio Trainer',
      roleCode: 'trainer',
      roleName: 'Studio Trainer',
    },
  ];

  for (const account of accounts) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT set_config('app.tenant_id', ${tenant.id}, true)
      `;

      const role = await tx.role.upsert({
        where: {
          tenantId_code: {
            tenantId: tenant.id,
            code: account.roleCode,
          },
        },
        update: { displayName: account.roleName },
        create: {
          tenantId: tenant.id,
          code: account.roleCode,
          displayName: account.roleName,
        },
      });

      let user = await tx.user.findFirst({
        where: { tenantId: tenant.id, email: account.email },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: account.email,
            displayName: account.displayName,
            userType: 'staff',
            status: 'active',
          },
        });
      }

      const passwordHash = await hashPassword(account.password);

      await tx.userCredential.upsert({
        where: {
          tenantId_userId: {
            tenantId: tenant.id,
            userId: user.id,
          },
        },
        update: {
          passwordHash,
          passwordChangedAt: new Date(),
        },
        create: {
          tenantId: tenant.id,
          userId: user.id,
          passwordHash,
        },
      });

      const assignment = await tx.userRoleAssignment.findFirst({
        where: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: role.id,
        },
      });

      if (!assignment) {
        await tx.userRoleAssignment.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            roleId: role.id,
          },
        });
      }
    });

    console.log(`Configured account: ${account.email} (${account.roleCode})`);
  }
}

main()
  .catch((error) => {
    console.error('Demo account setup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
