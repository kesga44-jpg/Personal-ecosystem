import { describe, expect, it } from 'vitest';
import {
  endLogoutBarrier,
  logoutPersonalEcosystem,
  resumeInterruptedLogout,
  type LogoutBarrier,
  type LogoutBarrierPhase,
  PersonalEcosystemRemovalError,
  removePersonalEcosystemAccount,
  type LogoutDependencies,
  type LogoutSyncStatus,
  type PersonalEcosystemRemovalAuthStatus,
  type PersonalEcosystemRemovalDependencies
} from './lifecycle';

const ready: LogoutSyncStatus = {
  authenticated: true,
  sessionValid: true,
  aal2: true,
  allMutationsConfirmed: true,
  hasConflicts: false,
  syncInProgress: false
};

/** In-memory stand-in for Web Locks + the localStorage marker, shared by simulated tabs. */
function memoryBarrier(): LogoutBarrier & { phase: LogoutBarrierPhase | null; log: string[] } {
  const queues = new Map<string, Promise<void>>();
  const lock = async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
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
  };
  const barrier = {
    phase: null as LogoutBarrierPhase | null,
    log: [] as string[],
    withSyncExcluded: <T>(operation: () => Promise<T>) => lock('sync', operation),
    withMutationsExcluded: <T>(operation: () => Promise<T>) => lock('mutation', operation),
    read: () => barrier.phase,
    write: (phase: LogoutBarrierPhase) => { barrier.phase = phase; barrier.log.push(phase); },
    clear: () => { barrier.phase = null; }
  };
  return barrier;
}

function dependencies(
  status: LogoutSyncStatus = ready,
  exportChoice: 'export' | 'continue' | 'cancel' = 'continue',
  confirmRemoval = true
): LogoutDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getSyncStatus() { calls.push('status'); return status; },
    async chooseExport() { calls.push('export-choice'); return exportChoice; },
    async exportPersonalData() { calls.push('export'); },
    async confirmLocalDataRemoval() { calls.push('confirm-removal'); return confirmRemoval; },
    async lockVault() { calls.push('lock'); },
    async clearLocalPersonalEcosystemCache() { calls.push('clear-local-cache'); },
    async closePersonalEcosystemAppSession() { calls.push('close-pe-app-session'); },
    barrier: memoryBarrier()
  };
}

