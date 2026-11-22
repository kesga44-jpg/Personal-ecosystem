/** Eigen database van de module Financiën (ADR 0023 § 2, ADR 0027 § 2). */
const STORES = [
  'transactions',
  'categories',
  'incomeSources',
  'budgets',
  'pots',
  'manual',
  'budgetScenarios',
  'investmentPlans',
  'investmentScenarios',
  'planNotes',
  'links'
] as const;

export const databaseConfig = {
  appId: 'financien',
  databaseName: 'personal-ecosystem-financien',
  version: 1,
  stores: STORES,
  migrations: {
    1: (database: IDBDatabase) => {
      for (const store of STORES) database.createObjectStore(store, { keyPath: 'id' });
    }
  }
} as const;
