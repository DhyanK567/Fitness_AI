import { SetMetadata } from '@nestjs/common';

export const ALLOW_MFA_ENROLLMENT = 'fitness-ai:allow-mfa-enrollment';

/**
 * Marks a handler as reachable with a forced-MFA enrollment token
 * (`scope: 'mfa_enroll'`). Every other guarded handler rejects such tokens.
 */
export const AllowMfaEnrollment = () => SetMetadata(ALLOW_MFA_ENROLLMENT, true);
