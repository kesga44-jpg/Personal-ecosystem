import { describe, expect, it } from 'vitest';
import {
  logoutPersonalEcosystem,
  type LogoutDependencies,
  type LogoutSyncStatus
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
    async clearPersonalEcosystemData() { calls.push('clear-pe-data'); },
    async signOutPersonalEcosystemSession() { calls.push('sign-out-pe-session'); }
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

  it('exports only by explicit choice and then locks, clears PE data, and signs out in order', async () => {
    const deps = dependencies(ready, 'export');

    await expect(logoutPersonalEcosystem(deps)).resolves.toEqual({ status: 'logged-out' });
    expect(deps.calls).toEqual([
      'status',
      'export-choice',
      'export',
      'confirm-removal',
      'lock',
      'clear-pe-data',
      'sign-out-pe-session'
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

  it('never signs out after a lock or local deletion failure', async () => {
    const lockFailure = dependencies();
    lockFailure.lockVault = async () => {
      lockFailure.calls.push('lock');
      throw new Error('Pending input could not be saved.');
    };
    await expect(logoutPersonalEcosystem(lockFailure)).rejects.toThrow('Pending input could not be saved');
    expect(lockFailure.calls).not.toContain('clear-pe-data');
    expect(lockFailure.calls).not.toContain('sign-out-pe-session');

    const deleteFailure = dependencies();
    deleteFailure.clearPersonalEcosystemData = async () => {
      deleteFailure.calls.push('clear-pe-data');
      throw new Error('IndexedDB deletion was blocked.');
    };
    await expect(logoutPersonalEcosystem(deleteFailure)).rejects.toThrow('IndexedDB deletion was blocked');
    expect(deleteFailure.calls).not.toContain('sign-out-pe-session');
  });

  it('surfaces export failure without locking or deleting', async () => {
    const deps = dependencies(ready, 'export');
    deps.exportPersonalData = async () => {
      deps.calls.push('export');
      throw new Error('Export failed.');
    };

    await expect(logoutPersonalEcosystem(deps)).rejects.toThrow('Export failed');
    expect(deps.calls).not.toContain('lock');
    expect(deps.calls).not.toContain('clear-pe-data');
  });
});
