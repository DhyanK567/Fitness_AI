import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

export const RequirePermission = (...permissions: string[]) => SetMetadata('permissions', permissions);