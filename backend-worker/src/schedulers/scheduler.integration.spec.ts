import Redis from 'ioredis';
import { randomUUID } from 'crypto';

const redisUrl = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379';
const LOCK_KEY = 'scheduler:lock:studio-capacity-monitor';
const RELEASE_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

describe('Scheduler Redis Lock Integration Tests (Live Redis)', () => {
  let redisA: Redis;
  let redisB: Redis;

  beforeAll(async () => {
    redisA = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
    redisB = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
    await Promise.all([redisA.connect(), redisB.connect()]);
    await redisA.del(LOCK_KEY);
  });

  afterAll(async () => {
    await redisA.del(LOCK_KEY);
    await Promise.all([redisA.quit(), redisB.quit()]);
  });

  it('1. Redis connectivity: verifies ping and connection to live Redis instance', async () => {
    const pingResponse = await redisA.ping();
    expect(pingResponse).toBe('PONG');
  });

  it('2. Distributed lock acquisition: acquires scheduler lock with PX and NX flags', async () => {
    const lockToken = randomUUID();
    const ttlMs = 15000;

    const acquired = await redisA.set(LOCK_KEY, lockToken, 'PX', ttlMs, 'NX');
    expect(acquired).toBe('OK');

    const storedToken = await redisA.get(LOCK_KEY);
    expect(storedToken).toBe(lockToken);

    const ttl = await redisA.pttl(LOCK_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(ttlMs);

    // Clean up
    await redisA.eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, lockToken);
  });

  it('3. Concurrent scheduler exclusion: competing scheduler cannot acquire held lock', async () => {
    const tokenWorker1 = randomUUID();
    const tokenWorker2 = randomUUID();
    const ttlMs = 15000;

    // Worker 1 acquires lock
    const acquiredWorker1 = await redisA.set(
      LOCK_KEY,
      tokenWorker1,
      'PX',
      ttlMs,
      'NX',
    );
    expect(acquiredWorker1).toBe('OK');

    // Worker 2 attempts to acquire same lock -> denied
    const acquiredWorker2 = await redisB.set(
      LOCK_KEY,
      tokenWorker2,
      'PX',
      ttlMs,
      'NX',
    );
    expect(acquiredWorker2).toBeNull();

    // Verify Worker 1 still owns the lock
    const currentToken = await redisB.get(LOCK_KEY);
    expect(currentToken).toBe(tokenWorker1);

    // Clean up
    await redisA.eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, tokenWorker1);
  });

  it('4. Lock release and recovery: atomic Lua release frees lock and allows competing scheduler to acquire', async () => {
    const tokenWorker1 = randomUUID();
    const tokenWorker2 = randomUUID();
    const ttlMs = 15000;

    // Worker 1 acquires
    await redisA.set(LOCK_KEY, tokenWorker1, 'PX', ttlMs, 'NX');

    // Worker 2 attempts release with wrong token -> fails, lock retained
    const badReleaseResult = await redisB.eval(
      RELEASE_LOCK_LUA,
      1,
      LOCK_KEY,
      tokenWorker2,
    );
    expect(badReleaseResult).toBe(0);

    const stillLocked = await redisA.get(LOCK_KEY);
    expect(stillLocked).toBe(tokenWorker1);

    // Worker 1 releases with correct token
    const goodReleaseResult = await redisA.eval(
      RELEASE_LOCK_LUA,
      1,
      LOCK_KEY,
      tokenWorker1,
    );
    expect(goodReleaseResult).toBe(1);

    // Lock is now released in Redis
    const lockAfterRelease = await redisA.get(LOCK_KEY);
    expect(lockAfterRelease).toBeNull();

    // Worker 2 can now acquire the lock immediately
    const recoveredWorker2 = await redisB.set(
      LOCK_KEY,
      tokenWorker2,
      'PX',
      ttlMs,
      'NX',
    );
    expect(recoveredWorker2).toBe('OK');

    // Clean up Worker 2
    await redisB.eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, tokenWorker2);
  });
});
