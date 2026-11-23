import { describe, expect, it } from 'vitest';
import {
  logoutPersonalEcosystem,
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
    async closePersonalEcosystemAppSession() { calls.push('close-pe-app-session'); }
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
