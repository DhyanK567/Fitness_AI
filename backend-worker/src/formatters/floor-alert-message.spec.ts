import {
  buildFloorAlertMessage,
  formatAlertTime,
  FLOOR_ALERT_TEMPLATES,
  FLOOR_ALERT_TEMPLATE_STRINGS,
} from './floor-alert-message';
import {
  mockSurge90AlertContext,
  mockFull100AlertContext,
  mockLowAttendanceAlertContext,
} from '../simulate/roster.fixture';
import type { FloorAlertContext } from '../types/floor-alert.types';

describe('Floor Alert Message Builder (Task F8)', () => {
  describe('Helper Functions', () => {
    it('should format Date objects to 12-hour AM/PM in IST', () => {
      const eveningDate = new Date('2026-11-12T12:30:00.000Z'); // 06:00 PM IST
      expect(formatAlertTime(eveningDate)).toBe('06:00 PM');
    });

    it('should format 24-hour time strings to 12-hour AM/PM', () => {
      expect(formatAlertTime('18:00')).toBe('06:00 PM');
      expect(formatAlertTime('06:30')).toBe('06:30 AM');
      expect(formatAlertTime('06:00 PM')).toBe('06:00 PM');
    });
  });

  describe('Template Constants', () => {
    it('should expose canonical raw string templates', () => {
      expect(FLOOR_ALERT_TEMPLATE_STRINGS.SURGE_90).toContain('Capacity Surge:');
      expect(FLOOR_ALERT_TEMPLATE_STRINGS.FULL_100).toContain('Class Full:');
      expect(FLOOR_ALERT_TEMPLATE_STRINGS.LOW_ATTENDANCE).toContain('Low Attendance:');
    });
  });

  describe('buildFloorAlertMessage', () => {
    it('should build SURGE_90 message matching the guide exactly (Scenario 7: 95% occupancy)', () => {
      const msg = buildFloorAlertMessage(mockSurge90AlertContext);

      expect(msg).toBe(
        'Capacity Surge: HIIT at 06:00 PM is now 95% full (19/20 spots).\nPrepare additional equipment.',
      );
    });

    it('should calculate percentage automatically when occupancyPct is omitted', () => {
      const ctx: FloorAlertContext = {
        tenantId: 'tenant-1',
        classId: 'class-1',
        type: 'SURGE_90',
        className: 'Power Yoga',
        startTime: '17:00',
        booked: 9,
        capacity: 10,
      };

      const msg = buildFloorAlertMessage(ctx);
      expect(msg).toBe(
        'Capacity Surge: Power Yoga at 05:00 PM is now 90% full (9/10 spots).\nPrepare additional equipment.',
      );
    });

    it('should build FULL_100 message with waitlist advice (Scenario 8: 100% full)', () => {
      const msg = buildFloorAlertMessage(mockFull100AlertContext);

      expect(msg).toBe(
        'Class Full: Spin Revolution at 07:00 PM is now 100% full (25/25).\nConsider opening a waitlist.',
      );
    });

    it('should build LOW_ATTENDANCE message with 4-hour warning (Scenario 9: fewer than 3 bookings)', () => {
      const msg = buildFloorAlertMessage(mockLowAttendanceAlertContext);

      expect(msg).toBe(
        'Low Attendance: Sunrise Yoga at 06:00 AM has only 2 booking(s) and starts in 4 hours.\nLaunch an instant waitlist push or confirm trainer availability.',
      );
    });

    it('should support LOW_ATTENDANCE_4H alias for low-attendance cron events', () => {
      const ctx: FloorAlertContext = {
        ...mockLowAttendanceAlertContext,
        type: 'LOW_ATTENDANCE_4H',
      };

      const msg = buildFloorAlertMessage(ctx);
      expect(msg).toContain('Low Attendance: Sunrise Yoga at 06:00 AM has only 2 booking(s) and starts in 4 hours.');
      expect(msg).toContain('Launch an instant waitlist push or confirm trainer availability.');
    });

    it('should throw an error for unsupported alert types', () => {
      const invalidCtx = {
        ...mockSurge90AlertContext,
        type: 'INVALID_TYPE' as any,
      };

      expect(() => buildFloorAlertMessage(invalidCtx)).toThrow('Unsupported floor alert type: INVALID_TYPE');
    });

    it('should throw an error if context is null or undefined', () => {
      expect(() => buildFloorAlertMessage(null as any)).toThrow('FloorAlertContext is required');
    });
  });
});
