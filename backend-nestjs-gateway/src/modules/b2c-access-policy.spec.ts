import { GUARDS_METADATA } from '@nestjs/common/constants';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { LoginRateLimitGuard } from '../auth/login-rate-limit.guard';
import { MemberOrStaffAccessGuard } from './bookings/booking-access.guard';
import { ClassesController } from './classes/classes.controller';
import { ClassesPublicController } from './classes/classes-public.controller';
import { MembersController } from './members/members.controller';
import { MemberSelfController } from './members/member-self.controller';
import { MembershipsController } from './memberships/memberships.controller';
import { MemberMembershipsController } from './memberships/member-memberships.controller';
import { MembershipPlansPublicController } from './memberships/membership-plans-public.controller';
import { LeadsController } from './leads/leads.controller';
import { PublicEnquiryController } from './leads/public-enquiry.controller';
import { EventsController } from './events/events.controller';
import { PublicEventsController } from './events/public-events.controller';
import { EventRegistrationsController } from './events/event-registrations.controller';

const methodGuards = (controller: object, method: string): unknown[] =>
  Reflect.getMetadata(GUARDS_METADATA, (controller as any)[method]) ?? [];

describe('B2B/B2C controller boundaries', () => {
  it('separates public class reads from staff-only class writes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ClassesPublicController)).toEqual([TenantContextGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, ClassesController)).toEqual([TenantContextGuard, StaffAccessGuard]);
    expect(methodGuards(ClassesController.prototype, 'create')).toEqual([]);
  });

  it('keeps member profile and membership handlers in guarded member controllers', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MemberSelfController)).toEqual([TenantContextGuard, MemberOrStaffAccessGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, MemberMembershipsController)).toEqual([TenantContextGuard, MemberOrStaffAccessGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, MembershipPlansPublicController)).toEqual([TenantContextGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, MembersController)).toEqual([TenantContextGuard, StaffAccessGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, MembershipsController)).toEqual([TenantContextGuard, StaffAccessGuard]);
  });

  it('isolates public event/enquiry handlers and retains guarded staff event operations', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicEnquiryController)).toEqual([TenantContextGuard, LoginRateLimitGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicEventsController)).toEqual([TenantContextGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, EventsController)).toBeUndefined();
    expect(methodGuards(EventsController.prototype, 'list')).toEqual([TenantContextGuard, StaffAccessGuard]);
    expect(methodGuards(EventRegistrationsController.prototype, 'register')).toEqual([TenantContextGuard, MemberOrStaffAccessGuard]);
  });
});
