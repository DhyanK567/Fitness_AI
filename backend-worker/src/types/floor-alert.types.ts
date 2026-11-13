/**
 * Shared Floor Alert Types Contract (Member B / C)
 *
 * Defines the core data structures for Studio Floor Capacity & Low-Attendance Alerts (Task 2.4).
 * Shared across:
 * - Member B: FloorAlertService, StudioCapacityScheduler
 * - Member C: Floor Alert Message Builder (buildFloorAlertMessage)
 *
 * Reference: B2B Cycle 2 Work Distribution Guide (Section 6, Page 9)
 */

export const FLOOR_ALERT_TYPES = {
  SURGE_90: 'SURGE_90',
  FULL_100: 'FULL_100',
  LOW_ATTENDANCE: 'LOW_ATTENDANCE',
  LOW_ATTENDANCE_4H: 'LOW_ATTENDANCE_4H',
} as const;

export type FloorAlertType =
  | 'SURGE_90'
  | 'FULL_100'
  | 'LOW_ATTENDANCE'
  | 'LOW_ATTENDANCE_4H';

export interface FloorAlertContext {
  tenantId: string;
  classId: string;
  type: FloorAlertType;
  className: string;
  startTime: Date | string;
  booked: number;
  capacity: number;
  occupancyPct?: number;
  waitlisted?: number;
  roomName?: string | null;
  trainerName?: string | null;
  minutesUntilStart?: number;
  [key: string]: unknown;
}

export type FloorAlert = FloorAlertContext & {
  message: string;
  dedupKey: string;
};
