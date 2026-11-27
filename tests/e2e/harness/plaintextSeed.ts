/**
 * Test-only: zet synthetische, onversleutelde dagboekgegevens klaar zoals een gebruiker ze vóór P-6 had.
 * Wordt door de E2E-test gebundeld en via DevTools in een pagina geladen; nooit onderdeel van een appbuild.
 */
import { openPlainLocalDatabase } from '@ecosystem/storage';
import { databaseConfig } from '../../../apps/ecosystem/src/modules/dagboek/storage';
import { buildEntry } from '../../../apps/ecosystem/src/modules/dagboek/domain';

export async function seedJournal(date: string, text: string): Promise<void> {
  const database = await openPlainLocalDatabase(databaseConfig);
  await database.put('entries', buildEntry({ date, mood: 4, energy: 3, tags: [], gratitude: [], text }));
  database.close();
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
