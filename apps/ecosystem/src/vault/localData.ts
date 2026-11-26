import { databaseConfig as hubConfig } from '@ecosystem/hub/App';
import { databaseConfig as sportConfig } from '@ecosystem/sportapp/App';
import { databaseConfig as sidequestConfig } from '@ecosystem/sidequest/App';
import { encryptedDatabaseName, withCrossTabDatabaseLock, type LocalDatabaseConfig } from '@ecosystem/storage';
import { databaseConfig as lichaamConfig } from '../modules/lichaam/storage';
import { databaseConfig as dagboekConfig } from '../modules/dagboek/storage';
import { databaseConfig as voedingConfig } from '../modules/voeding/storage';
import { databaseConfig as krachtConfig } from '../modules/kracht/storage';
import { databaseConfig as duurConfig } from '../modules/duur/storage';
import { databaseConfig as groeiConfig } from '../modules/groei/storage';
import { databaseConfig as financienConfig } from '../modules/financien/storage';
import { MODULE_IDS, type BackupModuleId } from '../backup';

const databaseConfigs: Record<BackupModuleId, LocalDatabaseConfig> = {
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
  const name = databaseConfigs[id].databaseName;
  return [name, encryptedDatabaseName(name)];
});

export const PERSONAL_ECOSYSTEM_LOCAL_STORAGE_KEYS = [
  'personal-ecosystem.hub.preferences',
  'personal-ecosystem.backup.last-export',
  'personal-ecosystem.reminders.settings',
  'personal-ecosystem.kracht.concept',
  'personal-ecosystem.dashboard.layout',
  'personal-ecosystem.dashboard.weather-location'
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

  return withCrossTabDatabaseLock(async () => {
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
  });
}
