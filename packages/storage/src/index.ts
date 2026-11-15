export type RecordValue = { id: string };

export type DatabaseMigration = (database: IDBDatabase, transaction: IDBTransaction) => void;

export interface LocalDatabaseConfig {
  appId: string;
  databaseName: string;
  version: number;
  stores: readonly string[];
  migrations: Readonly<Record<number, DatabaseMigration>>;
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
  put<T extends RecordValue>(store: string, value: T): Promise<void>;
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

function parseExport(config: LocalDatabaseConfig, input: unknown): LocalExport {
  if (!input || typeof input !== 'object') {
    throw new Error('The selected backup is not a valid data file.');
  }

  const backup = input as Partial<LocalExport>;
  if (
    backup.format !== 'personal-ecosystem-local-data' ||
    backup.appId !== config.appId ||
    backup.schemaVersion !== config.version ||
    !backup.stores ||
    typeof backup.stores !== 'object'
  ) {
    throw new Error('This backup belongs to a different app or an unsupported data version.');
  }

  const expectedStores = new Set(config.stores);
  const providedStores = Object.keys(backup.stores);
  if (providedStores.length !== expectedStores.size || providedStores.some((store) => !expectedStores.has(store))) {
    throw new Error('The backup contains unexpected data stores.');
  }

  for (const store of config.stores) {
    const records = backup.stores[store];
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

  return backup as LocalExport;
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
  const assertStore = (store: string) => {
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
      const done = transactionDone(transaction);
      const records = await requestResult(transaction.objectStore(store).getAll()) as T[];
      await done;
      return records;
    },
    async put<T extends RecordValue>(store: string, value: T): Promise<void> {
      assertStore(store);
      const transaction = database.transaction(store, 'readwrite');
      const done = transactionDone(transaction);
      await requestResult(transaction.objectStore(store).put(value));
      await done;
    },
    async remove(store: string, id: string): Promise<void> {
      assertStore(store);
      const transaction = database.transaction(store, 'readwrite');
      const done = transactionDone(transaction);
      await requestResult(transaction.objectStore(store).delete(id));
      await done;
    },
    async exportData(): Promise<LocalExport> {
      const transaction = database.transaction([...config.stores], 'readonly');
      const done = transactionDone(transaction);
      const stores: Record<string, RecordValue[]> = {};
      await Promise.all(
        config.stores.map(async (store) => {
          stores[store] = await requestResult(transaction.objectStore(store).getAll()) as RecordValue[];
        })
      );
      await done;
      return {
        format: 'personal-ecosystem-local-data',
        appId: config.appId,
        schemaVersion: config.version,
        exportedAt: new Date().toISOString(),
        stores
      };
    },
    validateRestore(input: unknown): void {
      parseExport(config, input);
    },
    async restore(input: unknown): Promise<void> {
      const backup = parseExport(config, input);
      const transaction = database.transaction([...config.stores], 'readwrite');
      const done = transactionDone(transaction);
      try {
        for (const store of config.stores) {
          const objectStore = transaction.objectStore(store);
          await requestResult(objectStore.clear());
          await Promise.all(backup.stores[store]!.map((record) => requestResult(objectStore.put(record))));
        }
        await done;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have aborted after the failed request.
        }
        await done.catch(() => undefined);
        throw error;
      }
    },
    close(): void {
      database.close();
    }
  };
}