describe('Personal Ecosystem logout barrier', () => {
  it.each([
    ['session is not authenticated', { authenticated: false }],
    ['session is expired', { sessionValid: false }],
    ['TOTP is incomplete', { aal2: false }],
    ['server has unconfirmed mutations', { allMutationsConfirmed: false }],
    ['conflicts remain', { hasConflicts: true }],
    ['sync is still running', { syncInProgress: true }]
  ])('does not erase local data when %s', async (_reason, override) => {
    const deps = dependencies({ ...ready, ...override });

    await expect(logoutPersonalEcosystem(deps)).resolves.toMatchObject({ status: 'blocked' });
    expect(deps.calls).toEqual(['status', 'export-choice']);
  });

  it('exports only by explicit choice and then locks, clears local cache, and ends the PE session in order', async () => {
    const deps = dependencies(ready, 'export');

    await expect(logoutPersonalEcosystem(deps)).resolves.toEqual({ status: 'logged-out' });
    expect(deps.calls).toEqual([
      'status',
      'export-choice',
      'export',
      'confirm-removal',
      'lock',
      'status',
      'clear-local-cache',
      'close-pe-app-session'
    ]);
  });

  it('does not remove local data when the user cancels or declines confirmation', async () => {
    const chooseCancel = dependencies(ready, 'cancel');
    await expect(logoutPersonalEcosystem(chooseCancel)).resolves.toEqual({ status: 'cancelled' });
    expect(chooseCancel.calls).toEqual(['status', 'export-choice']);

    const declineRemoval = dependencies(ready, 'continue', false);
    await expect(logoutPersonalEcosystem(declineRemoval)).resolves.toEqual({ status: 'cancelled' });
    expect(declineRemoval.calls).toEqual(['status', 'export-choice', 'confirm-removal']);
  });

  it('exports unsynchronized local data without permitting logout or deletion', async () => {
    const deps = dependencies({ ...ready, allMutationsConfirmed: false }, 'export');

    await expect(logoutPersonalEcosystem(deps)).resolves.toMatchObject({
      status: 'blocked',
      exported: true,
      reason: expect.stringContaining('niet alle wijzigingen bevestigd')
    });
    expect(deps.calls).toEqual(['status', 'export-choice', 'export']);
  });

  it('never ends the PE session after a lock or local cache failure', async () => {
    const lockFailure = dependencies();
    lockFailure.lockVault = async () => {
      lockFailure.calls.push('lock');
      throw new Error('Pending input could not be saved.');
    };
    await expect(logoutPersonalEcosystem(lockFailure)).rejects.toThrow('Pending input could not be saved');
    expect(lockFailure.calls).not.toContain('clear-local-cache');
    expect(lockFailure.calls).not.toContain('close-pe-app-session');

    const cacheFailure = dependencies();
    cacheFailure.clearLocalPersonalEcosystemCache = async () => {
      cacheFailure.calls.push('clear-local-cache');
      throw new Error('IndexedDB deletion was blocked.');
    };
    await expect(logoutPersonalEcosystem(cacheFailure)).rejects.toThrow('IndexedDB deletion was blocked');
    expect(cacheFailure.calls).not.toContain('close-pe-app-session');
  });

  it('surfaces export failure without locking or deleting', async () => {
    const deps = dependencies(ready, 'export');
    deps.exportPersonalData = async () => {
      deps.calls.push('export');
      throw new Error('Export failed.');
    };

    await expect(logoutPersonalEcosystem(deps)).rejects.toThrow('Export failed');
    expect(deps.calls).not.toContain('lock');
    expect(deps.calls).not.toContain('clear-local-cache');
  });
});

