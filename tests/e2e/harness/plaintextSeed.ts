/**
 * Test-only: zet synthetische, onversleutelde dagboekgegevens klaar zoals een gebruiker ze vóór P-6 had.
 * Wordt door de E2E-test gebundeld en via DevTools in een pagina geladen; nooit onderdeel van een appbuild.
 */
import { openPlainLocalDatabase } from '@ecosystem/storage';
import { databaseConfig } from '../../../apps/ecosystem/src/modules/dagboek/storage';
import { buildEntry } from '../../../apps/ecosystem/src/modules/dagboek/domain';
import { databaseConfig as financienConfig } from '../../../apps/ecosystem/src/modules/financien/storage';
import { validateTransaction } from '../../../apps/ecosystem/src/modules/financien/domain';

export async function seedJournal(date: string, text: string): Promise<void> {
  const database = await openPlainLocalDatabase(databaseConfig);
  await database.put('entries', buildEntry({ date, mood: 4, energy: 3, tags: [], gratitude: [], text }));
  database.close();
}

/** Schrijft veel records in één IndexedDB-transactie; de database is eerst via de adapter aangemaakt. */
async function writeAll(databaseName: string, store: string, records: readonly object[]): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(store, 'readwrite');
    for (const record of records) transaction.objectStore(store).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function dateKey(daysBack: number): string {
  const date = new Date(Date.UTC(2026, 9, 31) - daysBack * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * Grote synthetische proefdataset voor de prestatietest (ADR 0031): één dagboeknotitie per dag en
 * een aantal transacties, in één transactie per store geschreven. Geeft het aantal records terug.
 */
export async function seedLarge(journalDays: number, transactions: number): Promise<number> {
  (await openPlainLocalDatabase(databaseConfig)).close();
  const entries = Array.from({ length: journalDays }, (_, index) =>
    buildEntry({ date: dateKey(index), mood: (index % 5) + 1, energy: (index % 5) + 1, tags: [], gratitude: ['Synthetisch'], text: `Synthetische notitie ${index}. `.repeat(20) })
  );
  await writeAll(databaseConfig.databaseName, 'entries', entries);

  (await openPlainLocalDatabase(financienConfig)).close();
  const now = '2026-11-01T00:00:00.000Z';
  const records = Array.from({ length: transactions }, (_, index) => {
    const record = {
      id: `synthetic-tx-${index}`,
      date: dateKey(index % 1500),
      amountCents: 100 + (index % 9000),
      direction: index % 4 === 0 ? 'in' : 'out',
      kind: 'actual',
      categoryId: null,
      category: '',
      counterparty: `Synthetische winkel ${index % 50}`,
      description: `Synthetische boeking ${index}`,
      sourceId: null,
      potId: null,
      createdAt: now,
      updatedAt: now
    };
    validateTransaction(record);
    return record;
  });
  await writeAll(financienConfig.databaseName, 'transactions', records);
  return entries.length + records.length;
}

/** Ruwe inhoud van alle IndexedDB-databases van deze origin, als tekst; om te controleren dat niets leesbaar is. */
export async function rawIndexedDb(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const { name } of await indexedDB.databases()) {
    if (!name) continue;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores: unknown[] = [];
    for (const store of [...database.objectStoreNames]) {
      stores.push(await new Promise((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }));
    }
    database.close();
    result[name] = JSON.stringify(stores);
  }
  return result;
}
