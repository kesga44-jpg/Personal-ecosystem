import { describe, expect, it, vi } from 'vitest';
import type { LocalExport } from '@ecosystem/storage';
import { BACKUP_FORMAT, canonicalJson, createBackup, planRestore, sha256Hex, type BackupModuleId } from './backup';

function localExport(appId: string, stores: Record<string, { id: string }[]>): LocalExport {
  return { format: 'personal-ecosystem-local-data', appId, schemaVersion: 1, exportedAt: '2026-11-16T10:00:00.000Z', stores };
}

const exports = {
  hub: localExport('hub', { launches: [], shortcuts: [{ id: 's1' }] }),
  sport: localExport('sport', { activities: [{ id: 'a1' }], trainings: [] }),
  sidequest: localExport('sidequest', { goals: [], habits: [{ id: 'h1' }] }),
  lichaam: localExport('lichaam', { days: [{ id: '2026-11-16' }], profile: [] }),
  dagboek: localExport('dagboek', { entries: [{ id: '2026-11-17' }] }),
  voeding: localExport('voeding', { entries: [], products: [], settings: [] }),
  kracht: localExport('kracht', { exercises: [], templates: [], sessions: [{ id: 'k1' }] }),
  duur: localExport('duur', { workouts: [{ id: 'w1' }], tracks: [], settings: [] }),
  groei: localExport('groei', { goals: [{ id: 'g1' }], skills: [], habits: [], habitChecks: [], actions: [], evaluations: [], tenTen: [], settings: [], links: [] }),
  financien: localExport('financien', { transactions: [{ id: 't1' }], categories: [], incomeSources: [], budgets: [], pots: [], manual: [], budgetScenarios: [], investmentPlans: [], investmentScenarios: [], planNotes: [], links: [] })
} satisfies Record<BackupModuleId, LocalExport>;

const accept = () => ({ hub: vi.fn(), sport: vi.fn(), sidequest: vi.fn(), lichaam: vi.fn(), dagboek: vi.fn(), voeding: vi.fn(), kracht: vi.fn(), duur: vi.fn(), groei: vi.fn(), financien: vi.fn() });

