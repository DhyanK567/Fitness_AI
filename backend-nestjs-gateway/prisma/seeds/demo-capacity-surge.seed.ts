import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TIMEZONE = 'Asia/Kolkata';

function formatInTimezone(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, ...options }).format(date);
}

async function main() {
  console.log('--- Initializing Demo Capacity Surge Data ---');

  // 1. Resolve demo tenant
  const tenant = await prisma.tenant.findUnique({
    where: { code: 'demo' },
    select: { id: true, code: true, displayName: true },
  });

  if (!tenant) {
    throw new Error('Tenant "demo" not found. Run demo-tenant.seed.ts first.');
  }

  console.log(`Using demo tenant: ${tenant.displayName} (${tenant.id})`);

  // 2. Compute class schedule ~90 minutes from now in Asia/Kolkata
  const now = new Date();
  const targetStartTime = new Date(now.getTime() + 90 * 60 * 1000);
  const targetEndTime = new Date(targetStartTime.getTime() + 50 * 60 * 1000); // 50-minute class

  const datePart = formatInTimezone(targetStartTime, TIMEZONE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }); // YYYY-MM-DD

  // Format start and end time as HH:MM
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const startTimeStr = timeFormatter.format(targetStartTime);
  const endTimeStr = timeFormatter.format(targetEndTime);
  const classDate = new Date(`${datePart}T00:00:00+05:30`);

  console.log(`Target class schedule: Date=${datePart}, StartTime=${startTimeStr}, EndTime=${endTimeStr} (IST)`);

  // 3. Execute tenant-scoped mutations under RLS
  await prisma.$transaction(async (tx) => {
    // Set RLS session context for the demo tenant
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.tenant_id', $1, true)",
      tenant.id,
    );

    // Upsert or reuse 19 members
    const members: { id: string; email: string }[] = [];
    for (let i = 1; i <= 19; i++) {
      const padIndex = String(i).padStart(2, '0');
      const email = `demo.member.${padIndex}@demo.local`;
      const fullName = `Demo Member ${padIndex}`;
      const phone = `+9198765432${padIndex}`;

      let member = await tx.studioMember.findFirst({
        where: { tenantId: tenant.id, email },
        select: { id: true, email: true },
      });

      if (!member) {
        member = await tx.studioMember.create({
          data: {
            tenantId: tenant.id,
            fullName,
            email,
            phone,
            plan: 'Premium',
            status: 'Active',
          },
          select: { id: true, email: true },
        });
      } else {
        await tx.studioMember.update({
          where: { id: member.id },
          data: { status: 'Active' },
        });
      }

      members.push(member);
    }
    console.log(`Prepared ${members.length} active demo members.`);

    // Upsert or update target class
    const className = 'HIIT Capacity Surge Demo';
    let studioClass = await tx.studioClass.findFirst({
      where: { tenantId: tenant.id, name: className },
      select: { id: true, name: true, capacity: true },
    });

    if (studioClass) {
      studioClass = await tx.studioClass.update({
        where: { id: studioClass.id },
        data: {
          category: 'HIIT',
          date: classDate,
          startTime: startTimeStr,
          endTime: endTimeStr,
          trainer: 'Coach Marcus',
          room: 'Studio A',
          capacity: 20,
          status: 'Scheduled',
        },
        select: { id: true, name: true, capacity: true },
      });
      console.log(`Updated existing class: ${studioClass.name} (${studioClass.id})`);
    } else {
      studioClass = await tx.studioClass.create({
        data: {
          tenantId: tenant.id,
          name: className,
          category: 'HIIT',
          date: classDate,
          startTime: startTimeStr,
          endTime: endTimeStr,
          trainer: 'Coach Marcus',
          room: 'Studio A',
          capacity: 20,
          status: 'Scheduled',
        },
        select: { id: true, name: true, capacity: true },
      });
      console.log(`Created new class: ${studioClass.name} (${studioClass.id})`);
    }

    // Clean up any existing bookings for this class to ensure idempotent 19 bookings
    await tx.studioBooking.deleteMany({
      where: {
        tenantId: tenant.id,
        classId: studioClass.id,
      },
    });

    // Create exactly 19 confirmed bookings linking the 19 active members
    for (const member of members) {
      await tx.studioBooking.create({
        data: {
          tenantId: tenant.id,
          classId: studioClass.id,
          memberId: member.id,
          status: 'Confirmed',
          bookedAt: new Date(),
        },
      });
    }

    const bookingCount = await tx.studioBooking.count({
      where: {
        tenantId: tenant.id,
        classId: studioClass.id,
        status: 'Confirmed',
      },
    });

    const occupancyPct = ((bookingCount / studioClass.capacity) * 100).toFixed(1);
    console.log(`Verified Class: ${studioClass.name}`);
    console.log(`Capacity: ${studioClass.capacity}`);
    console.log(`Confirmed Bookings: ${bookingCount}`);
    console.log(`Occupancy: ${occupancyPct}% (Target: 95.0% for SURGE_90)`);
  });

  console.log('--- Demo Capacity Surge Data Setup Succeeded ---');
}

main()
  .catch((err) => {
    console.error('Failed seeding capacity demo data:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
