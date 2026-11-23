import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  deletePersonalEcosystemLocalData,
  LocalDataDeletionError,
  PERSONAL_ECOSYSTEM_DATABASE_NAMES,
  type LocalDataDeletionAdapters
} from './localData';

const names = ['synthetic-pe-plain', 'synthetic-pe-encrypted', 'synthetic-unrelated'];
const keys = ['personal-ecosystem.synthetic', 'unrelated.preference'];
const openConnections = new Set<IDBDatabase>();

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => {
      openConnections.add(request.result);
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error(`Could not create ${name}.`));
  });
}

async function databaseNames(): Promise<string[]> {
  return (await indexedDB.databases()).map((database) => database.name!).sort();
}

const storage = new Map<string, string>(keys.map((key) => [key, 'synthetic']));

function adapters(
  databaseNames = names.slice(0, 2),
  localStorageKeys = keys.slice(0, 1),
  removeItem: (key: string) => void = (key) => { storage.delete(key); }
): LocalDataDeletionAdapters {
  return {
    indexedDB,
    localStorage: { removeItem },
    databaseNames,
    localStorageKeys
  };
}

afterEach(async () => {
  for (const connection of openConnections) connection.close();
  openConnections.clear();
  for (const name of names) {
    const request = indexedDB.deleteDatabase(name);
    await new Promise<void>((resolve) => {
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }
  storage.clear();
  for (const key of keys) storage.set(key, 'synthetic');
});

describe('Personal Ecosystem local data deletion adapter', () => {
  it('registers only the ten PE module databases and their encrypted counterparts', () => {
    expect(PERSONAL_ECOSYSTEM_DATABASE_NAMES).toEqual([
      'personal-ecosystem-hub',
      'personal-ecosystem-hub-encrypted',
      'personal-ecosystem-sport',
      'personal-ecosystem-sport-encrypted',
      'personal-ecosystem-sidequest',
      'personal-ecosystem-sidequest-encrypted',
      'personal-ecosystem-lichaam',
      'personal-ecosystem-lichaam-encrypted',
      'personal-ecosystem-dagboek',
      'personal-ecosystem-dagboek-encrypted',
      'personal-ecosystem-voeding',
      'personal-ecosystem-voeding-encrypted',
      'personal-ecosystem-kracht',
      'personal-ecosystem-kracht-encrypted',
      'personal-ecosystem-duur',
      'personal-ecosystem-duur-encrypted',
      'personal-ecosystem-groei',
      'personal-ecosystem-groei-encrypted',
      'personal-ecosystem-financien',
      'personal-ecosystem-financien-encrypted'
    ]);
  });

  it('deletes only the explicitly scoped PE databases and keys; repeated deletion is safe', async () => {
    for (const name of names) (await openDatabase(name)).close();
    const deps = adapters();

    await expect(deletePersonalEcosystemLocalData(deps)).resolves.toEqual({
      deletedDatabases: names.slice(0, 2),
      deletedLocalStorageKeys: keys.slice(0, 1)
    });
    expect(await databaseNames()).toEqual(['synthetic-unrelated']);
    expect(storage.has(keys[0]!)).toBe(false);
    expect(storage.has(keys[1]!)).toBe(true);

    await expect(deletePersonalEcosystemLocalData(deps)).resolves.toEqual({
      deletedDatabases: names.slice(0, 2),
      deletedLocalStorageKeys: keys.slice(0, 1)
    });
    expect(await databaseNames()).toEqual(['synthetic-unrelated']);
  });

  it('reports partial failures with completed effects and continues safe cleanup', async () => {
    for (const name of names.slice(0, 2)) (await openDatabase(name)).close();
    const deps = adapters(names.slice(0, 2), keys, (key) => {
      if (key === keys[0]) throw new Error('Storage access denied.');
      storage.delete(key);
    });

    await expect(deletePersonalEcosystemLocalData(deps)).rejects.toMatchObject<Partial<LocalDataDeletionError>>({
      report: {
        deletedDatabases: names.slice(0, 2),
        deletedLocalStorageKeys: [keys[1]!]
      },
      failedDatabases: [],
      failedLocalStorageKeys: [{ name: keys[0]!, reason: 'Storage access denied.' }]
    });
    expect(await databaseNames()).toEqual([]);
    expect(storage.has(keys[0]!)).toBe(true);
    expect(storage.has(keys[1]!)).toBe(false);
  });

  it('does not claim success when a PE database is still open and can be retried after closing it', async () => {
    const open = await openDatabase(names[0]!);
    const deps = adapters([names[0]!], []);

    await expect(deletePersonalEcosystemLocalData(deps)).rejects.toMatchObject({
      failedDatabases: [{ name: names[0], reason: expect.stringContaining('nog geopend') }]
    });
    open.close();
    openConnections.delete(open);

    await expect(deletePersonalEcosystemLocalData(deps)).resolves.toEqual({
      deletedDatabases: [names[0]],
      deletedLocalStorageKeys: []
    });
    expect(await databaseNames()).toEqual([]);
  });
});
