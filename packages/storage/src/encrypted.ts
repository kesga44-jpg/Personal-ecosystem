import { validateLocalExport, type LocalDatabase, type LocalDatabaseConfig, type LocalExport, type RecordValue } from './index';
import { withDatabaseMutationLock } from './coordination';

export interface EncryptedRecord {
  module: string;
  itemId: string;
  version: number;
  iv: string;
  ciphertext: string;
  deleted: boolean;
}

export interface EncryptedRecordCodec {
  encryptRecord(
    dek: CryptoKey,
    module: string,
    itemId: string,
    version: number,
    payload: unknown,
    deleted?: boolean
  ): Promise<EncryptedRecord>;
  decryptRecord(dek: CryptoKey, item: EncryptedRecord): Promise<unknown>;
  randomItemId(): string;
}

export interface KeyProvider {
  getKey(): CryptoKey;
}

export type StorageLock = <T>(name: string, operation: () => Promise<T>) => Promise<T>;

export interface EncryptedDatabaseOptions {
  keyProvider: KeyProvider;
  codec: EncryptedRecordCodec;
  lock?: StorageLock;
}

interface EnvelopePayload {
  store: string;
  id: string;
  value: unknown;
}

interface StoredEnvelope extends EncryptedRecord {}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

async function readEnvelope(database: IDBDatabase, store: string, itemId: string): Promise<StoredEnvelope | undefined> {
  const transaction = database.transaction(store, 'readonly');
  const done = transactionDone(transaction);
  const request = requestResult(transaction.objectStore(store).get(itemId) as IDBRequest<StoredEnvelope | undefined>);
  const [envelope] = await Promise.all([request, done]);
  return envelope;
}

async function countEnvelopes(database: IDBDatabase, store: string): Promise<number> {
  const transaction = database.transaction(store, 'readonly');
  const done = transactionDone(transaction);
  const request = requestResult(transaction.objectStore(store).count());
  const [count] = await Promise.all([request, done]);
  return count;
}

async function readEnvelopes(database: IDBDatabase, store: string): Promise<StoredEnvelope[]> {
  const transaction = database.transaction(store, 'readonly');
  const done = transactionDone(transaction);
  const request = requestResult(transaction.objectStore(store).getAll() as IDBRequest<StoredEnvelope[]>);
  const [envelopes] = await Promise.all([request, done]);
  return envelopes;
}

function validRecord(value: unknown): value is RecordValue {
  return !!value && typeof value === 'object' && typeof (value as RecordValue).id === 'string' && (value as RecordValue).id.length > 0;
}

function jsonClone(value: unknown): unknown {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('Versleutelde lokale opslag accepteert alleen JSON-gegevens.');
  }
  if (serialized === undefined) throw new Error('Versleutelde lokale opslag accepteert alleen JSON-gegevens.');
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('Versleutelde lokale opslag kon de gegevens niet voorbereiden.');
  }
}

function inProcessLock(): StorageLock {
  const queues = new Map<string, Promise<void>>();
  return async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
    const previous = queues.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    queues.set(name, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (queues.get(name) === current) queues.delete(name);
    }
  };
}

const processLock = inProcessLock();

const browserLock: StorageLock = async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
  const locks = globalThis.navigator?.locks;
  if (typeof window !== 'undefined' && !locks) {
    throw new Error('Veilige opslag vereist ondersteuning voor browservergrendeling tussen tabbladen.');
  }
  return locks
    ? locks.request(name, { mode: 'exclusive' }, operation)
    : processLock(name, operation);
};

function envelopeShape(value: unknown, module: string): value is StoredEnvelope {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StoredEnvelope>;
  return item.module === module &&
    typeof item.itemId === 'string' && /^[A-Za-z0-9_-]{22}$/.test(item.itemId) &&
    Number.isInteger(item.version) && (item.version ?? 0) > 0 &&
    typeof item.iv === 'string' && typeof item.ciphertext === 'string' &&
    typeof item.deleted === 'boolean';
}

export function encryptedDatabaseName(databaseName: string): string {
  return `${databaseName}-encrypted`;
}

export function encryptedDatabaseLockName(databaseName: string): string {
  return `pe-storage:${encryptedDatabaseName(databaseName)}`;
}

