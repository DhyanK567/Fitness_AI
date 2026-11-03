import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { MembersService } from '../modules/members/members.service';
import { BookingsService } from '../modules/bookings/bookings.service';
import { PaymentsService } from '../modules/payments/payments.service';
import { MembershipsService } from '../modules/memberships/memberships.service';

describe('Ownership Tests - Member Role Data Isolation (Unit)', () => {
  let membersService: any;
  let bookingsService: any;
  let paymentsService: any;
  let membershipsService: any;

  const memberAContext = { tenantId: 'tenant-1', userId: 'member-A', role: 'member', correlationId: 'corr-A' };
  const memberBContext = { tenantId: 'tenant-1', userId: 'member-B', role: 'member', correlationId: 'corr-B' };
  const tenant2MemberContext = { tenantId: 'tenant-2', userId: 'member-C', role: 'member', correlationId: 'corr-C' };

  beforeAll(() => {
    // Create a simple mock ERP service
    const mockErpService = {
      call: jest.fn().mockImplementation(async (options: any) => {
        const { method, body } = options;
        const tenantId = options.tenantId || 'tenant-1';
        
        // Test data
        const members = [
          { id: 'member-A', full_name: 'Member A', tenant_id: 'tenant-1', phone: '1111111111' },
          { id: 'member-B', full_name: 'Member B', tenant_id: 'tenant-1', phone: '2222222222' },
          { id: 'member-C', full_name: 'Member C', tenant_id: 'tenant-2', phone: '3333333333' },
        ];
        
        const bookings = [
          { id: 'booking-1', member_id: 'member-A', session_id: 'session-1', tenant_id: 'tenant-1' },
          { id: 'booking-2', member_id: 'member-B', session_id: 'session-2', tenant_id: 'tenant-1' },
          { id: 'booking-3', member_id: 'member-C', session_id: 'session-3', tenant_id: 'tenant-2' },
        ];
        
        const payments = [
          { id: 'payment-1', member_id: 'member-A', amount: 1000, tenant_id: 'tenant-1' },
          { id: 'payment-2', member_id: 'member-B', amount: 2000, tenant_id: 'tenant-1' },
          { id: 'payment-3', member_id: 'member-C', amount: 3000, tenant_id: 'tenant-2' },
        ];
        
        const memberships = [
          { id: 'membership-1', member_id: 'member-A', tenant_id: 'tenant-1' },
          { id: 'membership-2', member_id: 'member-B', tenant_id: 'tenant-1' },
          { id: 'membership-3', member_id: 'member-C', tenant_id: 'tenant-2' },
        ];
        
        // Match the real dotted ERP method names exactly: the services call
        // ErpnextService.call with ERP_METHODS values like
        // 'wellness_studio.api.member.list'. Substring matching is ambiguous
        // because 'membership' contains 'member'.
        const name = String(method || '');

        if (name.endsWith('.member.list')) {
          let filtered = members.filter(m => m.tenant_id === tenantId);
          if (body?.member_id) filtered = filtered.filter(m => m.id === body.member_id);
          return { members: filtered };
        }

        if (name.endsWith('.member.get')) {
          const member = members.find(m => m.id === body?.id);
          if (!member) throw new Error('404 Not Found');
          return member;
        }

        if (name.endsWith('.booking.list')) {
          let filtered = bookings.filter(b => b.tenant_id === tenantId);
          if (body?.member_id) filtered = filtered.filter(b => b.member_id === body.member_id);
          if (body?.session_id) filtered = filtered.filter(b => b.session_id === body.session_id);
          return { bookings: filtered };
        }

        if (name.endsWith('.booking.get')) {
          const booking = bookings.find(b => b.id === body?.id);
          if (!booking) throw new Error('404 Not Found');
          return booking;
        }

        if (name.endsWith('.payment.list')) {
          let filtered = payments.filter(p => p.tenant_id === tenantId);
          if (body?.member_id) filtered = filtered.filter(p => p.member_id === body.member_id);
          return { payments: filtered };
        }

        if (name.endsWith('.payment.get')) {
          const payment = payments.find(p => p.id === body?.id);
          if (!payment) throw new Error('404 Not Found');
          return payment;
        }

        if (name.endsWith('.membership.list')) {
          let filtered = memberships.filter(m => m.tenant_id === tenantId);
          if (body?.member_id) filtered = filtered.filter(m => m.member_id === body.member_id);
          return { memberships: filtered };
        }

        if (name.endsWith('.membership.get')) {
          const membership = memberships.find(m => m.id === body?.id);
          if (!membership) throw new Error('404 Not Found');
          return membership;
        }

        throw new Error(`Unknown method: ${method}`);
      }),
    };

    // Create services directly with mocked ERP
    membersService = new MembersService(mockErpService as any);
    bookingsService = new BookingsService(mockErpService as any);
    paymentsService = new PaymentsService(mockErpService as any);
    membershipsService = new MembershipsService(mockErpService as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MembersService - Member Role Ownership', () => {
    it('GET /members (findAll) for member-A returns only member-A records', async () => {
      const result = await membersService.findAll(memberAContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data!;
      expect(Array.isArray(data)).toBe(true);
      // Should only return member-A's record
      expect(data.length).toBe(1);
      expect(data[0].id).toBe('member-A');
    });

    it('GET /members/:id for member-B returns 404 when called by member-A', async () => {
      const result = await membersService.findOne(memberAContext, 'member-B');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('GET /members/:id for own record (member-A) succeeds', async () => {
      const result = await membersService.findOne(memberAContext, 'member-A');
      
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe('member-A');
    });

    it('GET /members (findAll) never returns tenant-2 data for tenant-1 caller', async () => {
      const result = await membersService.findAll(memberAContext);
      
      expect(result.success).toBe(true);
      expect(result.data!.every((m: any) => m.tenant_id === 'tenant-1')).toBe(true);
      expect(result.data!.some((m: any) => m.id === 'member-C')).toBe(false);
    });
  });

  describe('BookingsService - Member Role Ownership', () => {
    it('GET /bookings (findAll) for member-A returns only member-A bookings', async () => {
      const result = await bookingsService.findAll(memberAContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data!;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].member_id).toBe('member-A');
    });

    it('GET /bookings/:id for member-B booking returns 404 when called by member-A', async () => {
      const result = await bookingsService.findOne(memberAContext, 'booking-2');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('GET /bookings (findAll) never returns tenant-2 data for tenant-1 caller', async () => {
      const result = await bookingsService.findAll(memberAContext);
      
      expect(result.success).toBe(true);
      expect(result.data!.every((b: any) => b.tenant_id === 'tenant-1')).toBe(true);
      expect(result.data!.some((b: any) => b.id === 'booking-3')).toBe(false);
    });
  });

  describe('PaymentsService - Member Role Ownership', () => {
    it('GET /payments (findAll) for member-A returns only member-A payments', async () => {
      const result = await paymentsService.findAll(memberAContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data!;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].member_id).toBe('member-A');
    });

    it('GET /payments/:id for member-B payment returns 404 when called by member-A', async () => {
      const result = await paymentsService.findOne(memberAContext, 'payment-2');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('GET /payments (findAll) never returns tenant-2 data for tenant-1 caller', async () => {
      const result = await paymentsService.findAll(memberAContext);
      
      expect(result.success).toBe(true);
      expect(result.data!.every((p: any) => p.tenant_id === 'tenant-1')).toBe(true);
      expect(result.data!.some((p: any) => p.id === 'payment-3')).toBe(false);
    });
  });

  describe('MembershipsService - Member Role Ownership', () => {
    it('GET /memberships (findAll) for member-A returns only member-A memberships', async () => {
      const result = await membershipsService.findAll(memberAContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data!;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(1);
      expect(data[0].member_id).toBe('member-A');
    });

    it('GET /memberships/:id for member-B membership returns 404 when called by member-A', async () => {
      const result = await membershipsService.findOne(memberAContext, 'membership-2');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });

    it('GET /memberships (findAll) never returns tenant-2 data for tenant-1 caller', async () => {
      const result = await membershipsService.findAll(memberAContext);
      
      expect(result.success).toBe(true);
      expect(result.data!.every((m: any) => m.tenant_id === 'tenant-1')).toBe(true);
      expect(result.data!.some((m: any) => m.id === 'membership-3')).toBe(false);
    });
  });

  describe('Cross-Tenant Isolation - Tenant2 member never sees Tenant1 data', () => {
    it('Members: tenant-2 member sees only tenant-2 members', async () => {
      const result = await membersService.findAll(tenant2MemberContext);
      
      expect(result.success).toBe(true);
      expect(result.data!.every((m: any) => m.tenant_id === 'tenant-2')).toBe(true);
      expect(result.data!.some((m: any) => m.id === 'member-A')).toBe(false);
    });

    it('Bookings: tenant-2 member sees only tenant-2 bookings', async () => {
      const result = await bookingsService.findAll(tenant2MemberContext);
      
      expect(result.success).toBe(true);
      expect(result.data!.every((b: any) => b.tenant_id === 'tenant-2')).toBe(true);
    });

    it('Payments: tenant-2 member sees only tenant-2 payments', async () => {
      const result = await paymentsService.findAll(tenant2MemberContext);
      
      expect(result.success).toBe(true);
      expect(result.data!.every((p: any) => p.tenant_id === 'tenant-2')).toBe(true);
    });

    it('Memberships: tenant-2 member sees only tenant-2 memberships', async () => {
      const result = await membershipsService.findAll(tenant2MemberContext);
      
      expect(result.success).toBe(true);
      expect(result.data!.every((m: any) => m.tenant_id === 'tenant-2')).toBe(true);
    });
  });

  describe('Member cannot PATCH/DELETE another member record', () => {
    it('PATCH /members/:id for member-B by member-A fails', async () => {
      const result = await membersService.update(memberAContext, 'member-B', { full_name: 'Hacked' });
      
      // Should fail - member-A cannot update member-B
      expect(result.success).toBe(false);
    });

    it('DELETE /members/:id for member-B by member-A fails', async () => {
      const result = await membersService.delete(memberAContext, 'member-B');
      
      // Should fail - member-A cannot delete member-B
      expect(result.success).toBe(false);
    });
  });
});