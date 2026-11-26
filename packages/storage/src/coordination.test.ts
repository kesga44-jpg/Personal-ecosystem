// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { withConsistentDatabaseSnapshot, withDatabaseMutationLock } from './coordination';

describe('cross-module snapshot coordination', () => {
  it('keeps IndexedDB mutations outside the export window', async () => {
    let releaseSnapshot!: () => void;
    let markSnapshotEntered!: () => void;
    const snapshotEntered = new Promise<void>((resolve) => { markSnapshotEntered = resolve; });
    const holdSnapshot = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
    const events: string[] = [];

    const snapshot = withConsistentDatabaseSnapshot(async () => {
      events.push('snapshot-start');
      markSnapshotEntered();
      await holdSnapshot;
      events.push('snapshot-end');
    });
    await snapshotEntered;

    const mutation = withDatabaseMutationLock(async () => {
      events.push('mutation');
    });
    await Promise.resolve();
    expect(events).toEqual(['snapshot-start']);

    releaseSnapshot();
    await Promise.all([snapshot, mutation]);
    expect(events).toEqual(['snapshot-start', 'snapshot-end', 'mutation']);
  });

  it('releases the snapshot lock when export fails', async () => {
    await expect(withConsistentDatabaseSnapshot(async () => {
      throw new Error('synthetic export failure');
    })).rejects.toThrow('synthetic export failure');

    const mutationRan = await withDatabaseMutationLock(async () => true);
    expect(mutationRan).toBe(true);
  });
});

describe('logout barrier marker', () => {
  it('refuses cooperating writes while the marker exists and allows them again after it is removed', async () => {
    const { LOGOUT_BARRIER_STORAGE_KEY, LogoutBarrierActiveError, logoutBarrierActive } = await import('./coordination');
    const values = new Map<string, string>();
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null }
    });
    try {
      expect(logoutBarrierActive()).toBe(false);
      values.set(LOGOUT_BARRIER_STORAGE_KEY, '{"phase":"clearing"}');
      let ran = false;
      await expect(withDatabaseMutationLock(async () => { ran = true; })).rejects.toBeInstanceOf(LogoutBarrierActiveError);
      expect(ran).toBe(false);
      await expect(withConsistentDatabaseSnapshot(async () => 'export still allowed')).resolves.toBe('export still allowed');
      values.delete(LOGOUT_BARRIER_STORAGE_KEY);
      await expect(withDatabaseMutationLock(async () => 'ok')).resolves.toBe('ok');
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
    }
  });

  it('treats unreadable storage as no marker', async () => {
    const { logoutBarrierActive } = await import('./coordination');
    const previous = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => { throw new Error('blocked'); } }
    });
    try {
      expect(logoutBarrierActive()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous });
    }
  });

  it('sync rounds need Web Locks and do not run concurrently', async () => {
    const { withSyncLock } = await import('./coordination');
    if (!globalThis.navigator?.locks) {
      await expect(withSyncLock(async () => undefined)).rejects.toThrow('browservergrendeling');
      return;
    }
    const events: string[] = [];
    await Promise.all([
      withSyncLock(async () => { events.push('a-start'); await new Promise((resolve) => setTimeout(resolve, 5)); events.push('a-end'); }),
      withSyncLock(async () => { events.push('b'); })
    ]);
    expect(events).toEqual(['a-start', 'a-end', 'b']);
  });
});
