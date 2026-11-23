import { beforeEach, describe, expect, it } from 'vitest';
import { openLocalDatabase, parseLocalBackup, runStorageAction, type LocalDatabaseConfig } from './index';

const config: LocalDatabaseConfig = {
  appId: 'storage-test',
  databaseName: 'storage-test-db',
  version: 1,
  stores: ['items', 'notes'],
  migrations: {
    1: (database) => {
      database.createObjectStore('items', { keyPath: 'id' });
      database.createObjectStore('notes', { keyPath: 'id' });
    }
  }
};

describe('app-local IndexedDB', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase(config.databaseName);
  });

  it('parses backup JSON and reports corrupted files clearly', () => {
    expect(parseLocalBackup('{"records":[]}')).toEqual({ records: [] });
    expect(() => parseLocalBackup('{')).toThrow('geen geldige JSON');
  });

  it('creates an app-scoped database, persists records and exports them', async () => {
    const database = await openLocalDatabase(config);
    await expect(database.exportData()).resolves.toMatchObject({
      appId: 'storage-test',
      schemaVersion: 1,
      stores: { items: [], notes: [] }
    });
    await database.put('items', { id: 'one', title: 'Saved locally' });

    await expect(database.list('items')).resolves.toEqual([{ id: 'one', title: 'Saved locally' }]);
    await expect(database.exportData()).resolves.toMatchObject({
      appId: 'storage-test',
      schemaVersion: 1,
      stores: { items: [{ id: 'one', title: 'Saved locally' }], notes: [] }
    });
    await expect(database.list('other-app-store')).rejects.toThrow('does not belong');
    database.close();
  });

  it('reads a single record by id', async () => {
    const database = await openLocalDatabase(config);
    await database.put('items', { id: 'two', title: 'Single' });
    await expect(database.get('items', 'two')).resolves.toEqual({ id: 'two', title: 'Single' });
    await expect(database.get('items', 'missing')).resolves.toBeUndefined();
    await expect(database.get('other-app-store', 'two')).rejects.toThrow('does not belong');
    database.close();
  });

  it('closes its connection when another tab requests deletion', async () => {
    const database = await openLocalDatabase(config);
    const deletion = new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(config.databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Local database deletion was blocked.'));
    });

    await expect(deletion).resolves.toBeUndefined();
    await expect(database.list('items')).rejects.toThrow('Local database is closed.');
    database.close();
  });

  it('inserts a record atomically only when its ID is absent', async () => {
    const database = await openLocalDatabase(config);
    const original = { id: 'one', title: 'Original' };
    expect(await database.putIfAbsent('items', original)).toBe(true);
    expect(await database.putIfAbsent('items', { id: 'one', title: 'Must not overwrite' })).toBe(false);
    expect(await database.get('items', 'one')).toEqual(original);
    database.close();
  });

  it('rejects invalid restore data without replacing existing records', async () => {
    const database = await openLocalDatabase(config);
    await database.put('items', { id: 'existing', title: 'Keep this record' });
    const backup = await database.exportData();

    expect(() => database.validateRestore('{')).toThrow('not a valid data file');
    expect(() => database.validateRestore({ ...backup, schemaVersion: 2 })).toThrow('different app');
    expect(() => database.validateRestore({
      ...backup,
      stores: { items: [{ title: 'Missing ID' }], notes: [] }
    })).toThrow('invalid records');
    await expect(database.list('items')).resolves.toEqual([{ id: 'existing', title: 'Keep this record' }]);
    database.close();
  });

  it('rolls back every store when a restore transaction fails after clearing data', async () => {
    const database = await openLocalDatabase(config);
    await database.put('items', { id: 'existing', title: 'Keep this record' });
    await database.put('notes', { id: 'existing-note', title: 'Keep this note' });
    const backup = await database.exportData();

    await expect(database.restore({
      ...backup,
      stores: {
        items: [{ id: 'replacement', title: 'Must roll back' }],
        notes: [{ id: 'uncloneable', callback: () => undefined }]
      }
    })).rejects.toThrow();
    await expect(database.list('items')).resolves.toEqual([{ id: 'existing', title: 'Keep this record' }]);
    await expect(database.list('notes')).resolves.toEqual([{ id: 'existing-note', title: 'Keep this note' }]);
    database.close();
  });

  it('surfaces IndexedDB write failures and can still write afterward', async () => {
    const database = await openLocalDatabase(config);
    await expect(database.put('items', {
      id: 'uncloneable',
      callback: () => undefined
    })).rejects.toThrow();
    await expect(database.list('items')).resolves.toEqual([]);

    await database.put('items', { id: 'valid', title: 'Still available' });
    await expect(database.list('items')).resolves.toEqual([{ id: 'valid', title: 'Still available' }]);
    database.close();
  });

  it('reports failed writes and refreshes exactly once after a successful retry', async () => {
    const database = await openLocalDatabase(config);
    const errors: string[] = [];
    let attempts = 0;
    let refreshes = 0;
    const record = { id: 'stable-id', title: 'Saved once' };
    const action = () => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error('quota exceeded'));
      return database.put('items', record);
    };
    const refresh = async () => {
      refreshes += 1;
      await database.list('items');
    };

    await expect(runStorageAction(action, refresh, (message) => errors.push(message), 'Save failed')).resolves.toBe(false);
    await expect(database.list('items')).resolves.toEqual([]);
    await expect(runStorageAction(action, refresh, (message) => errors.push(message), 'Save failed')).resolves.toBe(true);
    await expect(database.list('items')).resolves.toEqual([record]);
    expect(errors).toEqual(['', 'Opslaan mislukt: quota exceeded', '']);
    expect(refreshes).toBe(1);
    database.close();
  });

  it('does not report a persisted write as failed when refreshing the view fails', async () => {
    const database = await openLocalDatabase(config);
    const errors: string[] = [];
    let writes = 0;
    const saved = await runStorageAction(
      async () => {
        writes += 1;
        await database.put('items', { id: 'committed', title: 'Saved' });
      },
      async () => {
        throw new Error('View unavailable');
      },
      (message) => errors.push(message),
      'Save failed'
    );

    expect(saved).toBe(true);
    expect(writes).toBe(1);
    expect(errors).toEqual([
      '',
      'De gegevens zijn opgeslagen, maar het overzicht kon niet worden bijgewerkt. Vernieuw de pagina om de gegevens opnieuw te laden.'
    ]);
    await expect(database.list('items')).resolves.toEqual([{ id: 'committed', title: 'Saved' }]);
    database.close();
  });

  it('validates restore data and only replaces records after an explicit restore call', async () => {
    const database = await openLocalDatabase(config);
    await database.put('items', { id: 'existing', title: 'Keep until restore' });
    const backup = await database.exportData();
    await expect(database.restore({ ...backup, appId: 'sport' })).rejects.toThrow('different app');
    expect(() => database.validateRestore({ ...backup, appId: 'sport' })).toThrow('different app');
    expect(() => database.validateRestore({ ...backup, stores: { items: [], notes: [], other: [] } })).toThrow('unexpected');
    expect(() => database.validateRestore({
      ...backup,
      stores: { items: [{ id: 'duplicate' }, { id: 'duplicate' }], notes: [] }
    })).toThrow('duplicate record IDs');
    await expect(database.list('items')).resolves.toHaveLength(1);

    await database.restore({
      ...backup,
      stores: { items: [{ id: 'restored', title: 'Recovered' }], notes: [] }
    });
    await expect(database.list('items')).resolves.toEqual([{ id: 'restored', title: 'Recovered' }]);
    database.close();
  });

  it('applies the next schema migration without discarding existing records', async () => {
    const firstVersion = await openLocalDatabase(config);
    await firstVersion.put('items', { id: 'preserved', title: 'Existing' });
    firstVersion.close();

    const secondVersion: LocalDatabaseConfig = {
      ...config,
      version: 2,
      stores: ['items', 'notes', 'tags'],
      migrations: {
        ...config.migrations,
        2: (database) => database.createObjectStore('tags', { keyPath: 'id' })
      }
    };
    const migrated = await openLocalDatabase(secondVersion);
    await expect(migrated.list('items')).resolves.toEqual([{ id: 'preserved', title: 'Existing' }]);
    await expect(migrated.list('notes')).resolves.toEqual([]);
    await expect(migrated.list('tags')).resolves.toEqual([]);
    migrated.close();
  });

  it('restores a backup of an older schema version only through an explicit export upgrade', async () => {
    const firstVersion = await openLocalDatabase(config);
    await firstVersion.put('items', { id: 'old', title: 'From version 1' });
    const oldBackup = await firstVersion.exportData();
    firstVersion.close();

    const secondVersion: LocalDatabaseConfig = {
      ...config,
      version: 2,
      stores: ['items', 'notes', 'tags'],
      migrations: { ...config.migrations, 2: (database) => database.createObjectStore('tags', { keyPath: 'id' }) }
    };
    const withoutUpgrade = await openLocalDatabase(secondVersion);
    expect(() => withoutUpgrade.validateRestore(oldBackup)).toThrow('unsupported data version');
    withoutUpgrade.close();

    const withUpgrade = await openLocalDatabase({ ...secondVersion, exportUpgrades: { 2: (stores) => ({ ...stores, tags: [] }) } });
    expect(() => withUpgrade.validateRestore(oldBackup)).not.toThrow();
    expect(() => withUpgrade.validateRestore({ ...oldBackup, schemaVersion: 3 })).toThrow('unsupported data version');
    expect(() => withUpgrade.validateRestore({ ...oldBackup, schemaVersion: 0 })).toThrow('unsupported data version');
    await withUpgrade.put('tags', { id: 'temporary' });
    await withUpgrade.restore(oldBackup);
    await expect(withUpgrade.list('items')).resolves.toEqual([{ id: 'old', title: 'From version 1' }]);
    await expect(withUpgrade.list('tags')).resolves.toEqual([]);
    expect(oldBackup.stores).not.toHaveProperty('tags');
    withUpgrade.close();
  });
});
