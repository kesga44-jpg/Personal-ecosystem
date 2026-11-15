import { beforeEach, describe, expect, it } from 'vitest';
import { openLocalDatabase, type LocalDatabaseConfig } from './index';

const config: LocalDatabaseConfig = {
  appId: 'storage-test',
  databaseName: 'storage-test-db',
  version: 1,
  stores: ['items'],
  migrations: {
    1: (database) => database.createObjectStore('items', { keyPath: 'id' })
  }
};

describe('app-local IndexedDB', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase(config.databaseName);
  });

  it('creates an app-scoped database, persists records and exports them', async () => {
    const database = await openLocalDatabase(config);
    await database.put('items', { id: 'one', title: 'Saved locally' });

    await expect(database.list('items')).resolves.toEqual([{ id: 'one', title: 'Saved locally' }]);
    await expect(database.exportData()).resolves.toMatchObject({
      appId: 'storage-test',
      schemaVersion: 1,
      stores: { items: [{ id: 'one', title: 'Saved locally' }] }
    });
    await expect(database.list('other-app-store')).rejects.toThrow('does not belong');
    database.close();
  });

  it('validates restore data and only replaces records after an explicit restore call', async () => {
    const database = await openLocalDatabase(config);
    await database.put('items', { id: 'existing', title: 'Keep until restore' });
    const backup = await database.exportData();
    await expect(database.restore({ ...backup, appId: 'sport' })).rejects.toThrow('different app');
    expect(() => database.validateRestore({ ...backup, appId: 'sport' })).toThrow('different app');
    expect(() => database.validateRestore({ ...backup, stores: { items: [], other: [] } })).toThrow('unexpected');
    expect(() => database.validateRestore({
      ...backup,
      stores: { items: [{ id: 'duplicate' }, { id: 'duplicate' }] }
    })).toThrow('duplicate record IDs');
    await expect(database.list('items')).resolves.toHaveLength(1);

    await database.restore({
      ...backup,
      stores: { items: [{ id: 'restored', title: 'Recovered' }] }
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
      stores: ['items', 'notes'],
      migrations: {
        ...config.migrations,
        2: (database) => database.createObjectStore('notes', { keyPath: 'id' })
      }
    };
    const migrated = await openLocalDatabase(secondVersion);
    await expect(migrated.list('items')).resolves.toEqual([{ id: 'preserved', title: 'Existing' }]);
    await expect(migrated.list('notes')).resolves.toEqual([]);
    migrated.close();
  });
});
