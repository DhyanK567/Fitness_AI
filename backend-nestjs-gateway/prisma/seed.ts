import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/auth-token';

const prisma = new PrismaClient();

async function main() {
  // 1. Create or reuse a subscription tier.
  const tier = await prisma.subscriptionTier.upsert({
    where: { code: 'enterprise' },
    update: { displayName: 'Enterprise' },
    create: {
      code: 'enterprise',
      displayName: 'Enterprise',
      status: 'active',
    },
  });

  // 2. Create or reuse the demo tenant.
  // The database requires tier_id, so always supply tierId.
  const tenant = await prisma.tenant.upsert({
    where: { code: 'demo' },
    update: {
      legalName: 'Demo Fitness Studio',
      displayName: 'Demo Fitness Studio',
      status: 'active',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      tierId: tier.id,
    },
    create: {
      code: 'demo',
      legalName: 'Demo Fitness Studio',
      displayName: 'Demo Fitness Studio',
      status: 'active',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      tierId: tier.id,
    },
  });

  // 3. Register the local hostname.
  await prisma.tenantDomain.upsert({
    where: { hostname: 'demo.fitness.local' },
    update: {
      tenantId: tenant.id,
      isPrimary: true,
    },
    create: {
      tenantId: tenant.id,
      hostname: 'demo.fitness.local',
      isPrimary: true,
    },
  });

  // 4. Create the owner role and account inside tenant context.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT set_config('app.tenant_id', ${tenant.id}, true)
    `;

    const role = await tx.role.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: 'owner',
        },
      },
      update: { displayName: 'Studio Owner' },
      create: {
        tenantId: tenant.id,
        code: 'owner',
        displayName: 'Studio Owner',
      },
    });

    const email = 'owner@demo.local';
    const password = 'DemoFitness!2026';
    const passwordHash = await hashPassword(password);

    const existingUser = await tx.user.findFirst({
      where: {
        tenantId: tenant.id,
        email,
      },
    });

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            displayName: 'Demo Studio Owner',
            userType: 'staff',
            status: 'active',
          },
        })
      : await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            displayName: 'Demo Studio Owner',
            userType: 'staff',
            status: 'active',
          },
        });

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

  console.log('Demo tenant and owner account are ready.');
  console.log('Tenant: demo');
  console.log('Login: owner@demo.local');
  console.log('Password: DemoFitness!2026');
}

main()
  .catch((error) => {
    console.error('Demo setup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });