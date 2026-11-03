import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Run tenant-owned SQL with PostgreSQL RLS context scoped to this transaction. */
  async withTenant<T>(tenantId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('A canonical tenant UUID is required for tenant-scoped database access.');
    }
    return this.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.current_tenant', ${tenantId}, true)`;
      return work(tx);
    });
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    await this.$connect();
  }

  async onModuleDestroy() {
    if (process.env.NODE_ENV === 'test') return;
    await this.$disconnect();
  }
}