describe('logout/sync race barrier', () => {
  /** Local store with sync bookkeeping: a mutation is unconfirmed until a sync round pushes it. */
  function world() {
    const barrier = memoryBarrier();
    const records = new Map<string, string>();
    let unconfirmed = 0;
    let syncing = 0;
    const write = (id: string, value: string) => barrier.withMutationsExcluded(async () => {
      if (barrier.read()) throw new Error('Personal Ecosystem wordt afgemeld; nieuwe wijzigingen en synchronisatie zijn geblokkeerd.');
      records.set(id, value);
      unconfirmed += 1;
    });
    const sync = (online: boolean, during?: () => Promise<void>) => barrier.withSyncExcluded(async () => {
      if (barrier.read()) throw new Error('Personal Ecosystem wordt afgemeld; nieuwe wijzigingen en synchronisatie zijn geblokkeerd.');
      syncing += 1;
      try {
        await during?.();
        if (!online) throw new Error('offline');
        unconfirmed = 0;
      } finally {
        syncing -= 1;
      }
    });
    const status = async (): Promise<LogoutSyncStatus> => ({ ...ready, allMutationsConfirmed: unconfirmed === 0, syncInProgress: syncing > 0 });
    const logoutDeps = (hooks: { onConfirm?: () => Promise<void>; onLock?: () => Promise<void> } = {}): LogoutDependencies & { calls: string[] } => {
      const calls: string[] = [];
      return {
        calls,
        barrier,
        getSyncStatus: async () => { calls.push('status'); return status(); },
        chooseExport: async () => 'continue',
        exportPersonalData: async () => undefined,
        confirmLocalDataRemoval: async () => { calls.push('confirm-removal'); await hooks.onConfirm?.(); return true; },
        lockVault: async () => { calls.push('lock'); await hooks.onLock?.(); },
        clearLocalPersonalEcosystemCache: async () => { calls.push('clear-local-cache'); records.clear(); },
        closePersonalEcosystemAppSession: async () => { calls.push('close-pe-app-session'); }
      };
    };
    return { barrier, records, write, sync, logoutDeps, get unconfirmed() { return unconfirmed; } };
  }

  it('a change made while the confirmation dialog is open blocks the wipe (concurrent local change)', async () => {
    const w = world();
    const deps = w.logoutDeps({ onConfirm: () => w.write('r1', 'typed during the dialog') });

    await expect(logoutPersonalEcosystem(deps)).resolves.toMatchObject({ status: 'blocked', vaultLocked: true, reason: expect.stringContaining('niet alle wijzigingen') });
    expect(w.records.get('r1')).toBe('typed during the dialog');
    expect(deps.calls).not.toContain('clear-local-cache');
    expect(w.barrier.phase).toBeNull();
  });

  it('waits for a sync round that started during the dialog, then re-checks before wiping', async () => {
    const w = world();
    let running: Promise<void> | undefined;
    let syncFinished = false;
    const deps = w.logoutDeps({ onConfirm: async () => {
      await w.write('r1', 'v1');
      running = w.sync(true, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        syncFinished = true;
      });
      await Promise.resolve();
    }, onLock: async () => {
      expect(syncFinished).toBe(true);
    } });

    await expect(logoutPersonalEcosystem(deps)).resolves.toEqual({ status: 'logged-out' });
    await running;
    expect(w.unconfirmed).toBe(0);
    expect(deps.calls).toEqual(['status', 'confirm-removal', 'lock', 'status', 'clear-local-cache', 'close-pe-app-session']);
  });

  it('a sync round that fails during the dialog (offline) keeps the data and blocks logout', async () => {
    const w = world();
    const deps = w.logoutDeps({ onConfirm: async () => {
      await w.write('r1', 'offline change');
      await expect(w.sync(false)).rejects.toThrow('offline');
    } });

    await expect(logoutPersonalEcosystem(deps)).resolves.toMatchObject({ status: 'blocked' });
    expect(w.records.get('r1')).toBe('offline change');
  });

  it('a write from another tab that queued behind the wipe is refused instead of resurrecting data', async () => {
    const w = world();
    let otherTab: Promise<void> | undefined;
    const deps = w.logoutDeps({ onLock: async () => {
      // Another tab: write and sync are queued; they run only after the barrier releases its locks.
      otherTab = w.barrier.withMutationsExcluded(async () => undefined).then(() => w.write('late', 'other tab'));
    } });

    await expect(logoutPersonalEcosystem(deps)).resolves.toEqual({ status: 'logged-out' });
    await expect(otherTab).rejects.toThrow('wordt afgemeld');
    await expect(w.sync(true)).rejects.toThrow('wordt afgemeld');
    expect(w.records.size).toBe(0);
    expect(w.barrier.log).toEqual(['clearing', 'cleared']);
  });

  it('a second logout from another tab waits and then completes idempotently', async () => {
    const w = world();
    const [first, second] = await Promise.all([logoutPersonalEcosystem(w.logoutDeps()), logoutPersonalEcosystem(w.logoutDeps())]);
    expect(first).toEqual({ status: 'logged-out' });
    expect(second).toEqual({ status: 'logged-out' });
  });

  it('a wipe that failed or was interrupted (restart) is completed on the next start, and the barrier stays until a new login', async () => {
    const w = world();
    await w.sync(true);
    const deps = w.logoutDeps();
    deps.clearLocalPersonalEcosystemCache = async () => { throw new Error('Tab closed while deleting.'); };
    await expect(logoutPersonalEcosystem(deps)).rejects.toThrow('Tab closed');
    expect(w.barrier.phase).toBe('clearing');
    await expect(w.write('x', 'after crash')).rejects.toThrow('wordt afgemeld');
    expect(() => endLogoutBarrier(w.barrier)).toThrow('onderbroken afmelding');

    const cleared: string[] = [];
    await expect(resumeInterruptedLogout({ barrier: w.barrier, clearLocalPersonalEcosystemCache: async () => { cleared.push('wipe'); } })).resolves.toBe('resumed');
    expect(cleared).toEqual(['wipe']);
    await expect(resumeInterruptedLogout({ barrier: w.barrier, clearLocalPersonalEcosystemCache: async () => { cleared.push('again'); } })).resolves.toBe('awaiting-login');
    expect(cleared).toEqual(['wipe']);

    endLogoutBarrier(w.barrier);
    await expect(resumeInterruptedLogout({ barrier: w.barrier, clearLocalPersonalEcosystemCache: async () => undefined })).resolves.toBe('none');
    await expect(w.write('y', 'next session')).resolves.toBeUndefined();
  });

  it('a vault lock failure leaves no marker and wipes nothing', async () => {
    const w = world();
    const deps = w.logoutDeps({ onLock: async () => { throw new Error('Pending input could not be saved.'); } });
    await expect(logoutPersonalEcosystem(deps)).rejects.toThrow('Pending input');
    expect(w.barrier.phase).toBeNull();
    expect(deps.calls).not.toContain('clear-local-cache');
  });

  it('does not start the wipe when the marker cannot be stored', async () => {
    const w = world();
    w.barrier.write = () => { throw new Error('De afmeldmarkering kon niet worden opgeslagen.'); };
    const deps = w.logoutDeps();
    await expect(logoutPersonalEcosystem(deps)).rejects.toThrow('afmeldmarkering');
    expect(deps.calls).not.toContain('clear-local-cache');
  });
});

