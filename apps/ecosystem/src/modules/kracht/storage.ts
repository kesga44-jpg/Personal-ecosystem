/** Eigen database van de module Kracht (ADR 0020 § 2). Los van de Sport-app, zodat oude Sport-back-ups geldig blijven. */
export const databaseConfig = {
  appId: 'kracht',
  databaseName: 'personal-ecosystem-kracht',
  version: 1,
  stores: ['exercises', 'templates', 'sessions'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('exercises', { keyPath: 'id' });
      database.createObjectStore('templates', { keyPath: 'id' });
      database.createObjectStore('sessions', { keyPath: 'id' });
    }
  }
} as const;
