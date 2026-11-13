import type { ClientNote } from '../types/roster.types';

/**
 * Standard Coaching Notes for Health and Injury Flags (Task F5)
 *
 * Provides actionable movement modification guidance for trainers.
 * Reference: B2B Cycle 2 Execution Guide & Team Work Distribution (Page 7).
 */
export const HEALTH_FLAG_COACHING_NOTES = {
  FIRST_TIMER: 'First-timer, introduce gym layout',
  KNEE_INJURY: 'Knee injury: avoid or modify exercises that strain the knee',
  LOWER_BACK: 'Lower-back condition: avoid heavy deadlifts and adapt exercises',
  POST_SURGERY: 'Post-surgery: follow appropriate recovery-related coaching precautions',
} as const;

export type HealthFlagKind = keyof typeof HEALTH_FLAG_COACHING_NOTES;

/**
 * Polymorphic health profile input interface.
 * Supports camelCase (Prisma StudioMember model) and snake_case (raw queries / API payloads).
 */
export interface HealthProfileInput {
  fullName?: string | null;
  full_name?: string | null;
  name?: string | null;
  memberName?: string | null;

  firstTimeMember?: boolean | null;
  first_time_member?: boolean | null;

  kneeInjury?: boolean | null;
  knee_injury?: boolean | null;

  lowerBackPain?: boolean | null;
  lower_back_pain?: boolean | null;

  postSurgery?: boolean | null;
  post_surgery?: boolean | null;

  [key: string]: unknown;
}

/**
 * Maps a member's medical and onboarding flags to actionable ClientNote objects.
 *
 * Features:
 * - Tri-state boolean evaluation (only strictly true emits notes; false/null/undefined skipped)
 * - Supports both camelCase and snake_case field conventions
 * - Supports single and multiple health flags per member
 * - Safe null/undefined profile handling
 *
 * @param profile - Member profile containing health flags and name
 * @returns Array of ClientNote objects
 */
export function mapHealthFlags(profile?: HealthProfileInput | null): ClientNote[] {
  if (!profile || typeof profile !== 'object') {
    return [];
  }

  const memberName =
    profile.fullName ||
    profile.full_name ||
    profile.name ||
    profile.memberName ||
    'Member';

  const notes: ClientNote[] = [];

  // 1. First-time member check
  const isFirstTimer =
    profile.firstTimeMember === true || profile.first_time_member === true;
  if (isFirstTimer) {
    notes.push({
      memberName,
      kind: 'FIRST_TIMER',
      text: HEALTH_FLAG_COACHING_NOTES.FIRST_TIMER,
    });
  }

  // 2. Knee injury check
  const hasKneeInjury =
    profile.kneeInjury === true || profile.knee_injury === true;
  if (hasKneeInjury) {
    notes.push({
      memberName,
      kind: 'KNEE_INJURY',
      text: HEALTH_FLAG_COACHING_NOTES.KNEE_INJURY,
    });
  }

  // 3. Lower-back pain check
  const hasLowerBackPain =
    profile.lowerBackPain === true || profile.lower_back_pain === true;
  if (hasLowerBackPain) {
    notes.push({
      memberName,
      kind: 'LOWER_BACK',
      text: HEALTH_FLAG_COACHING_NOTES.LOWER_BACK,
    });
  }

  // 4. Post-surgery check
  const hasPostSurgery =
    profile.postSurgery === true || profile.post_surgery === true;
  if (hasPostSurgery) {
    notes.push({
      memberName,
      kind: 'POST_SURGERY',
      text: HEALTH_FLAG_COACHING_NOTES.POST_SURGERY,
    });
  }

  return notes;
}
