import { formatTrainerBriefing } from '../formatters/trainer-briefing.formatter';
import { mapHealthFlags } from '../services/health-flags.mapper';
import {
  multipleClassRoster,
  mockMultiFlagProfile,
  MOCK_TENANT_ID,
  MOCK_TRAINER_ID,
  MOCK_ROSTER_DATE,
} from './roster.fixture';
import type { TrainerRoster, RosterSession } from '../types/roster.types';

describe('Multiple Classes & Medical Flags Integration (Scenario 3 & 5)', () => {
  it('should format an end-to-end multi-class schedule matching the Cycle 2 B2B execution specification', () => {
    // End-to-end text verification on multiple-class schedule
    const text = formatTrainerBriefing(multipleClassRoster);

    // 1. Header greeting
    expect(text).toContain('🌅 Good morning Coach Marcus! Here is your schedule for today (Thursday, Nov 12):');

    // 2. Session 1 details
    expect(text).toContain('🏋️ Session 1: 07:00 AM - Strength & Conditioning (Main Floor)');
    expect(text).toContain('👥 Attendance: 12/15 Confirmed');

    // 3. Client injury and medical flags in Session 1
    expect(text).toContain('⚠️ Important Client Notes:');
    expect(text).toContain('• Priya Sharma (First-timer, introduce gym layout)');
    expect(text).toContain('• Rahul Mehta (Recovering from lumbar strain — avoid heavy deadlifts)');

    // 4. Session 2 details with sold-out badge
    expect(text).toContain('🧘 Session 2: 05:30 PM - Core & Mobility (Studio B)');
    expect(text).toContain('👥 Attendance: 18/18 (SOLD OUT)');

    // 5. High-energy closing line
    expect(text).toContain('Have a high-energy day on the floor!');
  });

  it('should integrate health-flags mapper output directly into a multi-class briefing pipeline', () => {
    // Simulate mapper -> notes -> session -> roster -> briefing end-to-end flow
    const memberNotes = mapHealthFlags(mockMultiFlagProfile);
    expect(memberNotes.length).toBeGreaterThanOrEqual(3);

    const sessionWithMappedNotes: RosterSession = {
      classId: 'int-class-01',
      startTime: new Date('2026-11-12T04:30:00.000Z'), // 10:00 AM IST
      className: 'Pilates Reformer',
      roomName: 'Studio Reform',
      confirmed: 10,
      capacity: 12,
      soldOut: false,
      notes: memberNotes,
    };

    const integratedRoster: TrainerRoster = {
      tenantId: MOCK_TENANT_ID,
      trainerId: MOCK_TRAINER_ID,
      trainerName: 'Coach Marcus',
      phone: '+919876543210',
      date: MOCK_ROSTER_DATE,
      sessions: [sessionWithMappedNotes],
    };

    const briefing = formatTrainerBriefing(integratedRoster);

    expect(briefing).toContain('🧘 Session 1: 10:00 AM - Pilates Reformer (Studio Reform)');
    expect(briefing).toContain('👥 Attendance: 10/12 Confirmed');
    expect(briefing).toContain('⚠️ Important Client Notes:');
    expect(briefing).toContain('• Deepa Patel (First-timer, introduce gym layout)');
    expect(briefing).toContain('• Deepa Patel (Knee injury: avoid or modify exercises that strain the knee)');
    expect(briefing).toContain('• Deepa Patel (Lower-back condition: avoid heavy deadlifts and adapt exercises)');
  });
});
