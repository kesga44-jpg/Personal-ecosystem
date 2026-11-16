import { describe, expect, it, vi } from 'vitest';
import {
  canonicalJson,
  checksumModules,
  createEcosystemBackup,
  moduleDatabaseConfigs,
  restoreBackupModule,
  type BackupModule,
  type ModuleBackups,
  type ModuleDatabases
} from './backup';
import { openLocalDatabase, type LocalDatabase, type LocalExport } from '@ecosystem/storage';

const localBackups: Record<BackupModule, LocalExport> = {
  hub: {
    format: 'personal-ecosystem-local-data',
    appId: 'hub',
    schemaVersion: 1,
    exportedAt: '2026-11-16T00:00:00.000Z',
    stores: { launches: [], shortcuts: [] }
  },
  sport: {
    format: 'personal-ecosystem-local-data',
    appId: 'sport',
    schemaVersion: 1,
    exportedAt: '2026-11-16T00:00:00.000Z',
    stores: { activities: [], trainings: [] }
  },
  sidequest: {
    format: 'personal-ecosystem-local-data',
    appId: 'sidequest',
    schemaVersion: 1,
    exportedAt: '2026-11-16T00:00:00.000Z',
    stores: { goals: [], habits: [], habitChecks: [], quests: [] }
  }
};

function createDatabases(): { databases: ModuleDatabases; restores: Record<BackupModule, ReturnType<typeof vi.fn>> } {
  const restores = {
    hub: vi.fn(),
    sport: vi.fn(),
    sidequest: vi.fn()
  };
  const databases = Object.fromEntries(
    (Object.keys(localBackups) as BackupModule[]).map((module) => [
      module,
      {
        appId: module,
        schemaVersion: 1,
        list: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        exportData: vi.fn(async () => localBackups[module]),
        validateRestore: (data: unknown) => {
          if (!data || typeof data !== 'object' || (data as LocalExport).appId !== module) {
            throw new Error('wrong app');
          }
        },
        restore: restores[module],
        close: vi.fn()
      } as unknown as LocalDatabase
    ])
  ) as ModuleDatabases;
  return { databases, restores };
}

describe('central backup', () => {
  it('exports all modules with a SHA-256 checksum over canonical module data', async () => {
    const { databases } = createDatabases();
    const backup = await createEcosystemBackup(databases);

    expect(backup).toMatchObject({
      format: 'personal-ecosystem-backup',
      version: 1,
      modules: localBackups
    });
    expect(backup.checksum).toBe(await checksumModules(backup.modules));
    expect(await checksumModules({ sidequest: localBackups.sidequest, sport: localBackups.sport, hub: localBackups.hub }))
      .toBe(await checksumModules(backup.modules));
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe('{"a":{"b":3,"y":2},"z":1}');
  });

  it('rejects a bad checksum before restoring any module', async () => {
    const { databases, restores } = createDatabases();
    const backup = await createEcosystemBackup(databases);
    backup.modules.sport = localBackups.sport;
    backup.checksum = '0'.repeat(64);

    await expect(restoreBackupModule(backup, 'hub', databases)).rejects.toThrow('controlewaarde');
    expect(Object.values(restores).every((restore) => restore.mock.calls.length === 0)).toBe(true);
  });

  it('validates every module before writing the selected module', async () => {
    const { databases, restores } = createDatabases();
    const modules: ModuleBackups = {
      hub: localBackups.hub,
      sport: { ...localBackups.sport, stores: { activities: [{ id: 'invalid' }], trainings: [] } },
      sidequest: localBackups.sidequest
    };
    const backup = {
      format: 'personal-ecosystem-backup' as const,
      version: 1 as const,
      createdAt: '2026-11-16T00:00:00.000Z',
      modules,
      checksum: await checksumModules(modules)
    };

    await expect(restoreBackupModule(backup, 'hub', databases)).rejects.toThrow();
    expect(Object.values(restores).every((restore) => restore.mock.calls.length === 0)).toBe(true);
  });

  it('leaves real module databases unchanged when a full backup contains an invalid module', async () => {
    const databases = Object.fromEntries(
      await Promise.all((Object.keys(moduleDatabaseConfigs) as BackupModule[]).map(async (module) => [
        module,
        await openLocalDatabase(moduleDatabaseConfigs[module])
      ]))
    ) as ModuleDatabases;
    await databases.hub.put('launches', {
      id: 'existing-hub',
      appId: 'sportapp',
      appName: 'Sportapp',
      openedAt: '2026-11-16T00:00:00.000Z'
    });
    await databases.sport.put('activities', { id: 'existing-sport' });
    await databases.sidequest.put('goals', { id: 'existing-quest' });
    const modules: ModuleBackups = {
      hub: localBackups.hub,
      sport: { ...localBackups.sport, stores: { activities: [{ id: 'invalid' }], trainings: [] } },
      sidequest: localBackups.sidequest
    };
    const backup = {
      format: 'personal-ecosystem-backup' as const,
      version: 1 as const,
      createdAt: '2026-11-16T00:00:00.000Z',
      modules,
      checksum: await checksumModules(modules)
    };

    try {
      await expect(restoreBackupModule(backup, 'hub', databases)).rejects.toThrow();
      await expect(databases.hub.list('launches')).resolves.toEqual([{
        id: 'existing-hub',
        appId: 'sportapp',
        appName: 'Sportapp',
        openedAt: '2026-11-16T00:00:00.000Z'
      }]);
      await expect(databases.sport.list('activities')).resolves.toEqual([{ id: 'existing-sport' }]);
      await expect(databases.sidequest.list('goals')).resolves.toEqual([{ id: 'existing-quest' }]);
    } finally {
      Object.values(databases).forEach((database) => database.close());
    }
  });

  it.each(['hub', 'sport', 'sidequest'] as const)('imports a legacy %s backup into its own module', async (module) => {
    const { databases, restores } = createDatabases();

    await restoreBackupModule(localBackups[module], module, databases);

    expect(restores[module]).toHaveBeenCalledWith(localBackups[module]);
    expect(Object.entries(restores).filter(([id]) => id !== module).every(([, restore]) => restore.mock.calls.length === 0)).toBe(true);
  });

  it('rejects a legacy backup targeted at a different module without writing', async () => {
    const { databases, restores } = createDatabases();

    await expect(restoreBackupModule(localBackups.sport, 'hub', databases)).rejects.toThrow('Selecteer de module');
    expect(Object.values(restores).every((restore) => restore.mock.calls.length === 0)).toBe(true);
  });
});
