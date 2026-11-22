/**
 * Database `personal-ecosystem-groei` (ADR 0023 § 2–3). Groei en Kennis & Ontwikkeling delen deze database;
 * Kennis voegt in A6 eigen stores toe met een volgende versie. Relaties daartussen zijn ID-velden (ADR 0024 § 6).
 */
export const databaseConfig = {
  appId: 'groei',
  databaseName: 'personal-ecosystem-groei',
  version: 1,
  stores: ['goals', 'skills', 'habits', 'habitChecks', 'actions', 'evaluations', 'tenTen', 'settings', 'links'],
  migrations: {
    1: (database: IDBDatabase) => {
      for (const store of ['goals', 'skills', 'habits', 'habitChecks', 'actions', 'evaluations', 'tenTen', 'settings', 'links']) {
        database.createObjectStore(store, { keyPath: 'id' });
      }
    }
  }
} as const;
