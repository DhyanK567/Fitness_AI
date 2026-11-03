-- Studio owners administer all tenant data and must be able to run the
-- authenticated import/export workflow introduced in migration 134.
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
WHERE roles.code = 'owner'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Owners created by the initial onboarding function were scoped to its first
-- studio/branch, while gateway requests currently carry tenant scope. Promote
-- owner assignments to tenant scope so the owner can administer the workspace.
UPDATE iam.user_role_assignments AS assignments
SET studio_id = NULL,
    branch_id = NULL,
    updated_at = now()
FROM iam.roles AS roles
WHERE roles.id = assignments.role_id
  AND roles.tenant_id = assignments.tenant_id
  AND roles.code = 'owner'
  AND (assignments.studio_id IS NOT NULL OR assignments.branch_id IS NOT NULL);
