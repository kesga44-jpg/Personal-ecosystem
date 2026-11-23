import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projectId = 'pe-p6-auth-tests';
const excludedServices = 'realtime,storage-api,imgproxy,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor,mailpit';
const cli = path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    ...options
  });
}

function runCli(args) {
  return run(process.execPath, [cli, ...args]);
}

function requireSuccess(result, description) {
  if (result.error) throw new Error(`${description}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${description} (exit code ${result.status ?? 'unknown'}). CLI output was suppressed to avoid exposing local keys.`);
}

const existing = runCli(['status', '--output', 'json']);
if (existing.status === 0) {
  throw new Error(`Supabase project ${projectId} is already running; refusing to reuse or stop a pre-existing local stack.`);
}

let failure;
let testExitCode = 0;
try {
  const started = runCli(['start', '--exclude', excludedServices]);
  requireSuccess(started, 'De lokale Supabase Auth-stack kon niet starten');

  const status = runCli(['status', '--output', 'json']);
  requireSuccess(status, 'De lokale Supabase-status kon niet worden gelezen');
  let localConfig;
  try {
    localConfig = JSON.parse(status.stdout);
  } catch {
    throw new Error('De lokale Supabase CLI gaf geen geldige status-JSON terug.');
  }

  const apiUrl = localConfig.API_URL;
  const publishableKey = localConfig.ANON_KEY ?? localConfig.PUBLISHABLE_KEY;
  if (typeof apiUrl !== 'string' || typeof publishableKey !== 'string') {
    throw new Error('Lokale Supabase-status bevat geen API-URL of publishable key.');
  }

  const tests = run(process.execPath, ['--test', path.join(root, 'tools/p6-auth/local-auth.auth.mjs')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      P6_LOCAL_AUTH_URL: apiUrl,
      P6_LOCAL_AUTH_PUBLISHABLE_KEY: publishableKey
    }
  });
  if (tests.error) throw tests.error;
  testExitCode = tests.status ?? 1;
} catch (cause) {
  failure = cause;
} finally {
  const stopped = runCli(['stop', '--project-id', projectId, '--no-backup']);
  try {
    requireSuccess(stopped, 'De tijdelijke lokale Supabase-stack kon niet veilig worden verwijderd');
  } catch (cause) {
    failure = failure ? new AggregateError([failure, cause], 'Auth-test en cleanup zijn mislukt.') : cause;
  }
}

if (failure) {
  console.error(failure.message);
  process.exitCode = 1;
} else {
  process.exitCode = testExitCode;
}
