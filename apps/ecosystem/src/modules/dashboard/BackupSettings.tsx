import { useEffect, useState } from 'react';
import { downloadJson } from '@ecosystem/core';
import { openLocalDatabase, parseLocalBackup, type LocalDatabase } from '@ecosystem/storage';
import { Button, Card, ErrorBanner, Field } from '@ecosystem/ui';
import {
  createEcosystemBackup,
  moduleDatabaseConfigs,
  restoreBackupModule,
  validateEcosystemBackup,
  type BackupModule,
  type ModuleDatabases
} from './backup';

const lastExportKey = 'personal-ecosystem.backup.last-export';
const moduleLabels: Record<BackupModule, string> = {
  hub: 'Dashboard',
  sport: 'Sport',
  sidequest: 'SIDEQUEST'
};

export function BackupSettings({ hubDatabase }: { hubDatabase: LocalDatabase }) {
  const [databases, setDatabases] = useState<ModuleDatabases | null>(null);
  const [backup, setBackup] = useState<unknown>(null);
  const [target, setTarget] = useState<BackupModule>('hub');
  const [lastExport, setLastExport] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      setLastExport(localStorage.getItem(lastExportKey) ?? '');
    } catch {
      setLastExport('');
    }

    let active = true;
    let opened: LocalDatabase[] = [];
    void (async () => {
      let sport: LocalDatabase | null = null;
      let sidequest: LocalDatabase | null = null;
      try {
        sport = await openLocalDatabase(moduleDatabaseConfigs.sport);
        sidequest = await openLocalDatabase(moduleDatabaseConfigs.sidequest);
        opened = [sport, sidequest];
        if (active) setDatabases({ hub: hubDatabase, sport, sidequest });
        else opened.forEach((database) => database.close());
      } catch (cause) {
        sport?.close();
        sidequest?.close();
        if (active) setError(cause instanceof Error ? cause.message : 'Lokale databases konden niet worden geopend.');
      }
    })();
    return () => {
      active = false;
      opened.forEach((database) => database.close());
    };
  }, [hubDatabase]);

  async function exportBackup() {
    if (!databases) return;
    setError('');
    setMessage('');
    try {
      const data = await createEcosystemBackup(databases);
      downloadJson('personal-ecosystem-backup.json', data);
      const createdAt = new Date().toISOString();
      try {
        localStorage.setItem(lastExportKey, createdAt);
      } catch {
        setLastExport('');
      }
      setLastExport(createdAt);
      setMessage('Back-up is geëxporteerd.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Back-up kon niet worden geëxporteerd.');
    }
  }

  async function selectBackup(file?: File) {
    setError('');
    setMessage('');
    setBackup(null);
    if (!file || !databases) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Back-ups mogen maximaal 25 MB groot zijn.');
      const data = parseLocalBackup(await file.text());
      const validated = await validateEcosystemBackup(data, databases);
      if (validated.format === 'legacy') setTarget(validated.module);
      setBackup(data);
      setMessage(validated.format === 'legacy'
        ? `Geldige oude back-up voor ${moduleLabels[validated.module]}.`
        : 'Alle modules en de controlewaarde zijn geldig.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Back-up kon niet worden gevalideerd.');
    }
  }

  async function restore() {
    if (!backup || !databases) return;
    setError('');
    try {
      if (!window.confirm(`Herstel vervangt alle bestaande gegevens van ${moduleLabels[target]} op dit apparaat. Doorgaan?`)) return;
      await restoreBackupModule(backup, target, databases);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Back-up kon niet worden hersteld.');
    }
  }

  return (
    <Card title="Centrale back-up">
      <p className="item-subtitle">Eén JSON-bestand bevat afzonderlijke back-ups voor Dashboard, Sport en SIDEQUEST.</p>
      {error && <ErrorBanner message={error} />}
      {message && <p role="status" className="item-subtitle">{message}</p>}
      <p className="item-subtitle">
        Laatste export: {lastExport && Number.isFinite(Date.parse(lastExport))
          ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastExport))
          : 'Nog geen export geregistreerd'}
      </p>
      <div className="row" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
        <Button onClick={() => void exportBackup()} disabled={!databases}>Download centrale back-up</Button>
        <Field label="Herstel uit JSON">
          <input type="file" accept="application/json,.json" onChange={(event) => void selectBackup(event.currentTarget.files?.[0])} disabled={!databases} />
        </Field>
        <Field label="Module herstellen">
          <select value={target} onChange={(event) => setTarget(event.target.value as BackupModule)} disabled={!databases}>
            {Object.entries(moduleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </Field>
        <Button variant="secondary" onClick={() => void restore()} disabled={!backup || !databases}>Herstel geselecteerde module</Button>
      </div>
    </Card>
  );
}
