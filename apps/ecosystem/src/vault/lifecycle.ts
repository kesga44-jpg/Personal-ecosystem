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
  /** `vaultLocked`: the final check failed after the vault was locked; nothing was wiped. */
  | { status: 'blocked'; reason: string; exported: boolean; vaultLocked?: boolean }
  | { status: 'logged-out' };

export type LogoutBarrierPhase = 'clearing' | 'cleared';

/**
 * Cross-tab coordination for logout. The browser implementation (browserLogoutBarrier in
 * localData.ts) uses Web Locks and a durable marker; tests inject an in-memory one.
 */
export interface LogoutBarrier {
  /** Hold the cross-tab sync lock: waits for a running sync round and keeps new rounds out. */
  withSyncExcluded<T>(operation: () => Promise<T>): Promise<T>;
  /** Hold the cross-tab database mutation lock: no cooperating write can run meanwhile. */
  withMutationsExcluded<T>(operation: () => Promise<T>): Promise<T>;
  read(): LogoutBarrierPhase | null;
  /** Persist the phase. Must throw if it cannot be stored; the wipe then does not start. */
  write(phase: LogoutBarrierPhase): void;
  clear(): void;
}

export interface LogoutDependencies {
  /**
   * Fresh status from persisted sync bookkeeping. Called twice: before the dialogs and again
   * inside the barrier, after the vault is locked, so it must not need the data key.
   */
  getSyncStatus(): Promise<LogoutSyncStatus>;
  chooseExport(): Promise<LogoutExportChoice>;
  exportPersonalData(): Promise<void>;
  confirmLocalDataRemoval(): Promise<boolean>;
  /** Saves open input and locks the vault. Runs while sync is excluded, before the mutation lock. */
  lockVault(): Promise<void>;
  /** Runs inside the mutation lock: must not request it again (see deletePersonalEcosystemLocalDataWithinLock). */
  clearLocalPersonalEcosystemCache(): Promise<void>;
  closePersonalEcosystemAppSession(): Promise<void>;
  barrier: LogoutBarrier;
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

  // The first check was before the dialogs; sync, other tabs or this tab may have changed data since.
  const { barrier } = dependencies;
  const outcome = await barrier.withSyncExcluded(async () => {
    await dependencies.lockVault();
    return barrier.withMutationsExcluded(async () => {
      const finalReason = logoutBlockReason(await dependencies.getSyncStatus());
      if (finalReason) return { status: 'blocked', reason: finalReason, exported, vaultLocked: true } as const;
      barrier.write('clearing');
      await dependencies.clearLocalPersonalEcosystemCache();
      barrier.write('cleared');
      return null;
    });
  });
  if (outcome) return outcome;
  await dependencies.closePersonalEcosystemAppSession();
  return { status: 'logged-out' };
}

export type InterruptedLogoutResult = 'none' | 'resumed' | 'awaiting-login';

/**
 * Call at app start, before any PE database is opened. A logout that stopped while wiping
 * (crash, closed tab, failed deletion) is completed; its data was confirmed synced before the
 * marker was written, so finishing the wipe loses nothing that is not on the server.
 */
export async function resumeInterruptedLogout(dependencies: {
  clearLocalPersonalEcosystemCache(): Promise<void>;
  barrier: LogoutBarrier;
}): Promise<InterruptedLogoutResult> {
  const { barrier } = dependencies;
  const phase = barrier.read();
  if (phase === null) return 'none';
  if (phase === 'cleared') return 'awaiting-login';
  await barrier.withMutationsExcluded(async () => {
    if (barrier.read() !== 'clearing') return;
    await dependencies.clearLocalPersonalEcosystemCache();
    barrier.write('cleared');
  });
  return 'resumed';
}

/** After a new successful login and vault unlock: lift the barrier so writes and sync work again. */
export function endLogoutBarrier(barrier: LogoutBarrier): void {
  if (barrier.read() === 'clearing') throw new Error('Een onderbroken afmelding moet eerst worden afgerond.');
  barrier.clear();
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
