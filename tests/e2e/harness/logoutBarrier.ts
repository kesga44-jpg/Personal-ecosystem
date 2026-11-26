/**
 * Test-only browser harness for the P-6 logout barrier. Bundled by the E2E test and injected into a
 * page on the PE origin; never part of an app build. Uses a synthetic database and synthetic records.
 */
import { LOGOUT_BARRIER_STORAGE_KEY, openLocalDatabase, withSyncLock, type LocalDatabase, type LocalDatabaseConfig } from '@ecosystem/storage';
import { logoutPersonalEcosystem, resumeInterruptedLogout } from '../../../apps/ecosystem/src/vault/lifecycle';
import { browserLogoutBarrier, deletePersonalEcosystemLocalDataWithinLock } from '../../../apps/ecosystem/src/vault/localData';

const config: LocalDatabaseConfig = {
  appId: 'synthetic-e2e-barrier',
  databaseName: 'synthetic-e2e-barrier',
  version: 1,
  stores: ['items'],
  migrations: { 1: (database) => { database.createObjectStore('items', { keyPath: 'id' }); } }
};
/** Cross-tab synthetic sync bookkeeping: ids written but not yet confirmed by the (fake) server. */
const PENDING_KEY = 'synthetic-e2e-barrier.pending';

let database: LocalDatabase | undefined;
const db = async () => (database ??= await openLocalDatabase(config));
const pending = (): string[] => JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as string[];

let releaseConfirm: (() => void) | undefined;
const clear = async () => {
  database?.close();
  database = undefined;
  await deletePersonalEcosystemLocalDataWithinLock({ indexedDB, localStorage, databaseNames: [config.databaseName], localStorageKeys: [] });
};

export async function write(id: string): Promise<string> {
  try {
    await (await db()).put('items', { id });
    localStorage.setItem(PENDING_KEY, JSON.stringify([...pending(), id]));
    return 'ok';
  } catch (cause) {
    return cause instanceof Error ? cause.name : 'error';
  }
}

export async function list(): Promise<string[]> {
  return (await (await db()).list<{ id: string }>('items')).map((item) => item.id).sort();
}

export async function sync(): Promise<string> {
  try {
    await withSyncLock(async () => { localStorage.setItem(PENDING_KEY, '[]'); });
    return 'ok';
  } catch (cause) {
    return cause instanceof Error ? cause.name : 'error';
  }
}

/** Starts a logout whose confirmation dialog stays open until `confirm()` is called. */
export function startLogout(): Promise<unknown> {
  const dialog = new Promise<void>((resolve) => { releaseConfirm = resolve; });
  return logoutPersonalEcosystem({
    getSyncStatus: async () => ({ authenticated: true, sessionValid: true, aal2: true, allMutationsConfirmed: pending().length === 0, hasConflicts: false, syncInProgress: false }),
    chooseExport: async () => 'continue',
    exportPersonalData: async () => undefined,
    confirmLocalDataRemoval: async () => { await dialog; return true; },
    lockVault: async () => undefined,
    clearLocalPersonalEcosystemCache: clear,
    closePersonalEcosystemAppSession: async () => undefined,
    barrier: browserLogoutBarrier()
  });
}

export function confirm(): void {
  releaseConfirm?.();
}

export const marker = (): string | null => localStorage.getItem(LOGOUT_BARRIER_STORAGE_KEY);
export const resume = () => resumeInterruptedLogout({ clearLocalPersonalEcosystemCache: clear, barrier: browserLogoutBarrier() });
export const simulateCrashAfterFinalCheck = () => browserLogoutBarrier().write('clearing');
export const reset = () => { localStorage.removeItem(LOGOUT_BARRIER_STORAGE_KEY); localStorage.removeItem(PENDING_KEY); };
