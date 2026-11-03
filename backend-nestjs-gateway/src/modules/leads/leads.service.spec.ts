import { jest } from '@jest/globals';
import { LeadsService } from './leads.service';

describe('LeadsService public enquiry', () => {
  it('forces public source/status, scopes the ERP call to the tenant, and records a system audit', async () => {
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValue({ id: 'WS-LEAD-1', duplicate: false });
    const tx = {};
    const withTenant = jest.fn((_tenant: string, work: (client: unknown) => unknown) => work(tx));
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    recordInTransaction.mockResolvedValue(undefined);
    const service = new LeadsService({ call } as any, { recordInTransaction } as any, { withTenant } as any);

    const result = await service.createPublic(
      { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-public' },
      { full_name: 'Visitor', phone: '+14155550100', email: 'visitor@example.com' },
    );

    expect(result).toEqual({ id: 'WS-LEAD-1', duplicate: false });
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'studio-a', method: 'wellness_studio.api.lead.create_lead',
      body: { tenant: 'studio-a', full_name: 'Visitor', phone: '+14155550100', email: 'visitor@example.com', source: 'website', status: 'new' },
    }));
    expect(recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ actorType: 'system', actorId: undefined, resourceRef: 'WS-LEAD-1' }));
  });

  it('does not audit if ERP returns no lead identifier', async () => {
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValue({});
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    const service = new LeadsService({ call } as any, { recordInTransaction } as any, {} as any);
    await expect(service.createPublic(
      { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-public' },
      { full_name: 'Visitor', phone: '+14155550100' },
    )).rejects.toThrow('ERP lead response omitted its identifier');
    expect(recordInTransaction).not.toHaveBeenCalled();
  });
});
