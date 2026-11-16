import { databaseConfig as hubConfig } from './database';
import { validateHubBackup } from './domain';
import { databaseConfig as sportConfig } from '../sport/database';
import { validateSportBackup } from '../sport/domain';
import { databaseConfig as sidequestConfig } from '../quest/database';
import { validateSidequestBackup } from '../quest/domain';
import type { LocalDatabase } from '@ecosystem/storage';

export type BackupModule = 'hub' | 'sport' | 'sidequest';
export type ModuleBackups = Record<BackupModule, unknown>;

export type ModuleDatabases = Record<BackupModule, LocalDatabase>;

export interface EcosystemBackup {
  format: 'personal-ecosystem-backup';
  version: 1;
  createdAt: string;
  modules: ModuleBackups;
  checksum: string;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function checksumModules(modules: ModuleBackups): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(modules));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createEcosystemBackup(databases: ModuleDatabases): Promise<EcosystemBackup> {
  const modules: ModuleBackups = {
    hub: await databases.hub.exportData(),
    sport: await databases.sport.exportData(),
    sidequest: await databases.sidequest.exportData()
  };
  return {
    format: 'personal-ecosystem-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    modules,
    checksum: await checksumModules(modules)
  };
}

function moduleFromAppId(appId: unknown): BackupModule | null {
  if (appId === 'hub' || appId === 'sport' || appId === 'sidequest') return appId;
  return null;
}

function validateModule(module: BackupModule, data: unknown, databases: ModuleDatabases): void {
  databases[module].validateRestore(data);
  if (module === 'hub') validateHubBackup(data);
  else if (module === 'sport') validateSportBackup(data);
  else validateSidequestBackup(data);
}

export async function validateEcosystemBackup(
  input: unknown,
  databases: ModuleDatabases
): Promise<{ format: 'ecosystem'; modules: ModuleBackups } | { format: 'legacy'; module: BackupModule; data: unknown }> {
  if (!input || typeof input !== 'object') throw new Error('Back-upbestand heeft geen geldig formaat.');
  const candidate = input as Record<string, unknown>;

  if (candidate.format === 'personal-ecosystem-local-data') {
    const module = moduleFromAppId(candidate.appId);
    if (!module) throw new Error('Deze lokale back-up hoort niet bij een bekende module.');
    validateModule(module, input, databases);
    return { format: 'legacy', module, data: input };
  }

  if (
    candidate.format !== 'personal-ecosystem-backup' ||
    candidate.version !== 1 ||
    typeof candidate.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.createdAt)) ||
    !candidate.modules ||
    typeof candidate.modules !== 'object' ||
    typeof candidate.checksum !== 'string' ||
    !/^[a-f0-9]{64}$/.test(candidate.checksum)
  ) {
    throw new Error('Personal Ecosystem-back-up heeft geen geldig formaat.');
  }

  const modules = candidate.modules as ModuleBackups;
  const moduleNames = Object.keys(modules).sort();
  if (moduleNames.join(',') !== 'hub,sidequest,sport') {
    throw new Error('Personal Ecosystem-back-up mist een module of bevat een onbekende module.');
  }
  if (await checksumModules(modules) !== candidate.checksum) {
    throw new Error('De controlewaarde van de back-up klopt niet.');
  }

  validateModule('hub', modules.hub, databases);
  validateModule('sport', modules.sport, databases);
  validateModule('sidequest', modules.sidequest, databases);
  return { format: 'ecosystem', modules };
}

export async function restoreBackupModule(
  input: unknown,
  module: BackupModule,
  databases: ModuleDatabases
): Promise<void> {
  const validated = await validateEcosystemBackup(input, databases);
  if (validated.format === 'legacy') {
    if (validated.module !== module) throw new Error('Selecteer de module die bij deze back-up hoort.');
    await databases[module].restore(validated.data);
    return;
  }
  await databases[module].restore(validated.modules[module]);
}

export const moduleDatabaseConfigs = {
  hub: hubConfig,
  sport: sportConfig,
  sidequest: sidequestConfig
} as const;