const readyForRemoval: PersonalEcosystemRemovalAuthStatus = {
  authenticated: true,
  sessionValid: true,
  aal2: true
};

function removalDependencies(
  exportChoice: 'export' | 'continue' | 'cancel' = 'continue',
  serverRows: string[] = ['synthetic-1', 'synthetic-2']
): PersonalEcosystemRemovalDependencies & {
  calls: string[];
  serverRows: string[];
  authIdentity: string;
  sharedAppData: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    serverRows,
    authIdentity: 'synthetic-auth-user',
    sharedAppData: ['synthetic-shared-app-row'],
    async getAuthStatus() { calls.push('status'); return readyForRemoval; },
    async chooseExport() { calls.push('export-choice'); return exportChoice; },
    async exportPersonalData() { calls.push('export'); },
    async confirmAccountRemoval() { calls.push('confirm-removal'); return true; },
    async verifyVaultPasswordAndFreshTotp() { calls.push('verify-vault-password-and-totp'); },
    async lockVault() { calls.push('lock'); },
    async deleteMyDataInPeSchema() {
      calls.push('delete-pe-server-data');
      const count = serverRows.length;
      serverRows.splice(0);
      return count;
    },
    async clearLocalPersonalEcosystemCache() { calls.push('clear-local-cache'); },
    async closePersonalEcosystemAppSession() { calls.push('close-pe-app-session'); }
  };
}

