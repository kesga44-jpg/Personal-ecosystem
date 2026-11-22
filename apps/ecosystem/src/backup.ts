import type { LocalExport } from '@ecosystem/storage';

/** Centrale back-up van alle modules (ADR 0020 § 3). */
export const BACKUP_FORMAT = 'personal-ecosystem-backup';
export const BACKUP_VERSION = 7;
export const MODULE_IDS = ['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding', 'kracht', 'duur', 'groei'] as const;
export type BackupModuleId = (typeof MODULE_IDS)[number];

/** Modules per back-upversie. Oudere versies blijven herstelbaar; modules die er nog niet in zaten, blijven dan ongewijzigd. */
const MODULES_BY_VERSION: Record<number, readonly BackupModuleId[]> = {
  1: ['hub', 'sport', 'sidequest'],
  2: ['hub', 'sport', 'sidequest', 'lichaam'],
  3: ['hub', 'sport', 'sidequest', 'lichaam', 'dagboek'],
  4: ['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding'],
  5: ['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding', 'kracht'],
  6: ['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding', 'kracht', 'duur'],
  7: MODULE_IDS
};

export interface EcosystemBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  modules: Record<BackupModuleId, LocalExport>;
  checksum: string;
}

export type ModuleValidator = (data: unknown) => void;

export interface RestorePlan {
  source: 'ecosystem' | 'single-app';
  modules: Partial<Record<BackupModuleId, LocalExport>>;
}

const moduleLabels: Record<BackupModuleId, string> = {
  hub: 'Dashboard',
  sport: 'Sport',
  sidequest: 'SIDEQUEST',
  lichaam: 'Lichaam',
  dagboek: 'Dagboek',
  voeding: 'Voeding',
  kracht: 'Kracht',
  duur: 'Duur',
  groei: 'Groei'
};

export function moduleLabel(id: BackupModuleId): string {
  return moduleLabels[id];
}

function isModuleId(value: unknown): value is BackupModuleId {
  return typeof value === 'string' && (MODULE_IDS as readonly string[]).includes(value);
}

/** JSON met gesorteerde sleutels, zodat dezelfde gegevens altijd hetzelfde controlegetal geven. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createBackup(modules: Record<BackupModuleId, LocalExport>, now = new Date()): Promise<EcosystemBackup> {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    modules,
    checksum: await sha256Hex(canonicalJson(modules))
  };
}

export function backupFileName(now = new Date()): string {
  return `personal-ecosystem-backup-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Controleert een back-upbestand volledig vóórdat er iets wordt geschreven.
 * Accepteert de centrale back-up én de losse back-ups van de oude Hub, Sportapp en SIDEQUEST.
 * Gooit een fout als ook maar één onderdeel ongeldig is; dan mag niets worden hersteld.
 */
export async function planRestore(input: unknown, validators: Record<BackupModuleId, ModuleValidator>): Promise<RestorePlan> {
  if (!input || typeof input !== 'object') throw new Error('Dit bestand is geen geldige back-up.');
  const candidate = input as Record<string, unknown>;

  if (candidate.format === 'personal-ecosystem-local-data') {
    if (!isModuleId(candidate.appId)) throw new Error('Deze back-up hoort bij een onbekende app.');
    validators[candidate.appId](input);
    return { source: 'single-app', modules: { [candidate.appId]: input as LocalExport } };
  }

  if (candidate.format !== BACKUP_FORMAT) throw new Error('Dit bestand is geen Personal Ecosystem-back-up.');
  const expected = typeof candidate.version === 'number' ? MODULES_BY_VERSION[candidate.version] : undefined;
  if (!expected) throw new Error('Deze back-upversie wordt niet ondersteund.');
  const modules = candidate.modules;
  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) throw new Error('De back-up bevat geen modules.');
  const keys = Object.keys(modules);
  if (keys.length !== expected.length || !expected.every((id) => keys.includes(id))) {
    throw new Error('De back-up bevat onverwachte of ontbrekende modules.');
  }
  if (typeof candidate.checksum !== 'string' || candidate.checksum !== (await sha256Hex(canonicalJson(modules)))) {
    throw new Error('Het controlegetal klopt niet: het bestand is beschadigd of aangepast.');
  }
  const typed = modules as Partial<Record<BackupModuleId, unknown>>;
  for (const id of expected) {
    try {
      validators[id](typed[id]);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'ongeldige gegevens';
      throw new Error(`${moduleLabel(id)}: ${reason}`);
    }
  }
  return { source: 'ecosystem', modules: typed as Partial<Record<BackupModuleId, LocalExport>> };
}
