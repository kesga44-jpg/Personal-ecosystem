/** Eigen database van de module Duur (ADR 0020 § 2). Routes staan apart, zodat lijsten licht blijven. */
export const databaseConfig = {
  appId: 'duur',
  databaseName: 'personal-ecosystem-duur',
  version: 1,
  stores: ['workouts', 'tracks', 'settings'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('workouts', { keyPath: 'id' });
      database.createObjectStore('tracks', { keyPath: 'id' });
      database.createObjectStore('settings', { keyPath: 'id' });
    }
  }
} as const;
