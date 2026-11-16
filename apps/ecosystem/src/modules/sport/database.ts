export const databaseConfig = {
  appId: 'sport',
  databaseName: 'personal-ecosystem-sport',
  version: 1,
  stores: ['activities', 'trainings'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('activities', { keyPath: 'id' });
      database.createObjectStore('trainings', { keyPath: 'id' });
    }
  }
} as const;
