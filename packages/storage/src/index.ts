import { withDatabaseMutationLock } from './coordination';

export type RecordValue = { id: string };

export type DatabaseMigration = (database: IDBDatabase, transaction: IDBTransaction) => void;

export interface LocalDatabaseConfig {
  appId: string;
  databaseName: string;
  version: number;
  stores: readonly string[];
  migrations: Readonly<Record<number, DatabaseMigration>>;
  /**
   * Omzetting van een back-up van versie n naar n + 1, per doelversie (bijv. `2` zet versie 1 om naar 2).
   * Zo blijven back-ups van een oudere schemaversie herstelbaar. Zonder omzetting wordt een oudere back-up geweigerd.
   */
  exportUpgrades?: Readonly<Record<number, (stores: Record<string, RecordValue[]>) => Record<string, RecordValue[]>>>;
}

export interface LocalExport {
  format: 'personal-ecosystem-local-data';
  appId: string;
  schemaVersion: number;
  exportedAt: string;
  stores: Record<string, RecordValue[]>;
}

export interface LocalDatabase {
  readonly appId: string;
  readonly schemaVersion: number;
  list<T extends RecordValue>(store: string): Promise<T[]>;
  /** Eén record op ID, of undefined. */
  get<T extends RecordValue>(store: string, id: string): Promise<T | undefined>;
  put<T extends RecordValue>(store: string, value: T): Promise<void>;
  /** Atomisch invoegen als de ID nog niet bestaat; false als een andere transactie de ID al heeft. */
  putIfAbsent<T extends RecordValue>(store: string, value: T): Promise<boolean>;
  remove(store: string, id: string): Promise<void>;
  exportData(): Promise<LocalExport>;
  validateRestore(data: unknown): void;
  restore(data: unknown): Promise<void>;
  close(): void;
}

export function parseLocalBackup(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error('Back-upbestand bevat geen geldige JSON.');
  }
}

export async function runStorageAction(
  action: () => Promise<void>,
  refresh: () => Promise<void>,
  setError: (message: string) => void,
  failureMessage: string
): Promise<boolean> {
  setError('');
  try {
    await action();
  } catch (cause) {
    const details = cause instanceof Error && cause.message.trim() ? cause.message : failureMessage;
    setError(`Opslaan mislukt: ${details}`);
    return false;
  }

  try {
    await refresh();
  } catch {
    setError('De gegevens zijn opgeslagen, maar het overzicht kon niet worden bijgewerkt. Vernieuw de pagina om de gegevens opnieuw te laden.');
  }
  return true;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Storage transaction failed.'));
  });
}

async function runTransaction<T>(transaction: IDBTransaction, action: () => Promise<T>): Promise<T> {
  const done = transactionDone(transaction);
  try {
    const result = await action();
    await done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have aborted after a failed request.
    }
    await done.catch(() => undefined);
    throw error;
  }
}

function parseExport(config: LocalDatabaseConfig, input: unknown): LocalExport {
  if (!input || typeof input !== 'object') {
    throw new Error('The selected backup is not a valid data file.');
  }

  const backup = input as Partial<LocalExport>;
  if (
    backup.format !== 'personal-ecosystem-local-data' ||
    backup.appId !== config.appId ||
    typeof backup.schemaVersion !== 'number' ||
    !Number.isInteger(backup.schemaVersion) ||
    backup.schemaVersion < 1 ||
    backup.schemaVersion > config.version ||
    !backup.stores ||
    typeof backup.stores !== 'object' ||
    Array.isArray(backup.stores)
  ) {
    throw new Error('This backup belongs to a different app or an unsupported data version.');
  }

  // Oudere back-up: stap voor stap omzetten naar de huidige versie, op een kopie.
  let stores = backup.stores as Record<string, RecordValue[]>;
  for (let version = backup.schemaVersion + 1; version <= config.version; version += 1) {
    const upgrade = config.exportUpgrades?.[version];
    if (!upgrade) throw new Error('This backup belongs to a different app or an unsupported data version.');
    stores = upgrade({ ...stores });
  }

  const expectedStores = new Set(config.stores);
  const providedStores = Object.keys(stores);
  if (providedStores.length !== expectedStores.size || providedStores.some((store) => !expectedStores.has(store))) {
    throw new Error('The backup contains unexpected data stores.');
  }

  for (const store of config.stores) {
    const records = stores[store];
    if (
      !Array.isArray(records) ||
      records.length > 50_000 ||
      !records.every(
        (record) =>
          record !== null &&
          typeof record === 'object' &&
          typeof (record as RecordValue).id === 'string' &&
          (record as RecordValue).id.trim().length > 0 &&
          (record as RecordValue).id.length <= 200
      )
    ) {
      throw new Error(`The backup contains invalid records for "${store}".`);
    }
    if (new Set(records.map((record) => (record as RecordValue).id)).size !== records.length) {
      throw new Error(`The backup contains duplicate record IDs for "${store}".`);
    }
  }

  return { ...(backup as LocalExport), schemaVersion: config.version, stores };
}

