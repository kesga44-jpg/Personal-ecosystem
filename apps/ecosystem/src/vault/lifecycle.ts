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
  clearLocalPersonalEcosystemCache(): Promise<void>;
  closePersonalEcosystemAppSession(): Promise<void>;
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
  await dependencies.clearLocalPersonalEcosystemCache();
  await dependencies.closePersonalEcosystemAppSession();
  return { status: 'logged-out' };
}

export interface PersonalEcosystemRemovalAuthStatus {
  authenticated: boolean;
  sessionValid: boolean;
  aal2: boolean;
}

export interface PersonalEcosystemRemovalDependencies {
  getAuthStatus(): Promise<PersonalEcosystemRemovalAuthStatus>;
  chooseExport(): Promise<LogoutExportChoice>;
  exportPersonalData(): Promise<void>;
  confirmAccountRemoval(): Promise<boolean>;
  verifyVaultPasswordAndFreshTotp(): Promise<void>;
  lockVault(): Promise<void>;
  deleteMyDataInPeSchema(): Promise<number>;
  clearLocalPersonalEcosystemCache(): Promise<void>;
  closePersonalEcosystemAppSession(): Promise<void>;
}

export type PersonalEcosystemRemovalPhase =
  | 'lock-vault'
  | 'delete-pe-server-data'
  | 'clear-local-cache'
  | 'end-pe-session';

export class PersonalEcosystemRemovalError extends Error {
  constructor(
    readonly phase: PersonalEcosystemRemovalPhase,
    readonly serverDeletionConfirmed: boolean,
    readonly localCacheCleared: boolean,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'PersonalEcosystemRemovalError';
  }
}

export type PersonalEcosystemRemovalResult =
  | { status: 'cancelled' }
  | { status: 'blocked'; reason: string; exported: boolean }
  | { status: 'removed'; deletedRows: number };

function removalBlockReason(status: PersonalEcosystemRemovalAuthStatus): string | undefined {
  if (!status.authenticated || !status.sessionValid) {
    return 'Controleer eerst de actieve accountsessie voordat je PE-gegevens verwijdert.';
  }
  if (!status.aal2) {
    return 'PE-gegevens verwijderen kan pas na een geslaagde TOTP-controle.';
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Onbekende fout.';
}

/**
 * Removes only PE-owned server and local data. The injected RPC must target
 * pe.delete_my_data(); the shared Supabase Auth identity is never deleted.
 */
export async function removePersonalEcosystemAccount(
  dependencies: PersonalEcosystemRemovalDependencies
): Promise<PersonalEcosystemRemovalResult> {
  const blockedReason = removalBlockReason(await dependencies.getAuthStatus());
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
    throw new Error('Onbekende keuze voor exporteren vóór PE-verwijdering.');
  }
  if (blockedReason) return { status: 'blocked', reason: blockedReason, exported };
  if (!await dependencies.confirmAccountRemoval()) return { status: 'cancelled' };

  await dependencies.verifyVaultPasswordAndFreshTotp();

  try {
    await dependencies.lockVault();
  } catch (cause) {
    throw new PersonalEcosystemRemovalError(
      'lock-vault',
      false,
      false,
      `De kluis kon niet veilig worden vergrendeld: ${errorMessage(cause)}`,
      cause
    );
  }

  let deletedRows: number;
  try {
    deletedRows = await dependencies.deleteMyDataInPeSchema();
    if (!Number.isSafeInteger(deletedRows) || deletedRows < 0) {
      throw new Error('De PE-verwijdering gaf geen geldig aantal verwijderde rijen terug.');
    }
  } catch (cause) {
    throw new PersonalEcosystemRemovalError(
      'delete-pe-server-data',
      false,
      false,
      `De serververwijdering is niet bevestigd; lokale gegevens zijn behouden. ${errorMessage(cause)}`,
      cause
    );
  }

  try {
    await dependencies.clearLocalPersonalEcosystemCache();
  } catch (cause) {
    throw new PersonalEcosystemRemovalError(
      'clear-local-cache',
      true,
      false,
      `PE-servergegevens zijn verwijderd, maar de lokale cache is niet bevestigd gewist. ${errorMessage(cause)}`,
      cause
    );
  }

  try {
    await dependencies.closePersonalEcosystemAppSession();
  } catch (cause) {
    throw new PersonalEcosystemRemovalError(
      'end-pe-session',
      true,
      true,
      `PE-servergegevens en lokale cache zijn verwijderd, maar de PE-sessie is niet bevestigd beëindigd. ${errorMessage(cause)}`,
      cause
    );
  }

  return { status: 'removed', deletedRows };
}
