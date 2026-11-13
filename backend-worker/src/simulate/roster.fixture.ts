import type { TrainerRoster, RosterSession, ClientNote } from '../types/roster.types';
import type { FloorAlertContext } from '../types/floor-alert.types';
import type { HealthProfileInput } from '../services/health-flags.mapper';
import { HEALTH_FLAG_COACHING_NOTES } from '../services/health-flags.mapper';

export const MOCK_TENANT_ID = 'e2b3c4d5-6789-4000-8000-abcdef123456';
export const MOCK_TRAINER_ID = 't1a2b3c4-5678-4000-8000-111122223333';
export const MOCK_TRAINER_NAME = 'Coach Marcus';
export const MOCK_TRAINER_PHONE = '+919876543210';
export const MOCK_ROSTER_DATE = '2026-11-12';

// ---------------------------------------------------------------------------
// Health Profile Fixtures (Task F5 testing)
// ---------------------------------------------------------------------------

export const mockEmptyProfile: HealthProfileInput = {
  fullName: 'Arjun Kapoor',
  firstTimeMember: false,
  kneeInjury: false,
  lowerBackPain: null,
  postSurgery: undefined,
};

export const mockFirstTimerProfile: HealthProfileInput = {
  fullName: 'Priya Sharma',
  firstTimeMember: true,
};

export const mockKneeInjuryProfile: HealthProfileInput = {
  fullName: 'Vikram Rao',
  kneeInjury: true,
};

export const mockLowerBackProfile: HealthProfileInput = {
  fullName: 'Rahul Mehta',
  lowerBackPain: true,
};

export const mockPostSurgeryProfile: HealthProfileInput = {
  fullName: 'Ananya Sen',
  postSurgery: true,
};

export const mockMultiFlagProfile: HealthProfileInput = {
  fullName: 'Deepa Patel',
  firstTimeMember: true,
  kneeInjury: true,
  lowerBackPain: true,
};

// ---------------------------------------------------------------------------
// Client Note Fixtures
// ---------------------------------------------------------------------------

export const mockFirstTimerNote: ClientNote = {
  memberName: 'Priya Sharma',
  kind: 'FIRST_TIMER',
  text: HEALTH_FLAG_COACHING_NOTES.FIRST_TIMER,
};

export const mockKneeInjuryNote: ClientNote = {
  memberName: 'Vikram Rao',
  kind: 'KNEE_INJURY',
  text: HEALTH_FLAG_COACHING_NOTES.KNEE_INJURY,
};

export const mockLowerBackNote: ClientNote = {
  memberName: 'Rahul Mehta',
  kind: 'LOWER_BACK',
  text: 'Recovering from lumbar strain — avoid heavy deadlifts',
};

export const mockPostSurgeryNote: ClientNote = {
  memberName: 'Ananya Sen',
  kind: 'POST_SURGERY',
  text: HEALTH_FLAG_COACHING_NOTES.POST_SURGERY,
};

export const mockMultiFlagNotes: ClientNote[] = [
  {
    memberName: 'Deepa Patel',
    kind: 'FIRST_TIMER',
    text: HEALTH_FLAG_COACHING_NOTES.FIRST_TIMER,
  },
  {
    memberName: 'Deepa Patel',
    kind: 'KNEE_INJURY',
    text: HEALTH_FLAG_COACHING_NOTES.KNEE_INJURY,
  },
  {
    memberName: 'Deepa Patel',
    kind: 'LOWER_BACK',
    text: HEALTH_FLAG_COACHING_NOTES.LOWER_BACK,
  },
];

// ---------------------------------------------------------------------------
// Trainer Roster Fixtures (Task F6 & F18 testing)
// ---------------------------------------------------------------------------

/**
 * 1. Empty roster day (no sessions scheduled)
 */
export const emptyRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: MOCK_TRAINER_NAME,
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [],
};

/**
 * 2. Single-class day
 */
export const singleClassRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: 'Marcus',
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [
    {
      classId: 'class-sc-01',
      startTime: new Date('2026-11-12T01:30:00.000Z'), // 07:00 AM IST
      className: 'Strength & Conditioning',
      roomName: 'Main Floor',
      confirmed: 8,
      capacity: 15,
      soldOut: false,
      notes: [],
    },
  ],
};

/**
 * 3. Multiple-class day (Matches Cycle 2 B2B Execution Guide sample)
 */
