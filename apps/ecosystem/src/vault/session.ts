import {
  createVault,
  unlockWithPassword as openWithPassword,
  unlockWithRecoveryCode as openWithRecoveryCode,
  type VaultRecord
} from './crypto';

export const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 15;
export const MIN_INACTIVITY_TIMEOUT_MINUTES = 5;
export const MAX_INACTIVITY_TIMEOUT_MINUTES = 60;

export type VaultLockReason = 'manual' | 'inactivity';
export type RecoveryCodeSaveMethod = 'download' | 'print' | 'copy';
export type VaultSessionStatus = 'locked' | 'setting-up' | 'unlocked' | 'locking';

export interface VaultSessionOptions {
  prepareToLock(reason: VaultLockReason): Promise<void>;
  clearDecryptedState(): void;
  onAutomaticLockFailure?(cause: unknown): void;
  inactivityTimeoutMinutes?: number;
}

function assertInactivityTimeout(minutes: number): void {
  if (!Number.isInteger(minutes) || minutes < MIN_INACTIVITY_TIMEOUT_MINUTES || minutes > MAX_INACTIVITY_TIMEOUT_MINUTES) {
    throw new Error(`De automatische vergrendeling moet tussen ${MIN_INACTIVITY_TIMEOUT_MINUTES} en ${MAX_INACTIVITY_TIMEOUT_MINUTES} minuten staan.`);
  }
}

function assertDek(dek: CryptoKey): void {
  if (
    dek.type !== 'secret' ||
    dek.algorithm.name !== 'AES-GCM' ||
    dek.extractable ||
    !dek.usages.includes('encrypt') ||
    !dek.usages.includes('decrypt')
  ) {
    throw new Error('De kluis vereist een niet-exporteerbare AES-GCM-gegevenssleutel.');
  }
}

export class VaultSession {
  #dek: CryptoKey | undefined;
  #status: VaultSessionStatus = 'locked';
  #pendingVault: VaultRecord | undefined;
  #setupAttempt = 0;
  #recoveryCodeSaved = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #lockPromise: Promise<void> | undefined;
  #inactivityTimeoutMinutes: number;
  #lastLockFailure: unknown;

  constructor(private readonly options: VaultSessionOptions) {
    this.#inactivityTimeoutMinutes = options.inactivityTimeoutMinutes ?? DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
    assertInactivityTimeout(this.#inactivityTimeoutMinutes);
  }

  get status(): VaultSessionStatus {
    return this.#status;
  }

  get isUnlocked(): boolean {
    return this.#status === 'unlocked';
  }

  get inactivityTimeoutMinutes(): number {
    return this.#inactivityTimeoutMinutes;
  }

  get lastLockFailure(): unknown {
    return this.#lastLockFailure;
  }

  getKey(): CryptoKey {
    if (!this.#dek || this.#status === 'locked' || this.#status === 'setting-up') {
      throw new Error('De kluis is vergrendeld.');
    }
    return this.#dek;
  }

  async beginSetup(password: string): Promise<{ vault: VaultRecord; recoveryCode: string }> {
    if (this.#status !== 'locked' || this.#pendingVault) {
      throw new Error('De kluis kan nu niet worden aangemaakt.');
    }
    this.#status = 'setting-up';
    const attempt = ++this.#setupAttempt;
    try {
      const created = await createVault(password);
      if (attempt !== this.#setupAttempt || this.#status !== 'setting-up') {
        throw new Error('De kluisinstelling is geannuleerd.');
      }
      this.#pendingVault = created.vault;
      this.#recoveryCodeSaved = false;
      return { vault: created.vault, recoveryCode: created.recoveryCode };
    } catch (cause) {
      if (attempt === this.#setupAttempt && this.#status === 'setting-up') this.#status = 'locked';
      throw cause;
    }
  }

  acknowledgeRecoveryCodeSaved(method: RecoveryCodeSaveMethod): void {
    if (this.#status !== 'setting-up' || !this.#pendingVault) {
      throw new Error('Er is geen kluisinstelling die de herstelcode nodig heeft.');
    }
    if (!['download', 'print', 'copy'].includes(method)) {
      throw new Error('Bewaar de herstelcode door hem te downloaden, af te drukken of te kopiëren.');
    }
    this.#recoveryCodeSaved = true;
  }

  async confirmRecoveryCode(code: string): Promise<void> {
    if (this.#status !== 'setting-up' || !this.#pendingVault) {
      throw new Error('Er is geen kluisinstelling om te bevestigen.');
    }
    if (!this.#recoveryCodeSaved) {
      throw new Error('Bewaar eerst de herstelcode voordat je verdergaat.');
    }
    const attempt = this.#setupAttempt;
    const dek = await openWithRecoveryCode(this.#pendingVault, code);
    if (attempt !== this.#setupAttempt || this.#status !== 'setting-up') {
      throw new Error('De kluisinstelling is geannuleerd.');
    }
    this.#activate(dek);
    this.#pendingVault = undefined;
    this.#recoveryCodeSaved = false;
  }

  cancelSetup(): void {
    if (this.#status !== 'setting-up') return;
    this.#setupAttempt += 1;
    this.#pendingVault = undefined;
    this.#recoveryCodeSaved = false;
    this.#status = 'locked';
  }

  async unlockWithPassword(vault: VaultRecord, password: string): Promise<void> {
    this.#assertLocked();
    this.#activate(await openWithPassword(vault, password));
  }

  async unlockWithRecoveryCode(vault: VaultRecord, code: string): Promise<void> {
    this.#assertLocked();
    this.#activate(await openWithRecoveryCode(vault, code));
  }

  setInactivityTimeout(minutes: number): void {
    assertInactivityTimeout(minutes);
    this.#inactivityTimeoutMinutes = minutes;
    if (this.#status === 'unlocked') this.#scheduleLock();
  }

  recordActivity(): void {
    if (this.#status === 'unlocked') this.#scheduleLock();
  }

  async lock(reason: VaultLockReason = 'manual'): Promise<void> {
    if (!this.#dek) return;
    if (this.#lockPromise) return this.#lockPromise;

    this.#clearTimer();
    this.#status = 'locking';
    this.#lockPromise = (async () => {
      try {
        await this.options.prepareToLock(reason);
      } catch (cause) {
        this.#status = 'unlocked';
        this.#lastLockFailure = cause;
        this.#scheduleLock();
        throw cause;
      }

      this.#dek = undefined;
      this.#status = 'locked';
      this.#lastLockFailure = undefined;
      this.options.clearDecryptedState();
    })();

    try {
      await this.#lockPromise;
    } finally {
      this.#lockPromise = undefined;
    }
  }

  #assertLocked(): void {
    if (this.#status !== 'locked' || this.#pendingVault) {
      throw new Error('Vergrendel of annuleer eerst de huidige kluis.');
    }
  }

  #activate(dek: CryptoKey): void {
    assertDek(dek);
    this.#dek = dek;
    this.#status = 'unlocked';
    this.#lastLockFailure = undefined;
    this.#scheduleLock();
  }

  #clearTimer(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #scheduleLock(): void {
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.lock('inactivity').catch((cause: unknown) => {
        this.#lastLockFailure = cause;
        this.options.onAutomaticLockFailure?.(cause);
      });
    }, this.#inactivityTimeoutMinutes * 60_000);
  }
}
