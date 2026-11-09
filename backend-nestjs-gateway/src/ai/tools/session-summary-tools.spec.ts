import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SessionDebriefTool } from '../tools/session-summary-tools';
import { TrainerNotesTool } from '../tools/session-summary-tools';
import { MemberMilestonesTool } from '../tools/session-summary-tools';
import { SessionSummaryService } from '../operations/session-summary.service';
import type { ToolContext } from '../tools/base-tool';

const createMockContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  tenantId: 'tenant-1',
  tenantCode: 'TEST',
  userId: 'admin-1',
  role: 'admin',
  correlationId: 'corr-1',
  ...overrides,
});

describe('SessionDebriefTool', () => {
  let tool: SessionDebriefTool;
  let mockService: jest.Mocked<SessionSummaryService>;

  beforeEach(() => {
    mockService = {
      getSessionDebrief: jest.fn(),
    } as any;
    tool = new SessionDebriefTool(mockService);
  });

  it('should return debrief data on success', async () => {
    mockService.getSessionDebrief.mockResolvedValue({
      success: true,
      data: {
        sessionId: 'session-1',
        className: 'Vinyasa Flow',
        totalBooked: 10,
        checkedIn: 8,
        noShows: 1,
      },
    });

    const result = await tool.execute(createMockContext(), { sessionId: 'session-1' });

    expect(result.success).toBe(true);
    expect(result.data?.sessionId).toBe('session-1');
    expect(result.data?.className).toBe('Vinyasa Flow');
    expect(mockService.getSessionDebrief).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      { sessionId: 'session-1' },
    );
  });

  it('should return error when service fails', async () => {
    mockService.getSessionDebrief.mockResolvedValue({
      success: false,
      error: 'Session not found',
    });

    const result = await tool.execute(createMockContext(), { sessionId: 'invalid' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Session not found');
    expect(result.errorCode).toBe('SESSION_DEBRIEF_FAILED');
  });

  it('should propagate tenant context', async () => {
    mockService.getSessionDebrief.mockResolvedValue({ success: true, data: {} });
    await tool.execute(createMockContext({ tenantId: 'tenant-B' }), { sessionId: 's1' });
    expect(mockService.getSessionDebrief).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-B' }),
      expect.any(Object),
    );
  });
});

describe('TrainerNotesTool', () => {
  let tool: TrainerNotesTool;
  let mockService: jest.Mocked<SessionSummaryService>;

  beforeEach(() => {
    mockService = {
      getTrainerNotes: jest.fn(),
    } as any;
    tool = new TrainerNotesTool(mockService);
  });

  it('should return trainer notes data on success', async () => {
    mockService.getTrainerNotes.mockResolvedValue({
      success: true,
      data: {
        sessionId: 'session-1',
        className: 'Vinyasa Flow',
        trainerName: 'Elena Rostova',
        notes: null,
      },
    });

    const result = await tool.execute(createMockContext(), { sessionId: 'session-1' });

    expect(result.success).toBe(true);
    expect(result.data?.trainerName).toBe('Elena Rostova');
  });

  it('should return error when service fails', async () => {
    mockService.getTrainerNotes.mockResolvedValue({
      success: false,
      error: 'Session not found',
    });

    const result = await tool.execute(createMockContext(), { sessionId: 'invalid' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Session not found');
    expect(result.errorCode).toBe('TRAINER_NOTES_FAILED');
  });
});

describe('MemberMilestonesTool', () => {
  let tool: MemberMilestonesTool;
  let mockService: jest.Mocked<SessionSummaryService>;

  beforeEach(() => {
    mockService = {
      getMemberMilestones: jest.fn(),
    } as any;
    tool = new MemberMilestonesTool(mockService);
  });

  it('should return milestones data on success', async () => {
    mockService.getMemberMilestones.mockResolvedValue({
      success: true,
      data: {
        milestones: [
          { memberId: 'm1', memberName: 'Alice Johnson', milestone: 10 },
        ],
        periodDays: 30,
        totalMembersWithMilestones: 1,
      },
    });

    const result = await tool.execute(createMockContext(), { periodDays: 30 });

    expect(result.success).toBe(true);
    expect(result.data?.milestones).toHaveLength(1);
    expect(result.data?.milestones[0].milestone).toBe(10);
  });

  it('should return error when service fails', async () => {
    mockService.getMemberMilestones.mockResolvedValue({
      success: false,
      error: 'No data',
    });

    const result = await tool.execute(createMockContext(), {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('No data');
    expect(result.errorCode).toBe('MEMBER_MILESTONES_FAILED');
  });
});