import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGOUT_BARRIER_STORAGE_KEY, LogoutBarrierActiveError, openLocalDatabase, withSyncLock, type LocalDatabase, type LocalDatabaseConfig } from '@ecosystem/storage';
import { logoutPersonalEcosystem, resumeInterruptedLogout, type LogoutSyncStatus } from './lifecycle';
import { browserLogoutBarrier, deletePersonalEcosystemLocalDataWithinLock } from './localData';

/**
 * Integration of the real storage adapter, the real browser barrier (marker in localStorage)
 * and a per-name Web Locks stand-in. Two adapter handles on one database simulate two tabs.
 */
const config: LocalDatabaseConfig = {
  appId: 'synthetic-barrier',
  databaseName: 'synthetic-pe-barrier',
  version: 1,
  stores: ['items'],
  migrations: { 1: (database) => { database.createObjectStore('items', { keyPath: 'id' }); } }
};

const storage = new Map<string, string>();
const localStorageStub = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); }
};

beforeEach(() => {
  storage.clear();
  const queues = new Map<string, Promise<void>>();
  vi.stubGlobal('localStorage', localStorageStub);
  vi.stubGlobal('navigator', {
    locks: {
      request: async (name: string, _options: LockOptions, operation: () => Promise<unknown>) => {
        const previous = queues.get(name) ?? Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => { release = resolve; });
        queues.set(name, previous.then(() => current));
        await previous;
        try {
          return await operation();
        } finally {
          release();
        }
      }
    }
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(config.databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
});

const ready: LogoutSyncStatus = { authenticated: true, sessionValid: true, aal2: true, allMutationsConfirmed: true, hasConflicts: false, syncInProgress: false };

/** Synthetic sync bookkeeping: ids written but not yet pushed. */
function harness(tabA: LocalDatabase) {
  const pending = new Set<string>();
  const write = async (tab: LocalDatabase, id: string) => {
    await tab.put('items', { id, title: `synthetic ${id}` });
    pending.add(id);
  };
  const sync = () => withSyncLock(async () => { pending.clear(); });
  const deps = (onConfirm?: () => Promise<void>) => ({
    getSyncStatus: async () => ({ ...ready, allMutationsConfirmed: pending.size === 0 }),
    chooseExport: async () => 'continue' as const,
    exportPersonalData: async () => undefined,
    confirmLocalDataRemoval: async () => { await onConfirm?.(); return true; },
    lockVault: async () => undefined,
    clearLocalPersonalEcosystemCache: async () => {
      tabA.close();
      await deletePersonalEcosystemLocalDataWithinLock({ indexedDB, localStorage: localStorageStub, databaseNames: [config.databaseName], localStorageKeys: [] });
    },
    closePersonalEcosystemAppSession: async () => undefined,
    barrier: browserLogoutBarrier(localStorageStub)
  });
  return { pending, write, sync, deps };
}

describe('logout barrier with real storage adapter', () => {
  it('keeps a record that another tab wrote during the dialog', async () => {
    const tabA = await openLocalDatabase(config);
    const tabB = await openLocalDatabase(config);
    const h = harness(tabA);
    await h.write(tabA, 'synced');
    await h.sync();

    const result = await logoutPersonalEcosystem(h.deps(() => h.write(tabB, 'unsynced-from-tab-b')));

    expect(result).toMatchObject({ status: 'blocked', vaultLocked: true });
    expect((await tabB.list('items')).map((item) => item.id).sort()).toEqual(['synced', 'unsynced-from-tab-b']);
    expect(storage.has(LOGOUT_BARRIER_STORAGE_KEY)).toBe(false);
    tabA.close();
    tabB.close();
  });

  it('wipes after a confirmed sync and then refuses writes from a reopened tab and new sync rounds', async () => {
    const tabA = await openLocalDatabase(config);
    const h = harness(tabA);
    await h.write(tabA, 'one');
    await h.sync();

    await expect(logoutPersonalEcosystem(h.deps())).resolves.toEqual({ status: 'logged-out' });
    expect(JSON.parse(storage.get(LOGOUT_BARRIER_STORAGE_KEY)!)).toMatchObject({ phase: 'cleared' });

    const reopened = await openLocalDatabase(config);
    await expect(reopened.list('items')).resolves.toEqual([]);
    await expect(reopened.put('items', { id: 'late' })).rejects.toBeInstanceOf(LogoutBarrierActiveError);
    await expect(h.sync()).rejects.toBeInstanceOf(LogoutBarrierActiveError);
    reopened.close();
  });

  it('completes an interrupted wipe after a restart', async () => {
    const tabA = await openLocalDatabase(config);
    tabA.close();
    const barrier = browserLogoutBarrier(localStorageStub);
    barrier.write('clearing'); // crash right after the final check

    const result = await resumeInterruptedLogout({
      barrier,
      clearLocalPersonalEcosystemCache: () =>
        deletePersonalEcosystemLocalDataWithinLock({ indexedDB, localStorage: localStorageStub, databaseNames: [config.databaseName], localStorageKeys: [] }).then(() => undefined)
    });

    expect(result).toBe('resumed');
    expect(barrier.read()).toBe('cleared');
    expect((await indexedDB.databases()).map((database) => database.name)).not.toContain(config.databaseName);
  });
});
