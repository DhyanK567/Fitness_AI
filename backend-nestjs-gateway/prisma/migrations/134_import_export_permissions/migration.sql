-- ============================================================
-- 134: Import/Export RBAC Permissions
-- Renumbered from 140 to sequence after 133_studio_domain_models.
-- Grants import:read and import:write to admin and front_desk.
-- ============================================================

INSERT INTO iam.permissions (tenant_id, code, description)
SELECT tenants.id, permissions.code, permissions.description
FROM platform.tenants AS tenants
CROSS JOIN (
  VALUES
    ('import:read', 'Export tenant-scoped studio datasets'),
    ('import:write', 'Import tenant-scoped studio datasets')
) AS permissions(code, description)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO iam.role_permissions (tenant_id, role_id, permission_id)
SELECT roles.tenant_id, roles.id, permissions.id
FROM iam.roles AS roles
JOIN iam.permissions AS permissions
  ON permissions.tenant_id = roles.tenant_id
 AND permissions.code IN ('import:read', 'import:write')
WHERE roles.code IN ('admin', 'front_desk')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
