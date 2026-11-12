import { TrainerRosterScheduler, ROSTER_CRON_EXPRESSION, ROSTER_TIMEZONE, ROSTER_CRON_NAME, ROSTER_LOCK_TTL_MS } from './trainer-roster.scheduler';
import { PrismaService } from '../../common/prisma.service';
import { RedisClient } from '../../common/redis-client';
import { TrainerRosterService } from '../../trainer-roster/trainer-roster.service';
import * as dateUtils from '../../common/date-utils';

describe('TrainerRosterScheduler (Daily 06:30 AM IST Scheduler)', () => {
  let scheduler: TrainerRosterScheduler;
  let mockPrisma: any;
  let mockRedis: any;
  let mockRedisClient: any;
  let mockTrainerRosterService: any;

  const TENANT_A = '11111111-1111-4111-8111-111111111111';
  const TENANT_B = '22222222-2222-4222-8222-222222222222';
  const FIXED_IST_DATE = '2026-11-13';

  beforeEach(() => {
    mockRedisClient = {
      set: jest.fn(),
      eval: jest.fn(),
    };

    mockRedis = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    mockPrisma = {
      tenant: {
        findMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    mockTrainerRosterService = {
      buildRosters: jest.fn(),
    };

    jest.spyOn(dateUtils, 'getCurrentIstDateString').mockReturnValue(FIXED_IST_DATE);

    scheduler = new TrainerRosterScheduler(
      mockPrisma as unknown as PrismaService,
      mockRedis as unknown as RedisClient,
      mockTrainerRosterService as unknown as TrainerRosterService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cron & Timezone Configuration Constants', () => {
    it('should be configured for exactly 06:30 AM every day', () => {
      expect(ROSTER_CRON_EXPRESSION).toBe('30 6 * * *');
    });

    it('should be configured for Asia/Kolkata timezone (IST)', () => {
      expect(ROSTER_TIMEZONE).toBe('Asia/Kolkata');
    });

    it('should define the unique cron job name', () => {
      expect(ROSTER_CRON_NAME).toBe('trainer-morning-roster');
    });

    it('should define lock TTL of 30 minutes (1,800,000 ms)', () => {
      expect(ROSTER_LOCK_TTL_MS).toBe(1_800_000);
    });
  });

  describe('Distributed Locking with Redis', () => {
    it('should obtain the current IST date string via date-utils', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockRedisClient.eval.mockResolvedValue(1);

      await scheduler.handleMorningRoster();

      expect(dateUtils.getCurrentIstDateString).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `lock:trainer-roster:scheduler:${FIXED_IST_DATE}`,
        expect.any(String),
        'PX',
        ROSTER_LOCK_TTL_MS,
        'NX',
      );
    });

    it('should skip execution when lock is already held by another worker instance', async () => {
      // Redis returns null on NX when key already exists
      mockRedisClient.set.mockResolvedValue(null);

      const result = await scheduler.handleMorningRoster();

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('LOCK_HELD_BY_ANOTHER_WORKER');
      expect(result.processedTenants).toBe(0);
      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
      expect(mockTrainerRosterService.buildRosters).not.toHaveBeenCalled();
      expect(mockRedisClient.eval).not.toHaveBeenCalled();
    });

    it('should handle Redis connection failure gracefully and skip without crashing', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('ECONNREFUSED: Connection refused by Redis server'));

      const result = await scheduler.handleMorningRoster();

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('REDIS_LOCK_ERROR');
      expect(result.processedTenants).toBe(0);
      expect(mockTrainerRosterService.buildRosters).not.toHaveBeenCalled();
    });

    it('should atomically release the lock in finally using the token to verify ownership', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockRedisClient.eval.mockResolvedValue(1);

      await scheduler.handleMorningRoster();

      const acquiredToken = mockRedisClient.set.mock.calls[0][1];
      expect(acquiredToken).toBeDefined();

      // Check atomic Lua check-and-delete
      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call("get", KEYS[1]) == ARGV[1] then'),
        1,
        `lock:trainer-roster:scheduler:${FIXED_IST_DATE}`,
        acquiredToken,
      );
    });
  });

  describe('Tenant Discovery & Processing', () => {
    it('should discover active tenants dynamically without hardcoded IDs', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A },
        { id: TENANT_B },
      ]);
      mockTrainerRosterService.buildRosters.mockResolvedValue([]);
      mockRedisClient.eval.mockResolvedValue(1);

      const tenants = await scheduler.getActiveTenants();

      expect(tenants).toEqual([TENANT_A, TENANT_B]);
      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });
    });

    it('should handle zero active tenants gracefully', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await scheduler.handleMorningRoster();

      expect(result.skipped).toBe(false);
      expect(result.processedTenants).toBe(0);
      expect(result.totalRosters).toBe(0);
      expect(mockTrainerRosterService.buildRosters).not.toHaveBeenCalled();
    });

    it('should process multiple active tenants sequentially calling TrainerRosterService', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A },
        { id: TENANT_B },
      ]);

      mockTrainerRosterService.buildRosters
        .mockResolvedValueOnce([{ trainerId: 't1', sessions: [] }])
        .mockResolvedValueOnce([
          { trainerId: 't2', sessions: [] },
          { trainerId: 't3', sessions: [] },
        ]);
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await scheduler.handleMorningRoster();

      expect(result.skipped).toBe(false);
      expect(result.processedTenants).toBe(2);
      expect(result.failedTenants).toBe(0);
      expect(result.totalRosters).toBe(3);

      expect(mockTrainerRosterService.buildRosters).toHaveBeenCalledTimes(2);
      expect(mockTrainerRosterService.buildRosters).toHaveBeenNthCalledWith(1, TENANT_A, FIXED_IST_DATE);
      expect(mockTrainerRosterService.buildRosters).toHaveBeenNthCalledWith(2, TENANT_B, FIXED_IST_DATE);
    });

    it('should isolate a tenant failure without halting processing for other tenants', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A },
        { id: TENANT_B },
      ]);

      // Tenant A throws an error, Tenant B succeeds
      mockTrainerRosterService.buildRosters
        .mockRejectedValueOnce(new Error('PostgreSQL deadlock / timeout on Tenant A'))
        .mockResolvedValueOnce([{ trainerId: 't2', sessions: [] }]);
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await scheduler.handleMorningRoster();

      expect(result.processedTenants).toBe(1);
      expect(result.failedTenants).toBe(1);
      expect(result.totalRosters).toBe(1);

      // Both tenants were attempted
      expect(mockTrainerRosterService.buildRosters).toHaveBeenCalledTimes(2);
      expect(mockTrainerRosterService.buildRosters).toHaveBeenCalledWith(TENANT_A, FIXED_IST_DATE);
      expect(mockTrainerRosterService.buildRosters).toHaveBeenCalledWith(TENANT_B, FIXED_IST_DATE);

      // Lock is still released cleanly
      expect(mockRedisClient.eval).toHaveBeenCalled();
    });
  });
});
