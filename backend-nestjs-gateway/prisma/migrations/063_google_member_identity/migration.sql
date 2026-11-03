CREATE UNIQUE INDEX uq_auth_identities_tenant_user_provider
  ON iam.auth_identities (tenant_id, user_id, provider);
