export type StaffRole = 'owner' | 'admin' | 'front_desk' | 'staff' | 'trainer' | 'coach' | 'lead_trainer' | 'biller' | 'accountant' | 'member' | 'visitor';

const permissions: Record<StaffRole, ReadonlySet<string>> = {
  owner: new Set(['*']),
  admin: new Set([
    'members:read', 'members:write', 'members:create', 'members:assign',
    'memberships:read', 'memberships:write', 'memberships:create',
    'classes:read', 'classes:write', 'classes:create',
    'bookings:read', 'bookings:write', 'bookings:create',
    'attendance:read', 'attendance:write', 'attendance:create',
    'payments:read', 'payments:write', 'payments:create',
    'reports:read',
    'settings:read', 'settings:write',
    'staff:read', 'staff:write',
    'feedback:read', 'feedback:write',
    'recommendations:read',
    'schedules:read', 'schedules:write',
    'webhooks:write',
    'ai:chat', 'ai:approve', 'ai:query', 'audit:read',
    'events:read', 'events:write',
    'leads:read', 'leads:write',
    'pipeline:read', 'pipeline:write',
    'dashboard:read',
    'import:read', 'import:write',
    'operations:read', 'operations:write',
    'equipment:read', 'equipment:write',
    'facility:read',
    'growth:read', 'growth:write',
    'marketing:read', 'marketing:write',
    'referral:read', 'referral:write',
    'campaigns:read', 'campaigns:write',
    'retention:read', 'retention:write',
    'knowledge_base:read', 'knowledge_base:write',
  ]),
  front_desk: new Set([
    'members:read', 'members:write', 'members:create',
    'memberships:read', 'memberships:write', 'memberships:create',
    'classes:read',
    'bookings:read', 'bookings:write', 'bookings:create',
    'attendance:read', 'attendance:write', 'attendance:create',
    'payments:read',
    'staff:read',
    'reports:read',
    'ai:chat', 'ai:approve', 'ai:query',
    'import:read', 'import:write',
    'retention:read',
    'knowledge_base:read',
  ]),
  staff: new Set([
    'members:read', 'members:write',
    'memberships:read', 'memberships:write',
    'classes:read',
    'bookings:read', 'bookings:write',
    'attendance:read', 'attendance:write',
    'staff:read',
    'reports:read',
    'ai:chat', 'ai:approve', 'ai:query',
  ]),
  trainer: new Set([
    'members:read',
    'classes:read',
    'bookings:read',
    'attendance:read', 'attendance:write', 'attendance:create',
    'ai:chat',
    'operations:read',
  ]),
  coach: new Set(['members:read', 'classes:read', 'bookings:read', 'attendance:read', 'attendance:write', 'feedback:read', 'feedback:write']),
  lead_trainer: new Set(['members:read', 'members:assign', 'classes:read', 'bookings:read', 'attendance:read', 'attendance:write', 'feedback:read', 'feedback:write', 'staff:read']),
  biller: new Set(['payments:read', 'payments:write', 'reports:read']),
  accountant: new Set(['payments:read', 'payments:write', 'reports:read']),
  member: new Set([
    'members:read', 'memberships:read', 'classes:read',
    'bookings:read', 'bookings:write', 'bookings:create',
    'attendance:read', 'payments:read',
    'events:read',
    'recommendations:read',
    'feedback:submit',
    'own.schedule.read', 'own.profile.read', 'own.membership.read', 'own.attendance.read',
    'ai:chat',
    'knowledge_base:read',
  ]),
  visitor: new Set([
    'classes:read',
    'events:read',
  ]),
};

export function can(role: string, permission: string): boolean {
  const granted = permissions[role as StaffRole];
  if (!granted) return false;
  if (granted.has('*') || granted.has(permission)) return true;
  const normalized = permission.includes('.') ? permission.replace(/\./g, ':') : permission;
  if (granted.has(normalized)) return true;
  if (permission === 'ai:query' && granted.has('ai:chat')) return true;
  if (permission.endsWith(':create') && granted.has(permission.replace(':create', ':write'))) return true;
  return false;
}

/**
 * Get all permissions for a role (for testing/debugging)
 */
export function getPermissionsForRole(role: StaffRole): ReadonlySet<string> {
  return permissions[role];
}
