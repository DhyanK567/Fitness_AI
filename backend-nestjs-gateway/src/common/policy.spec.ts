import { describe, it, expect } from '@jest/globals';
import { can, getPermissionsForRole, StaffRole } from '../common/policy';
import { hasPermission, getAllPermissionsForRole, StaffRole as ScopeStaffRole } from '../ai/guardrails/scope-rules';

describe('Policy - Role Permissions', () => {
  const allRoles: StaffRole[] = ['owner', 'admin', 'front_desk', 'trainer', 'member', 'visitor'];

  describe('can() function', () => {
    it('owner has all permissions', () => {
      expect(can('owner', '*')).toBe(true);
      expect(can('owner', 'any:permission')).toBe(true);
    });

    it('admin has staff:read/write, feedback:read/write, recommendations:read, schedules:read/write, ai:chat, ai:approve, events:read/write, leads:read/write, dashboard:read', () => {
      expect(can('admin', 'staff:read')).toBe(true);
      expect(can('admin', 'staff:write')).toBe(true);
      expect(can('admin', 'feedback:read')).toBe(true);
      expect(can('admin', 'feedback:write')).toBe(true);
      expect(can('admin', 'recommendations:read')).toBe(true);
      expect(can('admin', 'schedules:read')).toBe(true);
      expect(can('admin', 'schedules:write')).toBe(true);
      expect(can('admin', 'ai:chat')).toBe(true);
      expect(can('admin', 'ai:approve')).toBe(true);
      expect(can('admin', 'ai:query')).toBe(true);
      expect(can('admin', 'audit:read')).toBe(true);
      expect(can('admin', 'events:read')).toBe(true);
      expect(can('admin', 'events:write')).toBe(true);
      expect(can('admin', 'leads:read')).toBe(true);
      expect(can('admin', 'leads:write')).toBe(true);
      expect(can('admin', 'dashboard:read')).toBe(true);
    });

    it('front_desk has staff:read, ai:chat, ai:approve, ai:query, reports:read', () => {
      expect(can('front_desk', 'staff:read')).toBe(true);
      expect(can('front_desk', 'staff:write')).toBe(false);
      expect(can('front_desk', 'ai:chat')).toBe(true);
      expect(can('front_desk', 'ai:approve')).toBe(true);
      expect(can('front_desk', 'ai:query')).toBe(true);
      expect(can('front_desk', 'audit:read')).toBe(false);
      expect(can('front_desk', 'reports:read')).toBe(true);
      expect(can('front_desk', 'feedback:read')).toBe(false);
      expect(can('front_desk', 'schedules:read')).toBe(false);
      expect(can('front_desk', 'leads:read')).toBe(false);
      expect(can('front_desk', 'dashboard:read')).toBe(false);
    });

    it('trainer has ai:chat, no ai:approve', () => {
      expect(can('trainer', 'ai:chat')).toBe(true);
      expect(can('trainer', 'ai:approve')).toBe(false);
      expect(can('trainer', 'staff:read')).toBe(false);
      expect(can('trainer', 'reports:read')).toBe(false);
    });

    it('member has ai:chat, no ai:approve, no staff:read', () => {
      expect(can('member', 'ai:chat')).toBe(true);
      expect(can('member', 'ai:approve')).toBe(false);
      expect(can('member', 'staff:read')).toBe(false);
      expect(can('member', 'reports:read')).toBe(false);
      expect(can('member', 'leads:read')).toBe(false);
    });

    it('visitor only has classes:read', () => {
      expect(can('visitor', 'classes:read')).toBe(true);
      expect(can('visitor', 'ai:chat')).toBe(false);
      expect(can('visitor', 'members:read')).toBe(false);
    });
  });

  describe('getPermissionsForRole()', () => {
    it('returns correct permission sets for each role', () => {
      const adminPerms = getPermissionsForRole('admin');
      expect(adminPerms.has('staff:read')).toBe(true);
      expect(adminPerms.has('staff:write')).toBe(true);
      expect(adminPerms.has('feedback:read')).toBe(true);
      expect(adminPerms.has('ai:chat')).toBe(true);
      expect(adminPerms.has('ai:approve')).toBe(true);
      expect(adminPerms.has('dashboard:read')).toBe(true);

      const frontDeskPerms = getPermissionsForRole('front_desk');
      expect(frontDeskPerms.has('staff:read')).toBe(true);
      expect(frontDeskPerms.has('ai:chat')).toBe(true);
      expect(frontDeskPerms.has('ai:approve')).toBe(true);
      expect(frontDeskPerms.has('feedback:read')).toBe(false);
    });

    it('all roles have at least one permission', () => {
      allRoles.forEach(role => {
        const perms = getPermissionsForRole(role);
        expect(perms.size).toBeGreaterThan(0);
      });
    });
  });

  describe('scope-rules parity', () => {
    it('scope-rules has same core permissions as policy', () => {
      // Test that key permissions exist in scope-rules for all roles
      allRoles.forEach(role => {
        const policyPerms = getPermissionsForRole(role);
        const scopePerms = getAllPermissionsForRole(role);
        
        // Core permissions that should match
        const corePerms = ['members:read', 'members:write', 'bookings:read', 'bookings:write', 'ai:chat'];
        corePerms.forEach(p => {
          expect(policyPerms.has(p)).toBe(scopePerms.includes(p));
        });
      });
    });

    it('scope-rules admin has all new permissions', () => {
      expect(hasPermission('admin', 'staff:read')).toBe(true);
      expect(hasPermission('admin', 'feedback:write')).toBe(true);
      expect(hasPermission('admin', 'recommendations:read')).toBe(true);
      expect(hasPermission('admin', 'schedules:write')).toBe(true);
      expect(hasPermission('admin', 'webhooks:write')).toBe(true);
      expect(hasPermission('admin', 'ai:chat')).toBe(true);
      expect(hasPermission('admin', 'ai:approve')).toBe(true);
      expect(hasPermission('admin', 'events:write')).toBe(true);
      expect(hasPermission('admin', 'leads:write')).toBe(true);
      expect(hasPermission('admin', 'dashboard:read')).toBe(true);
    });

    it('scope-rules front_desk has ai:chat, ai:approve, staff:read, reports:read', () => {
      expect(hasPermission('front_desk', 'ai:chat')).toBe(true);
      expect(hasPermission('front_desk', 'ai:approve')).toBe(true);
      expect(hasPermission('front_desk', 'staff:read')).toBe(true);
      expect(hasPermission('front_desk', 'reports:read')).toBe(true);
      expect(hasPermission('front_desk', 'feedback:write')).toBe(false);
    });

    it('scope-rules member has ai:chat but not ai:approve', () => {
      expect(hasPermission('member', 'ai:chat')).toBe(true);
      expect(hasPermission('member', 'ai:approve')).toBe(false);
    });
  });

  describe('route permissions match policy', () => {
    // Staff routes
    it('staff:read required for GET /staff', () => {
      expect(can('admin', 'staff:read')).toBe(true);
      expect(can('front_desk', 'staff:read')).toBe(true);
      expect(can('trainer', 'staff:read')).toBe(false);
    });
    it('staff:write required for POST/PATCH/DELETE /staff', () => {
      expect(can('admin', 'staff:write')).toBe(true);
      expect(can('front_desk', 'staff:write')).toBe(false);
    });

    // Feedback routes
    it('feedback:read required for GET /feedback', () => {
      expect(can('admin', 'feedback:read')).toBe(true);
      expect(can('front_desk', 'feedback:read')).toBe(false);
    });
    it('feedback:write required for POST/PATCH/DELETE /feedback', () => {
      expect(can('admin', 'feedback:write')).toBe(true);
      expect(can('front_desk', 'feedback:write')).toBe(false);
    });

    // Recommendations routes
    it('recommendations:read required for GET /recommendations', () => {
      expect(can('admin', 'recommendations:read')).toBe(true);
      expect(can('front_desk', 'recommendations:read')).toBe(false);
    });

    // Schedules routes
    it('schedules:read required for GET /schedules', () => {
      expect(can('admin', 'schedules:read')).toBe(true);
      expect(can('front_desk', 'schedules:read')).toBe(false);
    });
    it('schedules:write required for POST/PATCH/DELETE /schedules', () => {
      expect(can('admin', 'schedules:write')).toBe(true);
      expect(can('front_desk', 'schedules:write')).toBe(false);
    });

    // Events routes
    it('events:read required for GET /events', () => {
      expect(can('admin', 'events:read')).toBe(true);
      expect(can('front_desk', 'events:read')).toBe(false);
    });
    it('events:write required for POST/PATCH/DELETE /events', () => {
      expect(can('admin', 'events:write')).toBe(true);
      expect(can('front_desk', 'events:write')).toBe(false);
    });

    // Leads routes
    it('leads:read required for GET /leads', () => {
      expect(can('admin', 'leads:read')).toBe(true);
      expect(can('front_desk', 'leads:read')).toBe(false);
    });
    it('leads:write required for POST/PATCH/DELETE /leads', () => {
      expect(can('admin', 'leads:write')).toBe(true);
      expect(can('front_desk', 'leads:write')).toBe(false);
    });

    // Dashboard routes
    it('dashboard:read required for GET /dashboard/stats', () => {
      expect(can('admin', 'dashboard:read')).toBe(true);
      expect(can('front_desk', 'dashboard:read')).toBe(false);
    });

    // AI routes
    it('ai:chat required for POST /ai/chat and conversations', () => {
      expect(can('admin', 'ai:chat')).toBe(true);
      expect(can('front_desk', 'ai:chat')).toBe(true);
      expect(can('trainer', 'ai:chat')).toBe(true);
      expect(can('member', 'ai:chat')).toBe(true);
      expect(can('visitor', 'ai:chat')).toBe(false);
    });
    it('ai:approve required for /ai/pending-actions', () => {
      expect(can('admin', 'ai:approve')).toBe(true);
      expect(can('front_desk', 'ai:approve')).toBe(true);
      expect(can('trainer', 'ai:approve')).toBe(false);
      expect(can('member', 'ai:approve')).toBe(false);
    });
  });
});