export const multipleClassRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: 'Marcus',
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [
    {
      classId: 'class-mc-01',
      startTime: new Date('2026-11-12T01:30:00.000Z'), // 07:00 AM IST
      className: 'Strength & Conditioning',
      roomName: 'Main Floor',
      confirmed: 12,
      capacity: 15,
      soldOut: false,
      notes: [mockFirstTimerNote, mockLowerBackNote],
    },
    {
      classId: 'class-mc-02',
      startTime: new Date('2026-11-12T12:00:00.000Z'), // 05:30 PM IST
      className: 'Core & Mobility',
      roomName: 'Studio B',
      confirmed: 18,
      capacity: 18,
      soldOut: true,
      notes: [],
    },
  ],
};

/**
 * 4. Sold-out class day
 */
export const soldOutClassRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: 'Coach Marcus',
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [
    {
      classId: 'class-so-01',
      startTime: new Date('2026-11-12T12:30:00.000Z'), // 06:00 PM IST
      className: 'HIIT Extreme',
      roomName: 'Main Floor',
      confirmed: 20,
      capacity: 20,
      soldOut: true,
      notes: [],
    },
  ],
};

/**
 * 5. First-time member roster
 */
export const firstTimerRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: 'Coach Marcus',
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [
    {
      classId: 'class-ft-01',
      startTime: new Date('2026-11-12T02:30:00.000Z'), // 08:00 AM IST
      className: 'Beginner Bootcamp',
      roomName: 'Studio A',
      confirmed: 5,
      capacity: 12,
      soldOut: false,
      notes: [mockFirstTimerNote],
    },
  ],
};

/**
 * 6. Knee injury roster
 */
export const kneeInjuryRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: 'Coach Marcus',
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [
    {
      classId: 'class-ki-01',
      startTime: new Date('2026-11-12T03:30:00.000Z'), // 09:00 AM IST
      className: 'Leg Day Blast',
      roomName: 'Weight Room',
      confirmed: 10,
      capacity: 12,
      soldOut: false,
      notes: [mockKneeInjuryNote],
    },
  ],
};

/**
 * 7. Lower-back condition roster
 */
export const lowerBackRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: 'Coach Marcus',
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [
    {
      classId: 'class-lb-01',
      startTime: new Date('2026-11-12T04:30:00.000Z'), // 10:00 AM IST
      className: 'Deadlift & Posterior Chain',
      roomName: 'Power Zone',
      confirmed: 7,
      capacity: 10,
      soldOut: false,
      notes: [mockLowerBackNote],
    },
  ],
};

/**
 * 8. Post-surgery roster
 */
export const postSurgeryRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: 'Coach Marcus',
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [
    {
      classId: 'class-ps-01',
      startTime: new Date('2026-11-12T05:30:00.000Z'), // 11:00 AM IST
      className: 'Gentle Mobility',
      roomName: 'Studio C',
      confirmed: 6,
      capacity: 10,
      soldOut: false,
      notes: [mockPostSurgeryNote],
    },
  ],
};

/**
 * 9. Member with multiple health flags roster
 */
export const multiFlagMemberRoster: TrainerRoster = {
  tenantId: MOCK_TENANT_ID,
  trainerId: MOCK_TRAINER_ID,
  trainerName: 'Coach Marcus',
  phone: MOCK_TRAINER_PHONE,
  date: MOCK_ROSTER_DATE,
  sessions: [
    {
      classId: 'class-mf-01',
      startTime: new Date('2026-11-12T01:30:00.000Z'), // 07:00 AM IST
      className: 'Functional Fitness',
      roomName: 'Main Floor',
      confirmed: 11,
      capacity: 15,
      soldOut: false,
      notes: mockMultiFlagNotes,
    },
  ],
};

// ---------------------------------------------------------------------------
// Floor Alert Context Fixtures (Task F8 testing)
// ---------------------------------------------------------------------------

export const mockSurge90AlertContext: FloorAlertContext = {
  tenantId: MOCK_TENANT_ID,
  classId: 'class-surge-01',
  type: 'SURGE_90',
  className: 'HIIT',
  startTime: '06:00 PM',
  booked: 19,
  capacity: 20,
  occupancyPct: 95,
};

export const mockFull100AlertContext: FloorAlertContext = {
  tenantId: MOCK_TENANT_ID,
  classId: 'class-full-01',
  type: 'FULL_100',
  className: 'Spin Revolution',
  startTime: '07:00 PM',
  booked: 25,
  capacity: 25,
  occupancyPct: 100,
};

export const mockLowAttendanceAlertContext: FloorAlertContext = {
  tenantId: MOCK_TENANT_ID,
  classId: 'class-low-01',
  type: 'LOW_ATTENDANCE',
  className: 'Sunrise Yoga',
  startTime: '06:00 AM',
  booked: 2,
  capacity: 20,
  minutesUntilStart: 240,
};
