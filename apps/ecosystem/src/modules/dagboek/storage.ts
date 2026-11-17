/** Eigen database van de module Dagboek & stemming (ADR 0020 § 2). */
export const databaseConfig = {
  appId: 'dagboek',
  databaseName: 'personal-ecosystem-dagboek',
  version: 1,
  stores: ['entries'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('entries', { keyPath: 'id' });
    }
  }
} as const;
