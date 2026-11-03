import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { StaffAccessGuard } from '../common/staff-access.guard';

const PUBLIC_SETTING_KEYS = new Set(['landing_page_config']);

@Injectable()
export class SettingReadGuard implements CanActivate {
  constructor(private readonly staffGuard: StaffAccessGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = request.params?.key;
    if (key && PUBLIC_SETTING_KEYS.has(key)) {
      return true;
    }
    return this.staffGuard.canActivate(context);
  }
}