export function validateLocalExport(config: LocalDatabaseConfig, input: unknown): LocalExport {
  return parseExport(config, input);
}

export async function openLocalDatabase(config: LocalDatabaseConfig): Promise<LocalDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Local database storage is not available in this browser.');
  }

  const openRequest = indexedDB.open(config.databaseName, config.version);
  openRequest.onupgradeneeded = (event) => {
    const database = openRequest.result;
    const transaction = openRequest.transaction;
    if (!transaction) {
      throw new Error('Could not start the local storage migration.');
    }

    const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
    for (let version = oldVersion + 1; version <= config.version; version += 1) {
      const migration = config.migrations[version];
      if (!migration) {
        transaction.abort();
        throw new Error(`Missing local storage migration ${version} for ${config.appId}.`);
      }
      migration(database, transaction);
    }
  };

  const database = await requestResult(openRequest);
  let closed = false;
  database.onversionchange = () => {
    closed = true;
    database.close();
  };
  const assertOpen = () => {
    if (closed) throw new Error('Local database is closed.');
  };
  const assertStore = (store: string) => {
    assertOpen();
    if (!config.stores.includes(store)) {
      throw new Error(`Storage "${store}" does not belong to ${config.appId}.`);
    }
  };

  return {
    appId: config.appId,
    schemaVersion: config.version,
    async list<T extends RecordValue>(store: string): Promise<T[]> {
      assertStore(store);
      const transaction = database.transaction(store, 'readonly');
      return runTransaction(transaction, async () =>
        await requestResult(transaction.objectStore(store).getAll()) as T[]
      );
    },
    async get<T extends RecordValue>(store: string, id: string): Promise<T | undefined> {
      assertStore(store);
      const transaction = database.transaction(store, 'readonly');
      return runTransaction(transaction, async () =>
        await requestResult(transaction.objectStore(store).get(id)) as T | undefined
      );
    },
    async put<T extends RecordValue>(store: string, value: T): Promise<void> {
      assertStore(store);
      await withDatabaseMutationLock(async () => {
        const transaction = database.transaction(store, 'readwrite');
        await runTransaction(transaction, async () => {
          await requestResult(transaction.objectStore(store).put(value));
        });
      });
    },
    async putIfAbsent<T extends RecordValue>(store: string, value: T): Promise<boolean> {
      assertStore(store);
      try {
        return await withDatabaseMutationLock(async () => {
          const transaction = database.transaction(store, 'readwrite');
          await runTransaction(transaction, async () => {
            await requestResult(transaction.objectStore(store).add(value));
          });
          return true;
        });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'ConstraintError') return false;
        throw cause;
      }
    },
    async remove(store: string, id: string): Promise<void> {
      assertStore(store);
      await withDatabaseMutationLock(async () => {
        const transaction = database.transaction(store, 'readwrite');
        await runTransaction(transaction, async () => {
          await requestResult(transaction.objectStore(store).delete(id));
        });
      });
    },
    async exportData(): Promise<LocalExport> {
      assertOpen();
      const transaction = database.transaction([...config.stores], 'readonly');
      return runTransaction(transaction, async () => {
        const stores: Record<string, RecordValue[]> = {};
        await Promise.all(
          config.stores.map(async (store) => {
            stores[store] = await requestResult(transaction.objectStore(store).getAll()) as RecordValue[];
          })
        );
        return {
          format: 'personal-ecosystem-local-data',
          appId: config.appId,
          schemaVersion: config.version,
          exportedAt: new Date().toISOString(),
          stores
        };
      });
    },
    validateRestore(input: unknown): void {
      parseExport(config, input);
    },
    async restore(input: unknown): Promise<void> {
      assertOpen();
      const backup = parseExport(config, input);
      await withDatabaseMutationLock(async () => {
        const transaction = database.transaction([...config.stores], 'readwrite');
        await runTransaction(transaction, async () => {
          for (const store of config.stores) {
            const objectStore = transaction.objectStore(store);
            await requestResult(objectStore.clear());
            await Promise.all(backup.stores[store]!.map((record) => requestResult(objectStore.put(record))));
          }
        });
      });
    },
    close(): void {
      closed = true;
      database.close();
    }
  };
}

export { encryptedDatabaseLockName, encryptedDatabaseName, openEncryptedLocalDatabase } from './encrypted';
export type { EncryptedDatabaseOptions, EncryptedRecord, EncryptedRecordCodec, KeyProvider, StorageLock } from './encrypted';
export { DATABASE_MUTATION_LOCK, withConsistentDatabaseSnapshot, withCrossTabDatabaseLock, withDatabaseMutationLock } from './coordination';
