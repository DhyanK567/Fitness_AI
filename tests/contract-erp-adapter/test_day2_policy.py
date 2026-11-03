from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_day2_policy_uses_tenant_database_grants_and_defaults_to_deny():
    source = (ROOT / "backend-nestjs-gateway" / "src" / "platform" / "roles-permissions" / "policy.service.ts").read_text(encoding="utf-8")
    guard = (ROOT / "backend-nestjs-gateway" / "src" / "common" / "staff-access.guard.ts").read_text(encoding="utf-8")
    seed = (ROOT / "backend-nestjs-gateway" / "prisma" / "seeds" / "tenant-iam-defaults.sql").read_text(encoding="utf-8")
    for role in ("owner", "admin", "front_desk", "trainer", "member", "visitor"):
        assert f"'{role}'" in seed
    assert "withTenant(context.tenantId" in source
    assert "tx.rolePermission.findMany" in source
    assert "tx.permissionGrant.findMany" in source
    assert "studioId: null, branchId: null" in source
    assert "resourceType: null" in source and "resourceRef: null" in source
    assert "access.permissions.has('*') || access.permissions.has(requiredPermission)" in source
    assert "if (!access) throw new UnauthorizedException" in guard
    assert "this.policy.allows(access, permission)" in guard