describe('canonicalJson', () => {
  it('is onafhankelijk van de volgorde van sleutels', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});

describe('createBackup', () => {
  it('maakt één bestand met alle modules en een controlegetal', async () => {
    const backup = await createBackup(exports, new Date('2026-11-16T12:00:00Z'));
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(8);
    expect(backup.createdAt).toBe('2026-11-16T12:00:00.000Z');
    expect(Object.keys(backup.modules)).toEqual(['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding', 'kracht', 'duur', 'groei', 'financien']);
    expect(backup.checksum).toBe(await sha256Hex(canonicalJson(exports)));
  });
});

describe('planRestore', () => {
  it('accepteert een geldige centrale back-up en valideert elke module', async () => {
    const validators = accept();
    const plan = await planRestore(await createBackup(exports), validators);
    expect(plan.source).toBe('ecosystem');
    expect(Object.keys(plan.modules)).toEqual(['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding', 'kracht', 'duur', 'groei', 'financien']);
    expect(validators.voeding).toHaveBeenCalledWith(exports.voeding);
    expect(validators.lichaam).toHaveBeenCalledWith(exports.lichaam);
    expect(validators.dagboek).toHaveBeenCalledWith(exports.dagboek);
    expect(validators.hub).toHaveBeenCalledWith(exports.hub);
    expect(validators.sport).toHaveBeenCalledWith(exports.sport);
    expect(validators.sidequest).toHaveBeenCalledWith(exports.sidequest);
  });

  it('weigert een aangepast bestand (controlegetal klopt niet)', async () => {
    const backup = await createBackup(exports);
    const tampered = structuredClone(backup);
    tampered.modules.sport.stores.activities = [{ id: 'nep' }];
    await expect(planRestore(tampered, accept())).rejects.toThrow('controlegetal');
  });

  it('weigert alles als één module ongeldig is', async () => {
    const validators = accept();
    validators.sidequest.mockImplementation(() => {
      throw new Error('ongeldige gewoonte');
    });
    await expect(planRestore(await createBackup(exports), validators)).rejects.toThrow('SIDEQUEST: ongeldige gewoonte');
  });

  it('weigert ontbrekende of extra modules', async () => {
    const backup = await createBackup(exports);
    const missing = { ...backup, modules: { hub: exports.hub, sport: exports.sport } };
    await expect(planRestore(missing, accept())).rejects.toThrow('modules');
    const extra = { ...backup, modules: { ...exports, beleggen: exports.hub } };
    await expect(planRestore(extra, accept())).rejects.toThrow('modules');
  });

  it('weigert onbekende formaten en versies', async () => {
    await expect(planRestore(null, accept())).rejects.toThrow();
    await expect(planRestore({ format: 'iets-anders' }, accept())).rejects.toThrow('geen Personal Ecosystem-back-up');
    await expect(planRestore({ ...(await createBackup(exports)), version: 9 }, accept())).rejects.toThrow('versie');
  });

  it('herstelt een back-up van versie 1 (zonder Lichaam) en laat Lichaam ongemoeid', async () => {
    const { lichaam: _lichaam, dagboek: _dagboek, voeding: _voeding, kracht: _kracht, duur: _duur, groei: _groei, financien: _financien, ...legacy } = exports;
    const v1 = { format: BACKUP_FORMAT, version: 1, createdAt: '2026-11-10T10:00:00.000Z', modules: legacy, checksum: await sha256Hex(canonicalJson(legacy)) };
    const validators = accept();
    const plan = await planRestore(v1, validators);
    expect(Object.keys(plan.modules)).toEqual(['hub', 'sport', 'sidequest']);
    expect(validators.lichaam).not.toHaveBeenCalled();
    expect(validators.dagboek).not.toHaveBeenCalled();
    await expect(planRestore({ ...v1, modules: exports, checksum: await sha256Hex(canonicalJson(exports)) }, accept())).rejects.toThrow('modules');
  });

  it('herstelt een back-up van versie 2 (zonder Dagboek) en laat Dagboek ongemoeid', async () => {
    const { dagboek: _dagboek, voeding: _voeding, kracht: _kracht, duur: _duur, groei: _groei, financien: _financien, ...v2modules } = exports;
    const v2 = { format: BACKUP_FORMAT, version: 2, createdAt: '2026-11-16T10:00:00.000Z', modules: v2modules, checksum: await sha256Hex(canonicalJson(v2modules)) };
    const validators = accept();
    const plan = await planRestore(v2, validators);
    expect(Object.keys(plan.modules)).toEqual(['hub', 'sport', 'sidequest', 'lichaam']);
    expect(validators.dagboek).not.toHaveBeenCalled();
  });

  it('herstelt een back-up van versie 3 (zonder Voeding) en laat Voeding ongemoeid', async () => {
    const { voeding: _voeding, kracht: _kracht, duur: _duur, groei: _groei, financien: _financien, ...v3modules } = exports;
    const v3 = { format: BACKUP_FORMAT, version: 3, createdAt: '2026-11-17T10:00:00.000Z', modules: v3modules, checksum: await sha256Hex(canonicalJson(v3modules)) };
    const validators = accept();
    const plan = await planRestore(v3, validators);
    expect(Object.keys(plan.modules)).toEqual(['hub', 'sport', 'sidequest', 'lichaam', 'dagboek']);
    expect(validators.voeding).not.toHaveBeenCalled();
  });

  it('herstelt een back-up van versie 4 (zonder Kracht) en laat Kracht ongemoeid', async () => {
    const { kracht: _kracht, duur: _duur, groei: _groei, financien: _financien, ...v4modules } = exports;
    const v4 = { format: BACKUP_FORMAT, version: 4, createdAt: '2026-11-17T10:00:00.000Z', modules: v4modules, checksum: await sha256Hex(canonicalJson(v4modules)) };
    const validators = accept();
    const plan = await planRestore(v4, validators);
    expect(Object.keys(plan.modules)).toEqual(['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding']);
    expect(validators.kracht).not.toHaveBeenCalled();
  });

  it('herstelt een back-up van versie 5 (zonder Duur) en laat Duur ongemoeid', async () => {
    const { duur: _duur, groei: _groei, financien: _financien, ...v5modules } = exports;
    const v5 = { format: BACKUP_FORMAT, version: 5, createdAt: '2026-11-17T10:00:00.000Z', modules: v5modules, checksum: await sha256Hex(canonicalJson(v5modules)) };
    const validators = accept();
    const plan = await planRestore(v5, validators);
    expect(Object.keys(plan.modules)).toEqual(['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding', 'kracht']);
    expect(validators.duur).not.toHaveBeenCalled();
  });

  it('herstelt een back-up van versie 6 (zonder Groei) en laat Groei ongemoeid', async () => {
    const { groei: _groei, financien: _financien, ...v6modules } = exports;
    const v6 = { format: BACKUP_FORMAT, version: 6, createdAt: '2026-11-20T10:00:00.000Z', modules: v6modules, checksum: await sha256Hex(canonicalJson(v6modules)) };
    const validators = accept();
    const plan = await planRestore(v6, validators);
    expect(Object.keys(plan.modules)).toEqual(['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding', 'kracht', 'duur']);
    expect(validators.groei).not.toHaveBeenCalled();
  });

  it('herstelt een back-up van versie 7 (zonder Financiën) en laat Financiën ongemoeid', async () => {
    const { financien: _financien, ...v7modules } = exports;
    const v7 = { format: BACKUP_FORMAT, version: 7, createdAt: '2026-11-22T10:00:00.000Z', modules: v7modules, checksum: await sha256Hex(canonicalJson(v7modules)) };
    const validators = accept();
    const plan = await planRestore(v7, validators);
    expect(Object.keys(plan.modules)).toEqual(['hub', 'sport', 'sidequest', 'lichaam', 'dagboek', 'voeding', 'kracht', 'duur', 'groei']);
    expect(validators.financien).not.toHaveBeenCalled();
  });

  it('importeert losse back-ups van de oude apps in de juiste module', async () => {
    for (const id of ['hub', 'sport', 'sidequest'] as const) {
      const validators = accept();
      const plan = await planRestore(exports[id], validators);
      expect(plan.source).toBe('single-app');
      expect(Object.keys(plan.modules)).toEqual([id]);
      expect(validators[id]).toHaveBeenCalledOnce();
    }
  });

  it('weigert een losse back-up van een onbekende app', async () => {
    await expect(planRestore(localExport('coach', {}), accept())).rejects.toThrow('onbekende app');
  });
});
