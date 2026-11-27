// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encryptedDatabaseName, openEncryptedLocalDatabase, type LocalDatabaseConfig } from '@ecosystem/storage';
import { createVault, decryptRecord, encryptRecord, randomItemId } from './crypto';

const config: LocalDatabaseConfig = {
  appId: 'test-module',
  databaseName: 'p6-encrypted-storage-test',
  version: 1,
  stores: ['items', 'notes'],
  migrations: {}
};
const password = 'synthetic local test passphrase';
let dek: CryptoKey;
let database: Awaited<ReturnType<typeof openEncryptedLocalDatabase>> | undefined;

const codec = { encryptRecord, decryptRecord, randomItemId };
const keyProvider = { getKey: () => dek };

function open() {
  return openEncryptedLocalDatabase(config, { keyProvider, codec });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Encrypted test database deletion was blocked.'));
  });
}

async function rawItems(): Promise<Record<string, unknown>[]> {
  const raw = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(encryptedDatabaseName(config.databaseName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const transaction = raw.transaction('items', 'readonly');
  const request = transaction.objectStore('items').getAll();
  const records = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
    request.onerror = () => reject(request.error);
  });
  raw.close();
  return records;
}

beforeAll(async () => {
  ({ dek } = await createVault(password));
}, 30_000);

beforeEach(async () => {
  await deleteDatabase(encryptedDatabaseName(config.databaseName));
  database = await open();
});

afterEach(() => {
  database?.close();
  database = undefined;
});

describe('versleutelde lokale opslag', () => {
  it('bewaart alleen willekeurige record-ID’s en versleutelde velden in IndexedDB', async () => {
    await database!.put('items', { id: 'private-record-id', title: 'synthetic private note' });

    const records = await rawItems();
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0]!).sort()).toEqual(['ciphertext', 'deleted', 'itemId', 'iv', 'module', 'version']);
    expect(JSON.stringify(records)).not.toContain('private-record-id');
    expect(JSON.stringify(records)).not.toContain('synthetic private note');
    expect(records[0]!.itemId).not.toBe('private-record-id');
    await expect(database!.get('items', 'private-record-id')).resolves.toEqual({
      id: 'private-record-id',
      title: 'synthetic private note'
    });
  });

  it('heropent zonder opgeslagen sleutel en weigert een andere sleutel', async () => {
    await database!.put('items', { id: 'reopen-id', title: 'synthetic value' });
    database!.close();
    database = await open();
    await expect(database.get('items', 'reopen-id')).resolves.toEqual({ id: 'reopen-id', title: 'synthetic value' });

    const correctKey = dek;
    const other = await createVault('another synthetic test passphrase');
    dek = other.dek;
    await expect(database.get('items', 'reopen-id')).rejects.toThrow('kon niet worden ontsleuteld');
    dek = correctKey;
  }, 30_000);

  it('closes its encrypted IndexedDB connection when deletion is requested', async () => {
    await deleteDatabase(encryptedDatabaseName(config.databaseName));
    await expect(database!.get('items', 'missing')).rejects.toThrow('Versleutelde lokale database is gesloten.');
  });

  it('maakt putIfAbsent veilig herhaalbaar en bewaart verwijderingen als versleutelde tombstones', async () => {
    const first = { id: 'stable-id', title: 'original' };
    const results = await Promise.all([
      database!.putIfAbsent('items', first),
      database!.putIfAbsent('items', { id: 'stable-id', title: 'duplicate' })
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(await database!.get('items', 'stable-id')).toEqual(first);

    await database!.remove('items', 'stable-id');
    await expect(database!.get('items', 'stable-id')).resolves.toBeUndefined();
    expect(await rawItems()).toMatchObject([{ deleted: true, version: 2 }]);
    await expect(database!.putIfAbsent('items', { id: 'stable-id', title: 'restored' })).resolves.toBe(true);
    expect(await database!.get('items', 'stable-id')).toEqual({ id: 'stable-id', title: 'restored' });
    expect(await rawItems()).toMatchObject([{ deleted: false, version: 3 }]);
  });

  it('exporteert ontsleuteld alleen op expliciet verzoek en herstelt versleuteld', async () => {
    await database!.put('items', { id: 'before', title: 'synthetic old value' });
    const backup = await database!.exportData();
    await database!.put('items', { id: 'extra', title: 'will be replaced' });

    await expect(database!.restore({ ...backup, appId: 'another-module' })).rejects.toThrow('different app');
    await expect(database!.get('items', 'extra')).resolves.toEqual({ id: 'extra', title: 'will be replaced' });
    await database!.restore(backup);
    await expect(database!.list('items')).resolves.toEqual([{ id: 'before', title: 'synthetic old value' }]);
    const raw = await rawItems();
    expect(JSON.stringify(raw)).not.toContain('synthetic old value');
  });

  it('laat bestaande gegevens intact als versleuteling tijdens herstel faalt', async () => {
    await database!.put('items', { id: 'preserve-on-failure', title: 'synthetic existing value' });
    const backup = await database!.exportData();
    const failing = await openEncryptedLocalDatabase(config, {
      keyProvider,
      codec: { ...codec, encryptRecord: async () => { throw new Error('synthetic crypto failure'); } }
    });

    await expect(failing.restore(backup)).rejects.toThrow('synthetic crypto failure');
    await expect(database!.get('items', 'preserve-on-failure')).resolves.toEqual({
      id: 'preserve-on-failure',
      title: 'synthetic existing value'
    });
    failing.close();
  });

  it('schrijft niets wanneer ontgrendeling of versleuteling faalt', async () => {
    const locked = await openEncryptedLocalDatabase(config, {
      keyProvider: { getKey: () => { throw new Error('Kluis is vergrendeld.'); } },
      codec
    });
    await expect(locked.put('items', { id: 'locked', title: 'synthetic secret' })).rejects.toThrow('vergrendeld');
    await expect(locked.list('items')).rejects.toThrow('vergrendeld');
    locked.close();
    await expect(database!.put('items', { id: 'not-json', value: 1n } as unknown as { id: string })).rejects.toThrow('alleen JSON');
    await expect(database!.list('items')).resolves.toEqual([]);
  });

  it('weigert records te lezen als ciphertext naar een andere store is verplaatst', async () => {
    await database!.put('items', { id: 'bound-store', title: 'synthetic value' });
    const source = await rawItems();
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(encryptedDatabaseName(config.databaseName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = raw.transaction(['items', 'notes'], 'readwrite');
    transaction.objectStore('items').clear();
    transaction.objectStore('notes').put(source[0]);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    raw.close();
    await expect(database!.list('notes')).rejects.toThrow('hoort niet bij deze store');
  });

  describe('index record-ID → opslag-ID (prestaties)', () => {
    function counting() {
      let decrypts = 0;
      const counted = { ...codec, decryptRecord: (...args: Parameters<typeof decryptRecord>) => { decrypts += 1; return decryptRecord(...args); } };
      return { open: () => openEncryptedLocalDatabase(config, { keyProvider, codec: counted }), decrypts: () => decrypts };
    }

    it('ontsleutelt bij get, put en remove niet meer de hele store zodra de index er is', async () => {
      database!.close();
      const counter = counting();
      database = await counter.open();
      for (let index = 0; index < 60; index += 1) await database.put('items', { id: `item-${index}`, title: `synthetisch ${index}` });
      const before = counter.decrypts();
      await expect(database.get('items', 'item-42')).resolves.toEqual({ id: 'item-42', title: 'synthetisch 42' });
      await database.put('items', { id: 'item-7', title: 'aangepast' });
      await database.remove('items', 'item-8');
      await expect(database.get('items', 'item-8')).resolves.toBeUndefined();
      await expect(database.get('items', 'bestaat-niet')).resolves.toBeUndefined();
      expect(counter.decrypts() - before).toBeLessThanOrEqual(6);
      expect((await database.list('items')).map((item) => item.id)).toHaveLength(59);
    });

    it('vindt een record dat een ander tabblad toevoegde en overschrijft het niet dubbel', async () => {
      await database!.put('items', { id: 'a', title: 'tabblad A' });
      await database!.get('items', 'a'); // index opgebouwd
      const other = await open();
      await other.put('items', { id: 'b', title: 'tabblad B' });
      other.close();
      await expect(database!.get('items', 'b')).resolves.toEqual({ id: 'b', title: 'tabblad B' });
      await database!.put('items', { id: 'b', title: 'bijgewerkt in A' });
      expect(await rawItems()).toHaveLength(2);
      await expect(database!.get('items', 'b')).resolves.toEqual({ id: 'b', title: 'bijgewerkt in A' });
    });

    it('een herstel in een ander tabblad maakt de index ongeldig, ook bij een gelijk aantal records', async () => {
      await database!.put('items', { id: 'oud', title: 'oud' });
      await database!.get('items', 'oud');
      const other = await open();
      const backup = await other.exportData();
      backup.stores.items = [{ id: 'nieuw', title: 'na herstel' } as { id: string }];
      await other.restore(backup);
      other.close();
      await new Promise((resolve) => setTimeout(resolve, 20)); // BroadcastChannel-bericht afleveren
      await expect(database!.get('items', 'nieuw')).resolves.toEqual({ id: 'nieuw', title: 'na herstel' });
      await expect(database!.get('items', 'oud')).resolves.toBeUndefined();
      await database!.put('items', { id: 'nieuw', title: 'bijgewerkt' });
      expect(await rawItems()).toHaveLength(1);
    });
  });
});
