import {
  openEncryptedLocalDatabase,
  openPlainLocalDatabase,
  type DatabaseOpener,
  type KeyProvider,
  type LocalDatabase,
  type LocalDatabaseConfig,
  type RecordValue
} from '@ecosystem/storage';
import { decryptRecord, encryptRecord, randomItemId } from './crypto';
import { canonicalJson } from './sync';

/**
 * P-6 stap 5, deel 2 (ADR 0031 § 1 en § 5): alle moduledatabases versleuteld, en een expliciete,
 * per record gecontroleerde overzetting van de onversleutelde gegevens van vóór P-6.
 */
const codec = { encryptRecord, decryptRecord, randomItemId };

export function encryptedOpener(keyProvider: KeyProvider): DatabaseOpener {
  return (config) => openEncryptedLocalDatabase(config, { keyProvider, codec });
}

export interface ModuleOpeners {
  openPlain(config: LocalDatabaseConfig): Promise<LocalDatabase>;
  openEncrypted(config: LocalDatabaseConfig): Promise<LocalDatabase>;
}

export const defaultOpeners = (keyProvider: KeyProvider): ModuleOpeners => ({
  openPlain: openPlainLocalDatabase,
  openEncrypted: encryptedOpener(keyProvider)
});

/** Hoeveel onversleutelde records er per module nog op dit apparaat staan. */
export async function plaintextRecordCounts(configs: readonly LocalDatabaseConfig[], openPlain = openPlainLocalDatabase): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const config of configs) {
    const database = await openPlain(config);
    try {
      const data = await database.exportData();
      counts[config.appId] = Object.values(data.stores).reduce((total, records) => total + records.length, 0);
    } finally {
      database.close();
    }
  }
  return counts;
}

/** Alle onversleutelde gegevens als één bestand, vóór de overzetting (ADR 0031 § 5: eerst een back-up). */
export async function exportPlaintextBackup(configs: readonly LocalDatabaseConfig[], openPlain = openPlainLocalDatabase): Promise<string> {
  const modules: unknown[] = [];
  for (const config of configs) {
    const database = await openPlain(config);
    try {
      modules.push(await database.exportData());
    } finally {
      database.close();
    }
  }
  return JSON.stringify({ format: 'personal-ecosystem-plaintext-before-encryption', exportedAt: new Date().toISOString(), modules }, null, 2);
}

export interface KeptRecord {
  store: string;
  id: string;
  reason: string;
}

export interface ModuleMigrationReport {
  appId: string;
  migrated: number;
  kept: KeptRecord[];
}

/**
 * Zet per record over: versleuteld schrijven, teruglezen en ontsleutelen, inhoud vergelijken (canonieke
 * JSON) en pas dan het onversleutelde record verwijderen. Een bestaande, afwijkende versleutelde versie
 * wordt nooit overschreven. Herhaalbaar: een tweede run zet alleen over wat nog onversleuteld staat.
 */
export async function migrateModulesToEncrypted(configs: readonly LocalDatabaseConfig[], openers: ModuleOpeners): Promise<ModuleMigrationReport[]> {
  const reports: ModuleMigrationReport[] = [];
  for (const config of configs) {
    const report: ModuleMigrationReport = { appId: config.appId, migrated: 0, kept: [] };
    reports.push(report);
    const plain = await openers.openPlain(config);
    try {
      const data = await plain.exportData();
      const total = Object.values(data.stores).reduce((sum, records) => sum + records.length, 0);
      if (total === 0) continue;
      const encrypted = await openers.openEncrypted(config);
      try {
        for (const store of config.stores) {
          for (const record of (data.stores[store] ?? []) as RecordValue[]) {
            const keep = (reason: string) => report.kept.push({ store, id: record.id, reason });
            try {
              const expected = canonicalJson(record);
              const existing = await encrypted.get(store, record.id);
              if (existing && canonicalJson(existing) !== expected) {
                keep('Er staat al een andere versleutelde versie; niets overschreven.');
                continue;
              }
              if (!existing) await encrypted.put(store, record);
              const readBack = await encrypted.get(store, record.id);
              if (!readBack || canonicalJson(readBack) !== expected) {
                keep('Teruggelezen versleutelde versie wijkt af.');
                continue;
              }
              await plain.remove(store, record.id);
              report.migrated += 1;
            } catch (cause) {
              keep(cause instanceof Error ? cause.message : 'Onbekende fout.');
            }
          }
        }
      } finally {
        encrypted.close();
      }
    } finally {
      plain.close();
    }
  }
  return reports;
}
