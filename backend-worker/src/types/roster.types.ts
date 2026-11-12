/**
 * Shared Roster Types Contract (Member A)
 *
 * Defines the core data structures for the Trainer Morning Roster pipeline (Task 2.3).
 * Shared across:
 * - Member A: TrainerRosterScheduler, TrainerRosterService (buildRosters)
 * - Member B: Roster Delivery & Outbox (enqueueRosterBriefing)
 * - Member C: Message Formatter (formatTrainerBriefing), Health Flag Mapper, Simulation
 *
 * Reference: B2B Cycle 2 Work Distribution Guide (Section 6, Page 9)
 */

export type ClientNote = {
  memberName: string;
  kind:
    | 'FIRST_TIMER'
    | 'KNEE_INJURY'
    | 'LOWER_BACK'
    | 'POST_SURGERY';
  text?: string;
};

export type RosterSession = {
  classId: string;
  startTime: Date;
  className: string;
  roomName: string;
  confirmed: number;
  capacity: number;
  soldOut: boolean;
  notes: ClientNote[];
};

export type TrainerRoster = {
  tenantId: string;
  trainerId: string;
  trainerName: string;
  phone: string;
  date: string; /* YYYY-MM-DD, IST */
  sessions: RosterSession[];
};
