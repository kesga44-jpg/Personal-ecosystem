export const databaseConfig = {
  appId: 'sidequest',
  databaseName: 'personal-ecosystem-sidequest',
  version: 1,
  stores: ['goals', 'habits', 'habitChecks', 'quests'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('goals', { keyPath: 'id' });
      database.createObjectStore('habits', { keyPath: 'id' });
      database.createObjectStore('habitChecks', { keyPath: 'id' });
      database.createObjectStore('quests', { keyPath: 'id' });
    }
  }
} as const;
