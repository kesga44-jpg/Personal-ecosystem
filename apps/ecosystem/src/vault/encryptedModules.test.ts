// @vitest-environment node
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  encryptedDatabaseName,
  hasInstalledDatabaseOpener,
  installDatabaseOpener,
  openLocalDatabase,
  openPlainLocalDatabase,
  type LocalDatabase,
  type LocalDatabaseConfig
} from '@ecosystem/storage';
import { createVault } from './crypto';
import { encryptedOpener, exportPlaintextBackup, migrateModulesToEncrypted, plaintextRecordCounts, type ModuleOpeners } from './encryptedModules';

let n = 0;
const config = (): LocalDatabaseConfig => ({
  appId: `synthetic-module-${++n}`,
  databaseName: `synthetic-p6-migration-${n}`,
  version: 1,
  stores: ['items', 'notes'],
  migrations: { 1: (database) => { database.createObjectStore('items', { keyPath: 'id' }); database.createObjectStore('notes', { keyPath: 'id' }); } }
});
let dek: CryptoKey;
const keyProvider = { getKey: () => dek };
const openers: ModuleOpeners = { openPlain: openPlainLocalDatabase, openEncrypted: encryptedOpener(keyProvider) };

beforeAll(async () => {
  dek = (await createVault('synthetisch-wachtwoord-1')).dek;
}, 30_000);
afterEach(() => installDatabaseOpener(null));

async function seed(cfg: LocalDatabaseConfig, records: Record<string, { id: string; [key: string]: unknown }[]>) {
  const database = await openPlainLocalDatabase(cfg);
  for (const [store, list] of Object.entries(records)) for (const record of list) await database.put(store, record);
  database.close();
}

async function rawEncrypted(cfg: LocalDatabaseConfig): Promise<string> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(encryptedDatabaseName(cfg.databaseName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const all: unknown[] = [];
  for (const store of cfg.stores) {
    all.push(await new Promise((resolve, reject) => {
      const request = database.transaction(store).objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  }
  database.close();
  return JSON.stringify(all);
}

describe('alle modules op versleutelde opslag (ADR 0031 § 1)', () => {
  it('zonder geopende kluis opent openLocalDatabase de gewone opslag; met kluis de versleutelde', async () => {
    const cfg = config();
    expect(hasInstalledDatabaseOpener()).toBe(false);
    const plain = await openLocalDatabase(cfg);
    await plain.put('items', { id: 'a', title: 'Gewone opslag' });
    plain.close();

    installDatabaseOpener(encryptedOpener(keyProvider));
    const encrypted = await openLocalDatabase(cfg);
    expect(await encrypted.list('items')).toEqual([]);
    await encrypted.put('items', { id: 'b', title: 'Geheime dagboektekst' });
    expect(await encrypted.get('items', 'b')).toEqual({ id: 'b', title: 'Geheime dagboektekst' });
    encrypted.close();
    const raw = await rawEncrypted(cfg);
    expect(raw).not.toContain('Geheime dagboektekst');
    expect(raw).not.toContain('"b"');
  });
});

describe('overzetting van onversleutelde gegevens (ADR 0031 § 5)', () => {
  it('zet per record over, controleert door teruglezen en wist pas daarna de onversleutelde versie', async () => {
    const cfg = config();
    await seed(cfg, { items: [{ id: 'i1', title: 'Synthetisch doel' }, { id: 'i2', nested: { amountCents: 1234, tags: ['x'] } }], notes: [{ id: 'n1', text: 'Synthetische notitie' }] });
    expect(await plaintextRecordCounts([cfg])).toEqual({ [cfg.appId]: 3 });
    const backup = JSON.parse(await exportPlaintextBackup([cfg])) as { modules: { stores: Record<string, unknown[]> }[] };
    expect(backup.modules[0]!.stores.items).toHaveLength(2);

    const [report] = await migrateModulesToEncrypted([cfg], openers);
    expect(report).toEqual({ appId: cfg.appId, migrated: 3, kept: [] });
    expect(await plaintextRecordCounts([cfg])).toEqual({ [cfg.appId]: 0 });

    const encrypted = await encryptedOpener(keyProvider)(cfg);
    expect(await encrypted.get('items', 'i2')).toEqual({ id: 'i2', nested: { amountCents: 1234, tags: ['x'] } });
    expect(await encrypted.list('notes')).toEqual([{ id: 'n1', text: 'Synthetische notitie' }]);
    encrypted.close();
    expect(await rawEncrypted(cfg)).not.toMatch(/Synthetisch|1234/);

    // Herhaalbaar: een tweede run doet niets.
    expect(await migrateModulesToEncrypted([cfg], openers)).toEqual([{ appId: cfg.appId, migrated: 0, kept: [] }]);
  });

  it('overschrijft nooit een afwijkende versleutelde versie en laat dat record onversleuteld staan', async () => {
    const cfg = config();
    await seed(cfg, { items: [{ id: 'same', v: 1 }, { id: 'other', v: 'lokaal' }] });
    const encrypted = await encryptedOpener(keyProvider)(cfg);
    await encrypted.put('items', { id: 'same', v: 1 });
    await encrypted.put('items', { id: 'other', v: 'al versleuteld' });
    encrypted.close();

    const [report] = await migrateModulesToEncrypted([cfg], openers);
    expect(report!.migrated).toBe(1);
    expect(report!.kept).toEqual([{ store: 'items', id: 'other', reason: expect.stringContaining('niets overschreven') }]);
    const plain = await openPlainLocalDatabase(cfg);
    expect(await plain.list('items')).toEqual([{ id: 'other', v: 'lokaal' }]);
    plain.close();
  });

  it('een teruggelezen versie die afwijkt, of een schrijffout, laat het onversleutelde record staan', async () => {
    const cfg = config();
    await seed(cfg, { items: [{ id: 'kapot', v: 1 }, { id: 'fout', v: 2 }] });
    const lying: ModuleOpeners = {
      openPlain: openPlainLocalDatabase,
      openEncrypted: async (c) => {
        const real = await encryptedOpener(keyProvider)(c);
        return {
          ...real,
          get: async (store: string, id: string) => (id === 'kapot' ? { id, v: 999 } : real.get(store, id)),
          put: async (store: string, value: { id: string }) => { if (value.id === 'fout') throw new Error('Opslag vol.'); return real.put(store, value); },
          close: () => real.close()
        } as LocalDatabase;
      }
    };
    const [report] = await migrateModulesToEncrypted([cfg], lying);
    expect(report!.migrated).toBe(0);
    expect(report!.kept.map((record) => [record.id, record.reason])).toEqual([
      ['fout', 'Opslag vol.'],
      ['kapot', expect.stringContaining('niets overschreven')]
    ]);
    expect(await plaintextRecordCounts([cfg])).toEqual({ [cfg.appId]: 2 });
  });
});
