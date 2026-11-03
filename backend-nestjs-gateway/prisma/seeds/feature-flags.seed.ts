import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FEATURE_FLAGS = [
  // Core AI features (Phase 1)
  { featureCode: 'ai.admin', isEnabled: true },
  { featureCode: 'ai.enquiry', isEnabled: true },
  { featureCode: 'ai.booking', isEnabled: true },
  { featureCode: 'ai.recommendation', isEnabled: true },
  { featureCode: 'ai.feedback', isEnabled: true },

  // Phase 2 features
  { featureCode: 'ai.rag', isEnabled: false },

  // Phase 3 features
  { featureCode: 'ai.crm', isEnabled: false },

  // Phase 4 features
  { featureCode: 'ai.retention', isEnabled: false },

  // Phase 5 features (NEW)
  { featureCode: 'ai.operations', isEnabled: false },
  { featureCode: 'ai.growth', isEnabled: false },
  { featureCode: 'ai.marketing', isEnabled: false },
];

async function main() {
  // Get demo tenant
  const tenant = await prisma.tenant.findUnique({
    where: { code: 'demo' },
  });

  if (!tenant) {
    console.error('Demo tenant not found. Run demo-tenant.seed.ts first.');
    process.exit(1);
  }

  // Upsert tier features for the starter tier
  const tier = await prisma.subscriptionTier.findUnique({
    where: { code: 'starter' },
  });

  if (tier) {
    for (const flag of FEATURE_FLAGS) {
      await prisma.tierFeature.upsert({
        where: {
          tierId_featureCode: {
            tierId: tier.id,
            featureCode: flag.featureCode,
          },
        },
        update: { isEnabled: flag.isEnabled },
        create: {
          tierId: tier.id,
          featureCode: flag.featureCode,
          isEnabled: flag.isEnabled,
        },
      });
    }
    console.log(`Upserted ${FEATURE_FLAGS.length} tier features for starter tier.`);
  }

  // Upsert tenant feature flags
  for (const flag of FEATURE_FLAGS) {
    await prisma.tenantFeatureFlag.upsert({
      where: {
        tenantId_featureCode: {
          tenantId: tenant.id,
          featureCode: flag.featureCode,
        },
      },
      update: { isEnabled: flag.isEnabled },
      create: {
        tenantId: tenant.id,
        featureCode: flag.featureCode,
        isEnabled: flag.isEnabled,
      },
    });
  }
  console.log(`Upserted ${FEATURE_FLAGS.length} tenant feature flags for demo tenant.`);

  console.log('\nFeature flags configured:');
  FEATURE_FLAGS.forEach(f => {
    console.log(`  ${f.featureCode}: ${f.isEnabled ? 'ENABLED' : 'DISABLED'}`);
  });
}

main()
  .catch((error) => {
    console.error('Feature flags seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });