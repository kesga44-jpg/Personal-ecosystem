export interface LogoutSyncStatus {
  authenticated: boolean;
  sessionValid: boolean;
  aal2: boolean;
  allMutationsConfirmed: boolean;
  hasConflicts: boolean;
  syncInProgress: boolean;
}

export type LogoutExportChoice = 'export' | 'continue' | 'cancel';
export type LogoutResult =
  | { status: 'cancelled' }
  | { status: 'blocked'; reason: string; exported: boolean }
  | { status: 'logged-out' };

export interface LogoutDependencies {
  getSyncStatus(): Promise<LogoutSyncStatus>;
  chooseExport(): Promise<LogoutExportChoice>;
  exportPersonalData(): Promise<void>;
  confirmLocalDataRemoval(): Promise<boolean>;
  lockVault(): Promise<void>;
  clearPersonalEcosystemData(): Promise<void>;
  signOutPersonalEcosystemSession(): Promise<void>;
}

function logoutBlockReason(status: LogoutSyncStatus): string | undefined {
  if (!status.authenticated || !status.sessionValid) {
    return 'Controleer eerst de actieve accountsessie voordat je afmeldt.';
  }
  if (!status.aal2) {
    return 'Afmelden kan pas nadat de TOTP-controle is voltooid.';
  }
  if (!status.allMutationsConfirmed) {
    return 'Afmelden kan niet: de server heeft nog niet alle wijzigingen bevestigd.';
  }
  if (status.hasConflicts !== false) {
    return 'Los eerst alle synchronisatieconflicten op voordat je afmeldt.';
  }
  if (status.syncInProgress !== false) {
    return 'Wacht tot de lopende synchronisatie is afgerond voordat je afmeldt.';
  }
}

/**
 * Coordinates the P-6 logout barrier. Adapters must be scoped to Personal Ecosystem;
 * this function never removes the shared login or data owned by another app.
 */
export async function logoutPersonalEcosystem(dependencies: LogoutDependencies): Promise<LogoutResult> {
  const blockedReason = logoutBlockReason(await dependencies.getSyncStatus());

  const exportChoice = await dependencies.chooseExport();
  if (exportChoice === 'cancel') {
    return blockedReason ? { status: 'blocked', reason: blockedReason, exported: false } : { status: 'cancelled' };
  }
  let exported = false;
  if (exportChoice === 'export') {
    await dependencies.exportPersonalData();
    exported = true;
  }
  if (exportChoice !== 'export' && exportChoice !== 'continue') {
    throw new Error('Onbekende keuze voor exporteren bij afmelden.');
  }
  if (blockedReason) return { status: 'blocked', reason: blockedReason, exported };

  if (!await dependencies.confirmLocalDataRemoval()) return { status: 'cancelled' };

  await dependencies.lockVault();
  await dependencies.clearPersonalEcosystemData();
  await dependencies.signOutPersonalEcosystemSession();
  return { status: 'logged-out' };
}
