import {
  formatTrainerBriefing,
  getSessionCategoryIcon,
  formatSessionTime,
  formatRosterDate,
} from './trainer-briefing.formatter';
import {
  emptyRoster,
  singleClassRoster,
  multipleClassRoster,
  soldOutClassRoster,
  firstTimerRoster,
  multiFlagMemberRoster,
} from '../simulate/roster.fixture';

describe('Trainer Briefing Formatter (Task F6)', () => {
  describe('Helper Functions', () => {
    it('should assign correct category icons based on class name', () => {
      expect(getSessionCategoryIcon('Sunrise Yoga')).toBe('🧘');
      expect(getSessionCategoryIcon('Core & Mobility')).toBe('🧘');
      expect(getSessionCategoryIcon('Pilates Mat')).toBe('🧘');
      expect(getSessionCategoryIcon('HIIT Blast')).toBe('🥊');
      expect(getSessionCategoryIcon('Boxing Conditioning')).toBe('🥊');
      expect(getSessionCategoryIcon('Spin Revolution')).toBe('🚴');
      expect(getSessionCategoryIcon('Treadmill Interval Run')).toBe('🏃');
      expect(getSessionCategoryIcon('Strength & Conditioning')).toBe('🏋️');
      expect(getSessionCategoryIcon('Unknown Class')).toBe('🏋️');
    });

    it('should format session times to 12-hour AM/PM in IST', () => {
      const utcMorning = new Date('2026-11-12T01:30:00.000Z'); // 07:00 AM IST
      const utcEvening = new Date('2026-11-12T12:00:00.000Z'); // 05:30 PM IST

      expect(formatSessionTime(utcMorning)).toBe('07:00 AM');
      expect(formatSessionTime(utcEvening)).toBe('05:30 PM');
      expect(formatSessionTime('18:00')).toBe('06:00 PM');
      expect(formatSessionTime('07:30 AM')).toBe('07:30 AM');
    });

    it('should format YYYY-MM-DD IST calendar strings to weekday and short month', () => {
      expect(formatRosterDate('2026-11-12')).toBe('Thursday, Nov 12');
    });
  });

  describe('formatTrainerBriefing', () => {
    it('should return empty string for empty roster days', () => {
      expect(formatTrainerBriefing(emptyRoster)).toBe('');
      expect(formatTrainerBriefing({ ...emptyRoster, sessions: [] })).toBe('');
    });

    it('should format a single-class roster without notes', () => {
      const briefing = formatTrainerBriefing(singleClassRoster);

      expect(briefing).toContain('🌅 Good morning Coach Marcus! Here is your schedule for today (Thursday, Nov 12):');
      expect(briefing).toContain('🏋️ Session 1: 07:00 AM - Strength & Conditioning (Main Floor)');
      expect(briefing).toContain('👥 Attendance: 8/15 Confirmed');
      expect(briefing).not.toContain('⚠️ Important Client Notes:');
      expect(briefing).toContain('Have a high-energy day on the floor!');
    });

    it('should format a sold-out class with (SOLD OUT) indicator', () => {
      const briefing = formatTrainerBriefing(soldOutClassRoster);

      expect(briefing).toContain('🥊 Session 1: 06:00 PM - HIIT Extreme (Main Floor)');
      expect(briefing).toContain('👥 Attendance: 20/20 (SOLD OUT)');
      expect(briefing).not.toContain('Confirmed');
    });

    it('should format multiple sessions with Important Client Notes block', () => {
      const briefing = formatTrainerBriefing(multipleClassRoster);

      expect(briefing).toContain('Session 1: 07:00 AM - Strength & Conditioning (Main Floor)');
      expect(briefing).toContain('👥 Attendance: 12/15 Confirmed');
      expect(briefing).toContain('⚠️ Important Client Notes:');
      expect(briefing).toContain('• Priya Sharma (First-timer, introduce gym layout)');
      expect(briefing).toContain('• Rahul Mehta (Recovering from lumbar strain — avoid heavy deadlifts)');
      expect(briefing).toContain('Session 2: 05:30 PM - Core & Mobility (Studio B)');
      expect(briefing).toContain('👥 Attendance: 18/18 (SOLD OUT)');
      expect(briefing).toContain('Have a high-energy day on the floor!');
    });

    it('should omit Important Client Notes block if a session has no notes', () => {
      const briefing = formatTrainerBriefing(singleClassRoster);
      expect(briefing).not.toContain('⚠️ Important Client Notes:');
      expect(briefing).not.toContain('•');
    });

    it('should format multiple health notes for a single member', () => {
      const briefing = formatTrainerBriefing(multiFlagMemberRoster);

      expect(briefing).toContain('⚠️ Important Client Notes:');
      expect(briefing).toContain('• Deepa Patel (First-timer, introduce gym layout)');
      expect(briefing).toContain('• Deepa Patel (Knee injury: avoid or modify exercises that strain the knee)');
      expect(briefing).toContain('• Deepa Patel (Lower-back condition: avoid heavy deadlifts and adapt exercises)');
    });

    it('should handle trainer names that already include "Coach"', () => {
      const roster = {
        ...singleClassRoster,
        trainerName: 'Coach Sarah',
      };
      const briefing = formatTrainerBriefing(roster);
      expect(briefing).toContain('Good morning Coach Sarah!');
      expect(briefing).not.toContain('Coach Coach');
    });
  });

  describe('Snapshots', () => {
    it('matches snapshot for single-class day', () => {
      expect(formatTrainerBriefing(singleClassRoster)).toMatchSnapshot();
    });

    it('matches snapshot for multiple-class day', () => {
      expect(formatTrainerBriefing(multipleClassRoster)).toMatchSnapshot();
    });

    it('matches snapshot for sold-out class day', () => {
      expect(formatTrainerBriefing(soldOutClassRoster)).toMatchSnapshot();
    });
  });
});
