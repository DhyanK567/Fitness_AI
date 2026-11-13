import { runRosterSimulation } from './roster.simulate';
import { multipleClassRoster, emptyRoster } from './roster.fixture';

describe('Roster Simulation Engine (Task F8)', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should run simulation in dry-run mode without Outbox or WhatsApp dispatches', async () => {
    const result = await runRosterSimulation('2026-11-12');

    expect(result.date).toBe('2026-11-12');
    expect(result.outboxWrites).toBe(0);
    expect(result.whatsappDispatches).toBe(0);
    expect(result.renderedBriefings.length).toBeGreaterThanOrEqual(3);

    // Verify stdout was invoked
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should format all injected custom rosters properly', async () => {
    const result = await runRosterSimulation('2026-11-15', [multipleClassRoster, emptyRoster], true);

    expect(result.date).toBe('2026-11-15');
    expect(result.renderedBriefings).toHaveLength(2);

    // First roster has 2 sessions
    expect(result.renderedBriefings[0].sessionCount).toBe(2);
    expect(result.renderedBriefings[0].briefingText).toContain('Session 1: 07:00 AM');
    expect(result.renderedBriefings[0].briefingText).toContain('Session 2: 05:30 PM');

    // Second roster is empty
    expect(result.renderedBriefings[1].sessionCount).toBe(0);
    expect(result.renderedBriefings[1].briefingText).toBe('');
  });

  it('should print full formatted output including header and summary when not silent', async () => {
    await runRosterSimulation('2026-11-12', [multipleClassRoster], false);

    const logs = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
    expect(logs).toContain('WELLNESS STUDIO OS - TRAINER ROSTER SIMULATION');
    expect(logs).toContain('Target IST Date       : 2026-11-12');
    expect(logs).toContain('Outbox Rows Created   : 0 (SAFETY VERIFIED)');
    expect(logs).toContain('WhatsApp Messages Sent: 0 (SAFETY VERIFIED)');
  });
});
