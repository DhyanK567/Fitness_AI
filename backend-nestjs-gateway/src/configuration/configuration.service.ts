import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../common/prisma.service';
import { Prisma } from '@prisma/client';

type CacheEntry = { expiresAt: number; value: unknown };
type SettingRecord = { settingKey: string; settingValue: Prisma.JsonValue };
const CACHE_TTL_MS = 60_000;
const SETTING_KEY = /^[a-z][a-z0-9_.-]{1,99}$/;

@Injectable()
export class ConfigurationService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService, private readonly auditOutbox: AuditOutboxService) {}

  private assertKey(settingKey: string): void {
    if (!SETTING_KEY.test(settingKey)) throw new BadRequestException('Invalid setting key');
  }

  private present(setting: SettingRecord) {
    return { key: setting.settingKey, value: setting.settingValue };
  }

  async list(tenantId: string) {
    const settings = await this.prisma.withTenant(tenantId, (tx) => tx.tenantSetting.findMany({ where: { tenantId }, orderBy: { settingKey: 'asc' } }));
    return settings.map((setting) => this.present(setting));
  }

  async get(tenantId: string, settingKey: string) {
    this.assertKey(settingKey);
    const cacheKey = `${tenantId}:${settingKey}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const setting = await this.prisma.withTenant(tenantId, (tx) => tx.tenantSetting.findUnique({ where: { tenantId_settingKey: { tenantId, settingKey } } }));
    if (!setting) throw new NotFoundException('Setting not found');
    const response = this.present(setting);
    this.cache.set(cacheKey, { value: response, expiresAt: Date.now() + CACHE_TTL_MS });
    return response;
  }

  async upsert(tenantId: string, settingKey: string, settingValue: unknown, actorId: string, correlationId: string) {
    this.assertKey(settingKey);
    const encoded = JSON.stringify(settingValue);
    if (encoded === undefined) throw new BadRequestException('Setting value must be JSON serializable');
    if (encoded.length > 16_384) throw new BadRequestException('Setting value is too large');
    const setting = await this.prisma.withTenant(tenantId, async (tx) => {
      const before = await tx.tenantSetting.findUnique({ where: { tenantId_settingKey: { tenantId, settingKey } } });
      const saved = await tx.tenantSetting.upsert({
        where: { tenantId_settingKey: { tenantId, settingKey } },
        update: { settingValue: settingValue as Prisma.InputJsonValue },
        create: { tenantId, settingKey, settingValue: settingValue as Prisma.InputJsonValue },
      });
      await this.auditOutbox.recordInTransaction(tx, {
        tenantId, correlationId, actorType: 'user', actorId, action: 'setting.updated', resourceType: 'tenant_setting', resourceRef: saved.id,
        eventType: 'setting.updated', payload: { settingKey },
        beforeData: before?.settingValue === null ? undefined : before?.settingValue as Prisma.InputJsonValue | undefined,
        afterData: saved.settingValue === null ? undefined : saved.settingValue as Prisma.InputJsonValue,
      });
      return saved;
    });
    this.cache.delete(`${tenantId}:${settingKey}`);
    return this.present(setting);
  }
}
