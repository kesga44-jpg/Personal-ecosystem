/** Eigen database van de module Voeding (ADR 0020 § 2). */
export const databaseConfig = {
  appId: 'voeding',
  databaseName: 'personal-ecosystem-voeding',
  version: 1,
  stores: ['entries', 'products', 'settings'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('entries', { keyPath: 'id' });
      database.createObjectStore('products', { keyPath: 'id' });
      database.createObjectStore('settings', { keyPath: 'id' });
    }
  }
} as const;
