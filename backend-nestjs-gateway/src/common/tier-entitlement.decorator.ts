import { SetMetadata } from '@nestjs/common';
import type { TierCode } from './tier-entitlements';

export const REQUIRED_TIER = 'fitness-ai:required-tier';
export const REQUIRED_ROLES = 'fitness-ai:required-roles';

export const RequireTier = (tier: TierCode) => SetMetadata(REQUIRED_TIER, tier);
export const RequireAnyRole = (...roles: string[]) => SetMetadata(REQUIRED_ROLES, roles);
