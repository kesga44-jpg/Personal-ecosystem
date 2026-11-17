/** Eigen database van de module Lichaam & gezondheid (ADR 0020 § 2). */
export const databaseConfig = {
  appId: 'lichaam',
  databaseName: 'personal-ecosystem-lichaam',
  version: 1,
  stores: ['days', 'profile'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('days', { keyPath: 'id' });
      database.createObjectStore('profile', { keyPath: 'id' });
    }
  }
} as const;
