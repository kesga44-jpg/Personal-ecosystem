import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDatabaseMutationLock } from '@ecosystem/storage';
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

beforeEach(() => {
  let previous = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_name: string, _options: LockOptions, operation: () => Promise<unknown>) => {
        const wait = previous;
        let release!: () => void;
        previous = new Promise<void>((resolve) => { release = resolve; });
        await wait;
        try {
          return await operation();
        } finally {
          release();
        }
      }
    }
  });
});

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
  vi.unstubAllGlobals();
});

describe('Personal Ecosystem local data deletion adapter', () => {
  it('refuses deletion before touching either storage when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const deleteDatabase = vi.fn();
    const removeItem = vi.fn();
    await expect(deletePersonalEcosystemLocalData({
      indexedDB: { deleteDatabase },
      localStorage: { removeItem },
      databaseNames: names.slice(0, 1),
      localStorageKeys: keys.slice(0, 1)
    })).rejects.toThrow('browservergrendeling tussen tabbladen');
    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

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

  it('keeps deletion and the mutation lock pending while a database connection blocks it', async () => {
    const open = await openDatabase(names[0]!);
    const deps = adapters([names[0]!], []);
    let blocked!: (name: string) => void;
    const blockedNotification = new Promise<string>((resolve) => { blocked = resolve; });
    deps.onDatabaseBlocked = blocked;
    let deletionSettled = false;
    const deletion = deletePersonalEcosystemLocalData(deps).finally(() => { deletionSettled = true; });
    expect(await blockedNotification).toBe(names[0]);
    let mutationRan = false;
    const mutation = withDatabaseMutationLock(async () => { mutationRan = true; });
    await Promise.resolve();
    expect(deletionSettled).toBe(false);
    expect(mutationRan).toBe(false);
    open.close();
    openConnections.delete(open);
    await expect(deletion).resolves.toEqual({
      deletedDatabases: [names[0]],
      deletedLocalStorageKeys: []
    });
    await mutation;
    expect(mutationRan).toBe(true);
    expect(await databaseNames()).toEqual([]);
  });

  it('waits for the deletion even when the blocked notification fails', async () => {
    const open = await openDatabase(names[0]!);
    let blocked!: () => void;
    const blockedNotification = new Promise<void>((resolve) => { blocked = resolve; });
    const deps = adapters([names[0]!], []);
    deps.onDatabaseBlocked = async () => {
      blocked();
      throw new Error('Notification unavailable.');
    };
    const deletion = deletePersonalEcosystemLocalData(deps);
    await blockedNotification;
    open.close();
    openConnections.delete(open);
    await expect(deletion).rejects.toMatchObject({
      report: { deletedDatabases: [names[0]], deletedLocalStorageKeys: [] },
      failedDatabases: [],
      failedNotifications: [{ name: names[0], reason: 'Notification unavailable.' }]
    });
    expect(await databaseNames()).toEqual([]);
  });
});
