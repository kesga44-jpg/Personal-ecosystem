/**
 * Eigen database van de module Voeding (ADR 0020 § 2). Schema 2 (ADR 0026 § 1) voegt recepten,
 * ingrediëntregels, voedingsplannen en geplande maaltijden toe; bestaande stores blijven ongewijzigd.
 */
const V2_STORES = ['recipes', 'recipeIngredients', 'nutritionPlans', 'plannedMeals'] as const;

export const databaseConfig = {
  appId: 'voeding',
  databaseName: 'personal-ecosystem-voeding',
  version: 2,
  stores: ['entries', 'products', 'settings', ...V2_STORES],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('entries', { keyPath: 'id' });
      database.createObjectStore('products', { keyPath: 'id' });
      database.createObjectStore('settings', { keyPath: 'id' });
    },
    2: (database: IDBDatabase) => {
      for (const store of V2_STORES) database.createObjectStore(store, { keyPath: 'id' });
    }
  },
  /** Back-up van schema 1: de nieuwe stores beginnen leeg. */
  exportUpgrades: {
    2: (stores: Record<string, { id: string }[]>) => ({ ...stores, ...Object.fromEntries(V2_STORES.map((store) => [store, []])) })
  }
} as const;
