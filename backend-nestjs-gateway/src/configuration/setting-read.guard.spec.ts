import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { SettingReadGuard } from './setting-read.guard';
import { StaffAccessGuard } from '../common/staff-access.guard';

function createMockExecutionContext(params: Record<string, string>, headers: Record<string, string> = {}) {
  const request = {
    params,
    headers,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('SettingReadGuard', () => {
  it('allows unauthenticated read for public setting keys (landing_page_config)', async () => {
    const canActivateMock = jest.fn(async () => false);
    const mockStaffGuard = { canActivate: canActivateMock };
    const guard = new SettingReadGuard(mockStaffGuard as unknown as StaffAccessGuard);

    const context = createMockExecutionContext({ key: 'landing_page_config' });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(canActivateMock).not.toHaveBeenCalled();
  });

  it('delegates to StaffAccessGuard for non-public keys and grants access when staff token is valid', async () => {
    const canActivateMock = jest.fn(async (_ctx: ExecutionContext) => true);
    const mockStaffGuard = { canActivate: canActivateMock };
    const guard = new SettingReadGuard(mockStaffGuard as unknown as StaffAccessGuard);

    const context = createMockExecutionContext(
      { key: 'operational_thresholds' },
      { authorization: 'Bearer valid-staff-token' }
    );
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(canActivateMock).toHaveBeenCalledWith(context);
  });

  it('rejects access to non-public keys when staff token is missing or invalid', async () => {
    const canActivateMock = jest.fn(async (_ctx: ExecutionContext) => {
      throw new UnauthorizedException('A staff access token is required');
    });
    const mockStaffGuard = { canActivate: canActivateMock };
    const guard = new SettingReadGuard(mockStaffGuard as unknown as StaffAccessGuard);

    const context = createMockExecutionContext({ key: 'secret_config' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(canActivateMock).toHaveBeenCalledWith(context);
  });
});
