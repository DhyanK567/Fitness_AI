import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION = 'fitness-ai:required-permission';
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION, permission);
