import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres@127.0.0.1:5433/fitness_ai_ci_test?schema=public';

function loadLocalEnvironment(): void {
  const candidates = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend-nestjs-gateway/.env'),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key] && value) process.env[key] = value;
    }
  }
}

export interface TestDatabaseAvailability {
  available: boolean;
  reason: string;
  url: string;
}

/**
 * Performs a short TCP probe before database-backed suites are registered.
 * It never falls back to DATABASE_URL, so a failed disposable database cannot
 * accidentally redirect destructive integration tests to another environment.
 */
export function getTestDatabaseAvailability(): TestDatabaseAvailability {
  loadLocalEnvironment();
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { available: false, reason: 'TEST_DATABASE_URL is invalid.', url: DEFAULT_TEST_DATABASE_URL };
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (databaseName === 'wellness_studio' || !databaseName.toLowerCase().includes('test')) {
    return {
      available: false,
      reason: `Refusing non-test database "${databaseName}".`,
      url,
    };
  }

  const host = parsed.hostname || '127.0.0.1';
  const port = parsed.port || '5432';
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      "const net=require('net');const socket=net.createConnection({host:process.argv[1],port:Number(process.argv[2])});const done=(code)=>{socket.destroy();process.exit(code)};socket.once('connect',()=>done(0));socket.once('error',()=>done(1));socket.setTimeout(750,()=>done(1));",
      host,
      port,
    ],
    { timeout: 1500, stdio: 'ignore' },
  );

  return probe.status === 0
    ? { available: true, reason: '', url }
    : { available: false, reason: `Disposable PostgreSQL is unreachable at ${host}:${port}.`, url };
}
