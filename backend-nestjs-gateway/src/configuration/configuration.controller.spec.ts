import { jest } from '@jest/globals';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from './configuration.service';
import type { RequestWithContext } from '../common/request-context.types';

function makeController() {
  const service = {
    list: jest.fn(async (_tenantId: string) => [{ key: 'landing_page_config', value: { isPublished: true } }]),
    get: jest.fn(async (_tenantId: string, key: string) => ({ key, value: { isPublished: true } })),
    upsert: jest.fn(async (_tenantId: string, key: string, value: unknown, _userId?: string, _corrId?: string) => ({ key, value })),
  };
  const controller = new ConfigurationController(service as unknown as ConfigurationService);
  return { controller, service };
}

describe('ConfigurationController', () => {
  const TENANT_ID = 'tenant-1234';

  it('delegates list to ConfigurationService with the scoped tenantId', async () => {
    const { controller, service } = makeController();
    const mockReq = {
      tenantId: TENANT_ID,
    } as RequestWithContext;

    const result = await controller.list(mockReq);
    expect(service.list).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual([{ key: 'landing_page_config', value: { isPublished: true } }]);
  });

  it('delegates get to ConfigurationService with the scoped tenantId and key', async () => {
    const { controller, service } = makeController();
    const mockReq = {
      tenantId: TENANT_ID,
    } as RequestWithContext;

    const result = await controller.get(mockReq, 'landing_page_config');
    expect(service.get).toHaveBeenCalledWith(TENANT_ID, 'landing_page_config');
    expect(result).toEqual({ key: 'landing_page_config', value: { isPublished: true } });
  });

  it('delegates upsert to ConfigurationService with tenantId, key, value, userId, and correlationId', async () => {
    const { controller, service } = makeController();
    const mockReq = {
      tenantId: TENANT_ID,
      auth: { userId: 'staff-user-42' },
      correlationId: 'corr-xyz-99',
    } as unknown as RequestWithContext;

    const payloadValue = { studioName: 'Fitness AI Studio', isPublished: true };
    const result = await controller.upsert(mockReq, 'landing_page_config', { value: payloadValue });

    expect(service.upsert).toHaveBeenCalledWith(
      TENANT_ID,
      'landing_page_config',
      payloadValue,
      'staff-user-42',
      'corr-xyz-99'
    );
    expect(result).toEqual({ key: 'landing_page_config', value: payloadValue });
  });
});
