import { databaseConfig as hubConfig } from '@ecosystem/hub/App';
import { databaseConfig as sportConfig } from '@ecosystem/sportapp/App';
import { databaseConfig as sidequestConfig } from '@ecosystem/sidequest/App';
import {
  encryptedDatabaseName,
  LOGOUT_BARRIER_STORAGE_KEY,
  withCrossTabDatabaseLock,
  withSyncExcludedForLogout,
  type LocalDatabaseConfig
} from '@ecosystem/storage';
import type { LogoutBarrier, LogoutBarrierPhase } from './lifecycle';
import { MIN_ITERATIONS, type VaultRecord, type WrappedKey } from './crypto';
import { DEFAULT_INACTIVITY_TIMEOUT_MINUTES, MAX_INACTIVITY_TIMEOUT_MINUTES, MIN_INACTIVITY_TIMEOUT_MINUTES } from './session';
import { databaseConfig as lichaamConfig } from '../modules/lichaam/storage';
import { databaseConfig as dagboekConfig } from '../modules/dagboek/storage';
import { databaseConfig as voedingConfig } from '../modules/voeding/storage';
import { databaseConfig as krachtConfig } from '../modules/kracht/storage';
import { databaseConfig as duurConfig } from '../modules/duur/storage';
import { databaseConfig as groeiConfig } from '../modules/groei/storage';
import { databaseConfig as financienConfig } from '../modules/financien/storage';
import { MODULE_IDS, type BackupModuleId } from '../backup';

export const PERSONAL_ECOSYSTEM_DATABASE_CONFIGS: Readonly<Record<BackupModuleId, LocalDatabaseConfig>> = {
  hub: hubConfig,
  sport: sportConfig,
  sidequest: sidequestConfig,
  lichaam: lichaamConfig,
  dagboek: dagboekConfig,
  voeding: voedingConfig,
  kracht: krachtConfig,
  duur: duurConfig,
  groei: groeiConfig,
  financien: financienConfig
};

export const PERSONAL_ECOSYSTEM_DATABASE_NAMES = MODULE_IDS.flatMap((id) => {
  const name = PERSONAL_ECOSYSTEM_DATABASE_CONFIGS[id].databaseName;
  return [name, encryptedDatabaseName(name)];
});

export const PERSONAL_ECOSYSTEM_LOCAL_STORAGE_KEYS = [
  'personal-ecosystem.hub.preferences',
  'personal-ecosystem.backup.last-export',
  'personal-ecosystem.reminders.settings',
  'personal-ecosystem.kracht.concept',
  'personal-ecosystem.dashboard.layout',
  'personal-ecosystem.dashboard.weather-location',
  'personal-ecosystem.vault.record',
  'personal-ecosystem.vault.settings'
] as const;

export interface LocalDataDeletionAdapters {
  indexedDB: Pick<IDBFactory, 'deleteDatabase'>;
  localStorage: Pick<Storage, 'removeItem'>;
  databaseNames: readonly string[];
  localStorageKeys: readonly string[];
  onDatabaseBlocked?: (name: string) => void | Promise<void>;
}

export interface LocalDataDeletionReport {
  deletedDatabases: string[];
  deletedLocalStorageKeys: string[];
}

export class LocalDataDeletionError extends Error {
  constructor(
    readonly report: LocalDataDeletionReport,
    readonly failedDatabases: { name: string; reason: string }[],
    readonly failedLocalStorageKeys: { name: string; reason: string }[],
    readonly failedNotifications: { name: string; reason: string }[] = []
  ) {
    super(
      `Lokale PE-wisactie niet volledig bevestigd. Databasefouten: ${failedDatabases.map(({ name, reason }) => `${name} (${reason})`).join(', ') || 'geen'}; ` +
      `browseropslagfouten: ${failedLocalStorageKeys.map(({ name, reason }) => `${name} (${reason})`).join(', ') || 'geen'}; ` +
      `meldingsfouten: ${failedNotifications.map(({ name, reason }) => `${name} (${reason})`).join(', ') || 'geen'}.`
    );
    this.name = 'LocalDataDeletionError';
  }
}

