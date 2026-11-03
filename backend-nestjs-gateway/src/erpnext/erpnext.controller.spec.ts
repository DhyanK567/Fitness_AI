import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { ErpnextController } from './erpnext.controller';
import { ErpnextService } from './erpnext.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { PrismaService } from '../common/prisma.service';
import { PolicyModule } from '../platform/roles-permissions/policy.module';

describe('ErpnextController', () => {
  let controller: ErpnextController;
  const erpnextService = {
    health: jest.fn(async (_context: { tenantId: string; correlationId: string }) => ({ status: 'ok' })),
    version: jest.fn(async (_context: { tenantId: string; correlationId: string }) => ({ app: 'wellness_studio', version: '0.0.1' })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PolicyModule],
      controllers: [ErpnextController],
      providers: [
        { provide: StaffAccessGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: TenantContextGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: PrismaService, useValue: { tenant: { findUnique: jest.fn() } } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        {
          provide: ErpnextService,
          useValue: erpnextService,
        },
      ],
    }).compile();

    controller = module.get<ErpnextController>(ErpnextController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('checks ERP health with the resolved tenant and correlation ID', async () => {
    await expect(controller.health({ tenantCode: 'tenant-a', correlationId: 'corr-health' } as any))
      .resolves.toEqual({ status: 'ok' });
    expect(erpnextService.health).toHaveBeenCalledWith({ tenantId: 'tenant-a', correlationId: 'corr-health' });
  });

  it('checks the installed app version with the resolved tenant and correlation ID', async () => {
    await expect(controller.version({ tenantCode: 'tenant-a', correlationId: 'corr-version' } as any))
      .resolves.toEqual({ app: 'wellness_studio', version: '0.0.1' });
    expect(erpnextService.version).toHaveBeenCalledWith({ tenantId: 'tenant-a', correlationId: 'corr-version' });
  });
});
