import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string) {
    const [users, settings, pendingEvents, receivedWebhooks] = await this.prisma.withTenant(tenantId, (tx) => Promise.all([
      tx.user.count({ where: { tenantId, status: 'active' } }),
      tx.tenantSetting.count({ where: { tenantId } }),
      tx.outboxEvent.count({ where: { tenantId, status: 'pending' } }),
      tx.webhookInbox.count({ where: { tenantId, status: 'received' } }),
    ]));
    return { tenant_id: tenantId, active_users: users, configured_settings: settings, pending_outbox_events: pendingEvents, unprocessed_webhooks: receivedWebhooks };
  }
}