describe('Personal Ecosystem account data removal', () => {
  it('exports first when requested, then removes only PE data after fresh credentials', async () => {
    const deps = removalDependencies('export');

    await expect(removePersonalEcosystemAccount(deps)).resolves.toEqual({ status: 'removed', deletedRows: 2 });
    expect(deps.calls).toEqual([
      'status',
      'export-choice',
      'export',
      'confirm-removal',
      'verify-vault-password-and-totp',
      'lock',
      'delete-pe-server-data',
      'clear-local-cache',
      'close-pe-app-session'
    ]);
    expect(deps.authIdentity).toBe('synthetic-auth-user');
    expect(deps.sharedAppData).toEqual(['synthetic-shared-app-row']);
  });

  it('keeps the login untouched and makes the PE deletion sequence safe to retry', async () => {
    const deps = removalDependencies();

    await expect(removePersonalEcosystemAccount(deps)).resolves.toEqual({ status: 'removed', deletedRows: 2 });
    deps.calls.length = 0;
    await expect(removePersonalEcosystemAccount(deps)).resolves.toEqual({ status: 'removed', deletedRows: 0 });
    expect(deps.serverRows).toEqual([]);
    expect(deps.authIdentity).toBe('synthetic-auth-user');
    expect(deps.sharedAppData).toEqual(['synthetic-shared-app-row']);
    expect(deps.calls).not.toContain('delete-auth-identity');
  });

  it.each([
    ['session is not authenticated', { authenticated: false }],
    ['session is expired', { sessionValid: false }],
    ['TOTP is incomplete', { aal2: false }]
  ])('does not delete data when %s', async (_reason, override) => {
    const deps = removalDependencies();
    deps.getAuthStatus = async () => ({ ...readyForRemoval, ...override });

    await expect(removePersonalEcosystemAccount(deps)).resolves.toMatchObject({ status: 'blocked' });
    expect(deps.calls).not.toContain('delete-pe-server-data');
    expect(deps.calls).not.toContain('clear-local-cache');
    expect(deps.calls).not.toContain('close-pe-app-session');
  });

  it('does not start deletion when export, confirmation, or fresh credential checks fail', async () => {
    const exportFailure = removalDependencies('export');
    exportFailure.exportPersonalData = async () => { throw new Error('Export failed.'); };
    await expect(removePersonalEcosystemAccount(exportFailure)).rejects.toThrow('Export failed');
    expect(exportFailure.calls).not.toContain('lock');

    const cancelled = removalDependencies();
    cancelled.confirmAccountRemoval = async () => false;
    await expect(removePersonalEcosystemAccount(cancelled)).resolves.toEqual({ status: 'cancelled' });
    expect(cancelled.calls).not.toContain('delete-pe-server-data');

    const credentialFailure = removalDependencies();
    credentialFailure.verifyVaultPasswordAndFreshTotp = async () => { throw new Error('Re-authentication failed.'); };
    await expect(removePersonalEcosystemAccount(credentialFailure)).rejects.toThrow('Re-authentication failed');
    expect(credentialFailure.calls).not.toContain('delete-pe-server-data');
  });

  it('reports the exact stage and confirmed effects when an irreversible step fails', async () => {
    const rpcFailure = removalDependencies();
    rpcFailure.deleteMyDataInPeSchema = async () => {
      throw new Error('RPC unavailable.');
    };
    await expect(removePersonalEcosystemAccount(rpcFailure)).rejects.toMatchObject<Partial<PersonalEcosystemRemovalError>>({
      phase: 'delete-pe-server-data',
      serverDeletionConfirmed: false,
      localCacheCleared: false
    });
    expect(rpcFailure.calls).not.toContain('clear-local-cache');

    const cacheFailure = removalDependencies();
    cacheFailure.clearLocalPersonalEcosystemCache = async () => { throw new Error('IndexedDB blocked.'); };
    await expect(removePersonalEcosystemAccount(cacheFailure)).rejects.toMatchObject<Partial<PersonalEcosystemRemovalError>>({
      phase: 'clear-local-cache',
      serverDeletionConfirmed: true,
      localCacheCleared: false
    });

    const sessionFailure = removalDependencies();
    sessionFailure.closePersonalEcosystemAppSession = async () => { throw new Error('PE app session close failed.'); };
    await expect(removePersonalEcosystemAccount(sessionFailure)).rejects.toMatchObject<Partial<PersonalEcosystemRemovalError>>({
      phase: 'end-pe-session',
      serverDeletionConfirmed: true,
      localCacheCleared: true
    });
  });

  it('rejects a malformed server deletion count without reporting completion', async () => {
    const deps = removalDependencies();
    deps.deleteMyDataInPeSchema = async () => -1;

    await expect(removePersonalEcosystemAccount(deps)).rejects.toMatchObject({
      phase: 'delete-pe-server-data',
      serverDeletionConfirmed: false
    });
    expect(deps.calls).not.toContain('clear-local-cache');
  });
});