function deleteDatabase(
  factory: Pick<IDBFactory, 'deleteDatabase'>,
  name: string,
  notifyBlocked: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB kon "${name}" niet verwijderen.`));
    request.onblocked = notifyBlocked;
  });
}

export async function deletePersonalEcosystemLocalData(
  adapters: LocalDataDeletionAdapters = {
    indexedDB: globalThis.indexedDB,
    localStorage: globalThis.localStorage,
    databaseNames: PERSONAL_ECOSYSTEM_DATABASE_NAMES,
    localStorageKeys: PERSONAL_ECOSYSTEM_LOCAL_STORAGE_KEYS
  }
): Promise<LocalDataDeletionReport> {
  if (!adapters.indexedDB || !adapters.localStorage) {
    throw new Error('Lokale PE-opslag is niet beschikbaar; gegevens zijn niet bevestigd verwijderd.');
  }

  return withCrossTabDatabaseLock(() => deletePersonalEcosystemLocalDataWithinLock(adapters));
}

/**
 * Same wipe, for a caller that already holds the cross-tab mutation lock (the logout barrier).
 * Web Locks are not re-entrant, so this variant must not request the lock again.
 */
export async function deletePersonalEcosystemLocalDataWithinLock(adapters: LocalDataDeletionAdapters): Promise<LocalDataDeletionReport> {
  if (!adapters.indexedDB || !adapters.localStorage) {
    throw new Error('Lokale PE-opslag is niet beschikbaar; gegevens zijn niet bevestigd verwijderd.');
  }
  const report: LocalDataDeletionReport = { deletedDatabases: [], deletedLocalStorageKeys: [] };
  const failedDatabases: { name: string; reason: string }[] = [];
  const failedLocalStorageKeys: { name: string; reason: string }[] = [];
  const failedNotifications: { name: string; reason: string }[] = [];
  const notifications: Promise<void>[] = [];

  for (const name of adapters.databaseNames) {
    try {
      await deleteDatabase(adapters.indexedDB, name, () => {
        notifications.push(Promise.resolve()
          .then(() => adapters.onDatabaseBlocked?.(name))
          .catch((cause: unknown) => {
            failedNotifications.push({ name, reason: cause instanceof Error ? cause.message : 'Onbekende fout' });
          }));
      });
      report.deletedDatabases.push(name);
    } catch (cause) {
      failedDatabases.push({ name, reason: cause instanceof Error ? cause.message : 'Onbekende fout' });
    }
  }

  for (const key of adapters.localStorageKeys) {
    try {
      adapters.localStorage.removeItem(key);
      report.deletedLocalStorageKeys.push(key);
    } catch (cause) {
      failedLocalStorageKeys.push({ name: key, reason: cause instanceof Error ? cause.message : 'Onbekende fout' });
    }
  }

  await Promise.all(notifications);
  if (failedDatabases.length || failedLocalStorageKeys.length || failedNotifications.length) {
    throw new LocalDataDeletionError(report, failedDatabases, failedLocalStorageKeys, failedNotifications);
  }
  return report;
}

export const defaultLocalDataDeletionAdapters = (): LocalDataDeletionAdapters => ({
  indexedDB: globalThis.indexedDB,
  localStorage: globalThis.localStorage,
  databaseNames: PERSONAL_ECOSYSTEM_DATABASE_NAMES,
  localStorageKeys: PERSONAL_ECOSYSTEM_LOCAL_STORAGE_KEYS
});

interface StoredBarrier {
  phase: LogoutBarrierPhase;
  startedAt: string;
}

/** Browser barrier: Web Locks shared by all tabs plus the marker the storage adapters check. */
export function browserLogoutBarrier(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = globalThis.localStorage): LogoutBarrier {
  return {
    withSyncExcluded: withSyncExcludedForLogout,
    withMutationsExcluded: withCrossTabDatabaseLock,
    read() {
      const raw = storage.getItem(LOGOUT_BARRIER_STORAGE_KEY);
      if (raw == null) return null;
      try {
        const phase = (JSON.parse(raw) as Partial<StoredBarrier>).phase;
        return phase === 'cleared' ? 'cleared' : 'clearing';
      } catch {
        return 'clearing';
      }
    },
    write(phase) {
      const current = storage.getItem(LOGOUT_BARRIER_STORAGE_KEY);
      let startedAt = new Date().toISOString();
      try {
        if (current) startedAt = (JSON.parse(current) as StoredBarrier).startedAt ?? startedAt;
      } catch { /* een beschadigde markering wordt overschreven */ }
      storage.setItem(LOGOUT_BARRIER_STORAGE_KEY, JSON.stringify({ phase, startedAt } satisfies StoredBarrier));
      if (storage.getItem(LOGOUT_BARRIER_STORAGE_KEY) == null) throw new Error('De afmeldmarkering kon niet worden opgeslagen.');
    },
    clear() {
      storage.removeItem(LOGOUT_BARRIER_STORAGE_KEY);
    }
  };
}

/* ---------- Kluisrecord en instellingen op dit apparaat (ADR 0031 § 2, ADR 0029 § 1) ---------- */

/**
 * Het kluisrecord bevat alleen gezouten, ingepakte sleutels en geen geheimen (zie `VaultRecord`);
 * het staat lokaal zodat de kluis ook offline te openen is. De gegevenssleutel zelf staat hier nooit.
 */
export const VAULT_RECORD_KEY = 'personal-ecosystem.vault.record';
export const VAULT_SETTINGS_KEY = 'personal-ecosystem.vault.settings';

function isWrappedKey(value: unknown): value is WrappedKey {
  return !!value && typeof value === 'object' && typeof (value as WrappedKey).iv === 'string' && typeof (value as WrappedKey).wrapped === 'string';
}

export function parseVaultRecord(value: unknown): VaultRecord {
  const record = value as Partial<VaultRecord> | null;
  if (
    !record || typeof record !== 'object' ||
    record.format !== 1 || record.kdf !== 'PBKDF2-SHA-256' ||
    !Number.isInteger(record.iterations) || (record.iterations ?? 0) < MIN_ITERATIONS ||
    typeof record.passwordSalt !== 'string' || typeof record.recoverySalt !== 'string' ||
    !isWrappedKey(record.wrappedByPassword) || !isWrappedKey(record.wrappedByRecovery)
  ) {
    throw new Error('Het kluisrecord op dit apparaat is ongeldig.');
  }
  const { format, kdf, iterations, passwordSalt, recoverySalt, wrappedByPassword, wrappedByRecovery } = record as VaultRecord;
  return { format, kdf, iterations, passwordSalt, recoverySalt, wrappedByPassword: { ...wrappedByPassword }, wrappedByRecovery: { ...wrappedByRecovery } };
}

export function loadVaultRecord(storage: Pick<Storage, 'getItem'> = globalThis.localStorage): VaultRecord | null {
  const raw = storage.getItem(VAULT_RECORD_KEY);
  if (raw === null) return null;
  return parseVaultRecord(JSON.parse(raw));
}

export function saveVaultRecord(record: VaultRecord, storage: Pick<Storage, 'setItem' | 'getItem'> = globalThis.localStorage): void {
  const clean = parseVaultRecord(record);
  storage.setItem(VAULT_RECORD_KEY, JSON.stringify(clean));
  if (storage.getItem(VAULT_RECORD_KEY) === null) throw new Error('Het kluisrecord kon niet worden opgeslagen.');
}

export function loadInactivityMinutes(storage: Pick<Storage, 'getItem'> = globalThis.localStorage): number {
  try {
    const minutes = (JSON.parse(storage.getItem(VAULT_SETTINGS_KEY) ?? '{}') as { inactivityMinutes?: unknown }).inactivityMinutes;
    return Number.isInteger(minutes) && (minutes as number) >= MIN_INACTIVITY_TIMEOUT_MINUTES && (minutes as number) <= MAX_INACTIVITY_TIMEOUT_MINUTES
      ? minutes as number
      : DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
  } catch {
    return DEFAULT_INACTIVITY_TIMEOUT_MINUTES;
  }
}

export function saveInactivityMinutes(minutes: number, storage: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  storage.setItem(VAULT_SETTINGS_KEY, JSON.stringify({ inactivityMinutes: minutes }));
}
