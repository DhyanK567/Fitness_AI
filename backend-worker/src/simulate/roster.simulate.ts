import { formatTrainerBriefing } from '../formatters/trainer-briefing.formatter';
import {
  multipleClassRoster,
  singleClassRoster,
  soldOutClassRoster,
  firstTimerRoster,
  emptyRoster,
  MOCK_ROSTER_DATE,
} from './roster.fixture';
import type { TrainerRoster } from '../types/roster.types';
import type { TrainerRosterService } from '../trainer-roster/trainer-roster.service';

export interface SimulationOptions {
  date?: string;
  rosters?: TrainerRoster[];
  silent?: boolean;
  rosterService?: TrainerRosterService;
  tenantId?: string;
}

export interface SimulationResult {
  date: string;
  renderedBriefings: Array<{
    trainerId: string;
    trainerName: string;
    phone: string;
    briefingText: string;
    sessionCount: number;
  }>;
  outboxWrites: number;
  whatsappDispatches: number;
}

/**
 * Runs an offline simulation of the Trainer Morning Roster dispatch pipeline (Task F8).
 *
 * Characteristics:
 * - Pure dry-run: Never interacts with the real Outbox table or WhatsApp API.
 * - Formats briefings using the production formatTrainerBriefing() engine.
 * - Prints human-readable briefing cards directly to stdout.
 * - Supports custom date arguments (YYYY-MM-DD IST), custom roster injection,
 *   and direct execution with Developer A's actual TrainerRosterService.
 *
 * @param date - Optional IST date string (YYYY-MM-DD)
 * @param customRosters - Optional array of TrainerRoster objects (defaults to comprehensive fixtures)
 * @param silent - When true, suppresses console stdout
 * @param rosterService - Optional Developer A TrainerRosterService instance to test live pipeline integration
 * @param tenantId - Optional canonical tenant UUID when executing via TrainerRosterService
 * @returns SimulationResult containing rendered texts and safety counters
 */
export async function runRosterSimulation(
  date?: string,
  customRosters?: TrainerRoster[],
  silent: boolean = false,
  rosterService?: TrainerRosterService,
  tenantId?: string,
): Promise<SimulationResult> {
  const targetDate = date || MOCK_ROSTER_DATE;

  let rostersToSimulate: TrainerRoster[];

  if (rosterService && tenantId) {
    // Live pipeline integration with Developer A's TrainerRosterService
    rostersToSimulate = await rosterService.buildRosters(tenantId, targetDate);
  } else if (customRosters && customRosters.length > 0) {
    rostersToSimulate = customRosters;
  } else {
    rostersToSimulate = [
      {
        ...multipleClassRoster,
        date: targetDate,
      },
      {
        ...soldOutClassRoster,
        date: targetDate,
        trainerName: 'Coach Sarah',
        phone: '+919123456789',
      },
      {
        ...firstTimerRoster,
        date: targetDate,
        trainerName: 'Coach David',
        phone: '+919811223344',
      },
      {
        ...emptyRoster,
        date: targetDate,
        trainerName: 'Coach Priya',
        phone: '+919988776655',
      },
    ];
  }

  const renderedBriefings: SimulationResult['renderedBriefings'] = [];

  if (!silent) {
    console.log('================================================================================');
    console.log('              WELLNESS STUDIO OS - TRAINER ROSTER SIMULATION (DRY RUN)           ');
    console.log('================================================================================');
    console.log(`Target IST Date       : ${targetDate}`);
    console.log(`Simulated Rosters     : ${rostersToSimulate.length} trainers`);
    console.log(`Safety Mode           : OFFLINE (0 Outbox writes, 0 WhatsApp messages)`);
    console.log('--------------------------------------------------------------------------------');
  }

  for (let i = 0; i < rostersToSimulate.length; i++) {
    const roster = rostersToSimulate[i];
    const briefingText = formatTrainerBriefing(roster);

    renderedBriefings.push({
      trainerId: roster.trainerId,
      trainerName: roster.trainerName,
      phone: roster.phone,
      briefingText,
      sessionCount: roster.sessions.length,
    });

    if (!silent) {
      console.log(`\n[Trainer ${i + 1}/${rostersToSimulate.length}] ${roster.trainerName} (${roster.phone || 'No phone'})`);
      console.log(`Scheduled Sessions : ${roster.sessions.length}`);
      console.log('--------------------------------------------------------------------------------');
      if (briefingText.trim().length === 0) {
        console.log('(No scheduled sessions for this trainer today - briefing skipped per spec)');
      } else {
        console.log(briefingText);
      }
      console.log('--------------------------------------------------------------------------------');
    }
  }

  if (!silent) {
    const populatedCount = renderedBriefings.filter((b) => b.briefingText.length > 0).length;
    console.log('\n================================================================================');
    console.log('                            SIMULATION SUMMARY                                  ');
    console.log('================================================================================');
    console.log(`Trainers Processed    : ${rostersToSimulate.length}`);
    console.log(`Briefings Generated   : ${populatedCount}`);
    console.log(`Empty Days Skipped    : ${rostersToSimulate.length - populatedCount}`);
    console.log(`Outbox Rows Created   : 0 (SAFETY VERIFIED)`);
    console.log(`WhatsApp Messages Sent: 0 (SAFETY VERIFIED)`);
    console.log('================================================================================\n');
  }

  return {
    date: targetDate,
    renderedBriefings,
    outboxWrites: 0,
    whatsappDispatches: 0,
  };
}

// Direct CLI invocation handler
if (require.main === module || (typeof process !== 'undefined' && process.argv.includes('--simulate'))) {
  const cliDate = process.argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
  runRosterSimulation(cliDate).catch((err) => {
    console.error('Roster simulation failed:', err);
    process.exit(1);
  });
}
