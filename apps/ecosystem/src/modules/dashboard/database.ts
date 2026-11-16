export const databaseConfig = {
  appId: 'hub',
  databaseName: 'personal-ecosystem-hub',
  version: 1,
  stores: ['launches', 'shortcuts'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('launches', { keyPath: 'id' });
      database.createObjectStore('shortcuts', { keyPath: 'id' });
    }
  }
} as const;
