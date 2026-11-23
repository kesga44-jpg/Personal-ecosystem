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
