-- Default IAM roles, permissions, and role-permission mappings per tenant.
-- Executed within an active tenant transaction where app.tenant_id is set.

INSERT INTO iam.roles (tenant_id, code, display_name)
SELECT current_setting('app.tenant_id')::uuid, role_code, display_name
FROM (
  VALUES
    ('owner', 'Studio Owner'),
    ('admin', 'Studio Admin'),
    ('front_desk', 'Front Desk Staff'),
    ('trainer', 'Trainer'),
    ('member', 'Member'),
    ('visitor', 'Visitor')
) AS default_roles(role_code, display_name)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO iam.permissions (tenant_id, code, description)
SELECT current_setting('app.tenant_id')::uuid, perm_code, perm_desc
FROM (
  VALUES
    ('*', 'Full platform access'),
    ('members:read', 'View member profiles and history'),
    ('members:write', 'Update member profiles'),
    ('memberships:read', 'View member subscription details'),
    ('memberships:write', 'Update member memberships'),
    ('classes:read', 'View class schedules and sessions'),
    ('classes:write', 'Manage class schedules and sessions'),
    ('bookings:read', 'View class bookings and attendance lists'),
    ('bookings:write', 'Create and manage class bookings'),
    ('attendance:read', 'View session attendance records'),
    ('attendance:write', 'Mark session attendance and check-ins'),
    ('payments:read', 'View payment receipts and invoices'),
    ('payments:write', 'Process payments and refunds'),
    ('reports:read', 'View financial and operational reports'),
    ('settings:read', 'View studio configuration settings'),
    ('settings:write', 'Update studio configuration settings'),
    ('staff:read', 'View staff profiles and assignments'),
    ('staff:write', 'Manage staff profiles and assignments'),
    ('feedback:read', 'View customer feedback submissions'),
    ('feedback:write', 'Respond to customer feedback'),
    ('recommendations:read', 'View AI recommendation outputs'),
    ('schedules:read', 'View recurring class schedules'),
    ('schedules:write', 'Manage recurring class schedules'),
    ('webhooks:write', 'Manage outgoing webhooks'),
    ('ai:chat', 'Access AI studio assistant'),
    ('ai:approve', 'Approve AI-suggested operations'),
    ('events:read', 'View studio events and workshops'),
    ('events:write', 'Manage studio events and workshops'),
    ('leads:read', 'View sales and trial leads'),
    ('leads:write', 'Create and update sales leads'),
    ('dashboard:read', 'Access main studio operational dashboard')
) AS default_permissions(perm_code, perm_desc)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Map permissions to roles
INSERT INTO iam.role_permissions (tenant_id, role_id, permission_id)
SELECT
  r.tenant_id,
  r.id,
  p.id
FROM iam.roles r
CROSS JOIN iam.permissions p
JOIN (
  VALUES
    ('owner', '*'),
    ('admin', 'members:read'),
    ('admin', 'members:write'),
    ('admin', 'memberships:read'),
    ('admin', 'memberships:write'),
    ('admin', 'classes:read'),
    ('admin', 'classes:write'),
    ('admin', 'bookings:read'),
    ('admin', 'bookings:write'),
    ('admin', 'attendance:read'),
    ('admin', 'attendance:write'),
    ('admin', 'payments:read'),
    ('admin', 'payments:write'),
    ('admin', 'reports:read'),
    ('admin', 'settings:read'),
    ('admin', 'settings:write'),
    ('admin', 'staff:read'),
    ('admin', 'staff:write'),
    ('admin', 'feedback:read'),
    ('admin', 'feedback:write'),
    ('admin', 'recommendations:read'),
    ('admin', 'schedules:read'),
    ('admin', 'schedules:write'),
    ('admin', 'webhooks:write'),
    ('admin', 'ai:chat'),
    ('admin', 'ai:approve'),
    ('admin', 'events:read'),
    ('admin', 'events:write'),
    ('admin', 'leads:read'),
    ('admin', 'leads:write'),
    ('admin', 'dashboard:read'),
    ('front_desk', 'members:read'),
    ('front_desk', 'members:write'),
    ('front_desk', 'memberships:read'),
    ('front_desk', 'memberships:write'),
    ('front_desk', 'classes:read'),
    ('front_desk', 'bookings:read'),
    ('front_desk', 'bookings:write'),
    ('front_desk', 'attendance:read'),
    ('front_desk', 'attendance:write'),
    ('front_desk', 'payments:read'),
    ('front_desk', 'staff:read'),
    ('front_desk', 'ai:chat'),
    ('front_desk', 'ai:approve'),
    ('front_desk', 'reports:read'),
    ('trainer', 'members:read'),
    ('trainer', 'classes:read'),
    ('trainer', 'bookings:read'),
    ('trainer', 'attendance:read'),
    ('trainer', 'attendance:write'),
    ('trainer', 'ai:chat'),
    ('member', 'members:read'),
    ('member', 'memberships:read'),
    ('member', 'classes:read'),
    ('member', 'bookings:read'),
    ('member', 'bookings:write'),
    ('member', 'attendance:read'),
    ('member', 'payments:read'),
    ('member', 'ai:chat'),
    ('visitor', 'classes:read')
) AS role_mapping(role_code, perm_code)
  ON r.code = role_mapping.role_code
 AND p.code = role_mapping.perm_code
WHERE r.tenant_id = current_setting('app.tenant_id')::uuid
  AND p.tenant_id = current_setting('app.tenant_id')::uuid
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
