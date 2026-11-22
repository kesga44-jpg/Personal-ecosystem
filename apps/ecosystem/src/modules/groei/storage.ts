/**
 * Database `personal-ecosystem-groei` (ADR 0023 § 2–3). Groei en Kennis & Ontwikkeling delen deze database:
 * schema 1 bevat de stores van Groei, schema 2 voegt die van Kennis toe (A6). Relaties daartussen zijn
 * ID-velden (ADR 0024 § 6).
 */
const GROEI_STORES = ['goals', 'skills', 'habits', 'habitChecks', 'actions', 'evaluations', 'tenTen', 'settings', 'links'] as const;
const KENNIS_STORES = ['sources', 'creators', 'highlights', 'insights', 'studyPrograms', 'learningLog'] as const;

export const databaseConfig = {
  appId: 'groei',
  databaseName: 'personal-ecosystem-groei',
  version: 2,
  stores: [...GROEI_STORES, ...KENNIS_STORES],
  migrations: {
    1: (database: IDBDatabase) => {
      for (const store of GROEI_STORES) database.createObjectStore(store, { keyPath: 'id' });
    },
    2: (database: IDBDatabase) => {
      for (const store of KENNIS_STORES) database.createObjectStore(store, { keyPath: 'id' });
    }
  },
  /** Back-up van schema 1 (alleen Groei): Kennis-stores beginnen leeg. */
  exportUpgrades: {
    2: (stores: Record<string, { id: string }[]>) => ({ ...stores, ...Object.fromEntries(KENNIS_STORES.map((store) => [store, []])) })
  }
} as const;