export async function openEncryptedLocalDatabase(
  config: LocalDatabaseConfig,
  options: EncryptedDatabaseOptions
): Promise<LocalDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('Local database storage is not available in this browser.');
  if (!config.stores.length || new Set(config.stores).size !== config.stores.length) {
    throw new Error('Versleutelde opslag vereist een unieke lijst met stores.');
  }

  const physicalName = encryptedDatabaseName(config.databaseName);
  const openRequest = indexedDB.open(physicalName, config.version);
  openRequest.onupgradeneeded = () => {
    const database = openRequest.result;
    for (const store of config.stores) {
      if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: 'itemId' });
    }
  };
  const database = await requestResult(openRequest);
  let closed = false;
  database.onversionchange = () => {
    closed = true;
    indexes.clear();
    database.close();
  };
  const assertStore = (store: string) => {
    if (closed) throw new Error('Versleutelde lokale database is gesloten.');
    if (!config.stores.includes(store)) throw new Error(`Storage "${store}" does not belong to ${config.appId}.`);
  };
  const lock = options.lock ?? browserLock;

  /**
   * Index record-ID → willekeurige opslag-ID per store, alleen in het geheugen van deze geopende database
   * (weg bij sluiten/vergrendelen). Zonder index moet elke get/put/remove alle records van de store
   * ontsleutelen. De index geldt alleen zolang het aantal envelopes gelijk is aan dat bij het opbouwen;
   * een treffer wordt altijd ontsleuteld en gecontroleerd. Een herstel (ook in een ander tabblad) wist de index.
   */
  interface StoreIndex { count: number; itemIds: Map<string, string> }
  const indexes = new Map<string, StoreIndex>();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(encryptedDatabaseLockName(config.databaseName)) : null;
  if (channel) channel.onmessage = () => indexes.clear();

  function indexFrom(envelopes: readonly StoredEnvelope[], decoded: readonly { record: RecordValue }[]): StoreIndex {
    const itemIds = new Map<string, string>();
    decoded.forEach((item, position) => {
      if (!itemIds.has(item.record.id)) itemIds.set(item.record.id, envelopes[position]!.itemId);
    });
    return { count: envelopes.length, itemIds };
  }

  async function decode(store: string, envelope: StoredEnvelope): Promise<{ record: RecordValue; deleted: boolean }> {
    if (!envelopeShape(envelope, config.appId)) throw new Error('Versleutelde lokale opslag bevat ongeldige metadata.');
    const payload = await options.codec.decryptRecord(options.keyProvider.getKey(), envelope);
    if (!payload || typeof payload !== 'object') throw new Error('Versleuteld lokaal record heeft een ongeldige inhoud.');
    const item = payload as Partial<EnvelopePayload>;
    if (item.store !== store || typeof item.id !== 'string' || item.id.length === 0 || !('value' in item)) {
      throw new Error('Versleuteld lokaal record hoort niet bij deze store of heeft een ongeldige inhoud.');
    }
    if (envelope.deleted) {
      if (item.value !== null) throw new Error('Versleuteld lokaal verwijderrecord heeft een ongeldige inhoud.');
      return { record: { id: item.id }, deleted: true };
    }
    if (!validRecord(item.value) || item.value.id !== item.id) {
      throw new Error('Versleuteld lokaal record heeft een ongeldige inhoud.');
    }
    return { record: item.value, deleted: false };
  }

  /** Alleen aanroepen terwijl de databaselock vastgehouden wordt. */
  async function find(store: string, id: string): Promise<{ envelope: StoredEnvelope; deleted: boolean } | undefined> {
    options.keyProvider.getKey();
    const index = indexes.get(store);
    if (index && index.count === await countEnvelopes(database, store)) {
      const itemId = index.itemIds.get(id);
      if (itemId === undefined) return undefined;
      const envelope = await readEnvelope(database, store, itemId);
      if (envelope) {
        const decoded = await decode(store, envelope);
        if (decoded.record.id === id) return { envelope, deleted: decoded.deleted };
      }
    }
    const envelopes = await readEnvelopes(database, store);
    const decoded: { record: RecordValue; deleted: boolean }[] = [];
    for (const envelope of envelopes) decoded.push(await decode(store, envelope));
    indexes.set(store, indexFrom(envelopes, decoded));
    const position = decoded.findIndex((item) => item.record.id === id);
    return position === -1 ? undefined : { envelope: envelopes[position]!, deleted: decoded[position]!.deleted };
  }

  /** Na een geslaagde nieuwe envelope (onder de lock): index bijwerken zonder opnieuw te scannen. */
  function indexInsert(store: string, id: string, itemId: string): void {
    const index = indexes.get(store);
    if (!index) return;
    index.itemIds.set(id, itemId);
    index.count += 1;
  }

  async function encode(store: string, record: RecordValue, existing?: StoredEnvelope): Promise<StoredEnvelope> {
    const itemId = existing?.itemId ?? options.codec.randomItemId();
    if (!/^[A-Za-z0-9_-]{22}$/.test(itemId)) throw new Error('De versleutelde opslagcode leverde geen geldige willekeurige record-ID.');
    const version = (existing?.version ?? 0) + 1;
    const payload: EnvelopePayload = { store, id: record.id, value: jsonClone(record) };
    const envelope = await options.codec.encryptRecord(options.keyProvider.getKey(), config.appId, itemId, version, payload);
    if (!envelopeShape(envelope, config.appId) || envelope.itemId !== itemId || envelope.version !== version || envelope.deleted) {
      throw new Error('De versleutelde opslagcode leverde een ongeldig record op.');
    }
    return envelope;
  }

  async function writeEnvelope(store: string, envelope: StoredEnvelope, insertOnly = false): Promise<void> {
    const transaction = database.transaction(store, 'readwrite');
    const done = transactionDone(transaction);
    try {
      const objectStore = transaction.objectStore(store);
      await requestResult(insertOnly ? objectStore.add(envelope) : objectStore.put(envelope));
      await done;
    } catch (cause) {
      try { transaction.abort(); } catch { /* The transaction may already have aborted. */ }
      await done.catch(() => undefined);
      throw cause;
    }
  }

  async function listStore(store: string): Promise<RecordValue[]> {
    options.keyProvider.getKey();
    const envelopes = await readEnvelopes(database, store);
    const decoded = await Promise.all(envelopes.map((item) => decode(store, item)));
    indexes.set(store, indexFrom(envelopes, decoded));
    return decoded.filter((item) => !item.deleted).map((item) => item.record).sort((a, b) => a.id.localeCompare(b.id));
  }

  return {
    appId: config.appId,
    schemaVersion: config.version,
    async list<T extends RecordValue>(store: string): Promise<T[]> {
      assertStore(store);
      return lock(encryptedDatabaseLockName(config.databaseName), async () => {
        assertStore(store);
        return await listStore(store) as T[];
      });
    },
    async get<T extends RecordValue>(store: string, id: string): Promise<T | undefined> {
      assertStore(store);
      return lock(encryptedDatabaseLockName(config.databaseName), async () => {
        assertStore(store);
        const found = await find(store, id);
        if (!found || found.deleted) return undefined;
        return (await decode(store, found.envelope)).record as T;
      });
    },
    async put<T extends RecordValue>(store: string, value: T): Promise<void> {
      assertStore(store);
      if (!validRecord(value)) throw new Error('Versleutelde lokale records vereisen een niet-lege ID.');
      await withDatabaseMutationLock(() => lock(encryptedDatabaseLockName(config.databaseName), async () => {
        assertStore(store);
        const found = await find(store, value.id);
        const envelope = await encode(store, value, found?.envelope);
        await writeEnvelope(store, envelope);
        if (!found) indexInsert(store, value.id, envelope.itemId);
      }));
    },
    async putIfAbsent<T extends RecordValue>(store: string, value: T): Promise<boolean> {
      assertStore(store);
      if (!validRecord(value)) throw new Error('Versleutelde lokale records vereisen een niet-lege ID.');
      return withDatabaseMutationLock(() => lock(encryptedDatabaseLockName(config.databaseName), async () => {
        assertStore(store);
        const found = await find(store, value.id);
        if (found && !found.deleted) return false;
        const envelope = await encode(store, value, found?.envelope);
        await writeEnvelope(store, envelope, !found);
        if (!found) indexInsert(store, value.id, envelope.itemId);
        return true;
      }));
    },
    async remove(store: string, id: string): Promise<void> {
      assertStore(store);
      await withDatabaseMutationLock(() => lock(encryptedDatabaseLockName(config.databaseName), async () => {
        assertStore(store);
        const found = await find(store, id);
        if (!found || found.deleted) return;
        const tombstone = await options.codec.encryptRecord(
          options.keyProvider.getKey(),
          config.appId,
          found.envelope.itemId,
          found.envelope.version + 1,
          { store, id, value: null } satisfies EnvelopePayload,
          true
        );
        if (!envelopeShape(tombstone, config.appId) ||
            tombstone.itemId !== found.envelope.itemId ||
            tombstone.version !== found.envelope.version + 1 ||
            !tombstone.deleted) {
          throw new Error('De versleutelde opslagcode leverde een ongeldig verwijderrecord op.');
        }
        await writeEnvelope(store, tombstone);
      }));
    },
    async exportData(): Promise<LocalExport> {
      if (closed) throw new Error('Versleutelde lokale database is gesloten.');
      return lock(encryptedDatabaseLockName(config.databaseName), async () => {
        if (closed) throw new Error('Versleutelde lokale database is gesloten.');
        const stores: LocalExport['stores'] = {};
        for (const store of config.stores) stores[store] = await listStore(store);
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
      if (closed) throw new Error('Versleutelde lokale database is gesloten.');
      validateLocalExport(config, input);
    },
    async restore(input: unknown): Promise<void> {
      assertStore(config.stores[0]!);
      options.keyProvider.getKey();
      const backup = validateLocalExport(config, input);
      await withDatabaseMutationLock(() => lock(encryptedDatabaseLockName(config.databaseName), async () => {
        if (closed) throw new Error('Versleutelde lokale database is gesloten.');
        indexes.clear();
        const envelopes = await Promise.all(config.stores.flatMap((store) =>
          backup.stores[store]!.map(async (record) =>
            [store, await encode(store, record)] as const
          )
        ));
        const transaction = database.transaction([...config.stores], 'readwrite');
        const done = transactionDone(transaction);
        try {
          for (const store of config.stores) await requestResult(transaction.objectStore(store).clear());
          for (const [store, envelope] of envelopes) await requestResult(transaction.objectStore(store).put(envelope));
          await done;
          channel?.postMessage('restored');
        } catch (cause) {
          try { transaction.abort(); } catch { /* The transaction may already have aborted. */ }
          await done.catch(() => undefined);
          throw cause;
        }
      }));
    },
    close(): void {
      closed = true;
      indexes.clear();
      channel?.close();
      database.close();
    }
  };
}
