import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { downloadJson } from '@ecosystem/core';
import { openLocalDatabase, parseLocalBackup, withConsistentDatabaseSnapshot, type LocalDatabase, type LocalExport } from '@ecosystem/storage';
import { AppFrame, Button, Card, ErrorBanner, Field, PageHeader, StatusPill, type ModuleLink } from '@ecosystem/ui';
import { databaseConfig as hubConfig } from '@ecosystem/hub/App';
import { databaseConfig as sportConfig } from '@ecosystem/sportapp/App';
import { databaseConfig as questConfig } from '@ecosystem/sidequest/App';
import { validateHubBackup } from '@ecosystem/hub/domain';
import { validateSportBackup } from '@ecosystem/sportapp/domain';
import { validateSidequestBackup } from '@ecosystem/sidequest/domain';
import { databaseConfig as lichaamConfig } from './modules/lichaam/storage';
import { validateLichaamBackup } from './modules/lichaam/domain';
import { databaseConfig as dagboekConfig } from './modules/dagboek/storage';
import { validateDagboekBackup } from './modules/dagboek/domain';
import { databaseConfig as voedingConfig } from './modules/voeding/storage';
import { validateVoedingBackup } from './modules/voeding/backup';
import { databaseConfig as krachtConfig } from './modules/kracht/storage';
import { validateKrachtBackup } from './modules/kracht/domain';
import { databaseConfig as duurConfig } from './modules/duur/storage';
import { validateDuurBackup } from './modules/duur/domain';
import { databaseConfig as groeiConfig } from './modules/groei/storage';
import { validateGroeiBackup } from './modules/groei/domain';
import { databaseConfig as financienConfig } from './modules/financien/storage';
import { validateFinancienBackup } from './modules/financien/domain';
import { validateKennisStores } from './modules/kennis/domain';
import {
  MODULE_IDS,
  backupFileName,
  createBackup,
  moduleLabel,
  planRestore,
  validateCompleteExports,
  type BackupModuleId,
  type RestorePlan
} from './backup';

const configs = { hub: hubConfig, sport: sportConfig, sidequest: questConfig, lichaam: lichaamConfig, dagboek: dagboekConfig, voeding: voedingConfig, kracht: krachtConfig, duur: duurConfig, groei: groeiConfig, financien: financienConfig } as const;
const domainValidators: Record<BackupModuleId, (data: unknown) => void> = {
  hub: validateHubBackup,
  sport: validateSportBackup,
  sidequest: validateSidequestBackup,
  lichaam: validateLichaamBackup,
  dagboek: validateDagboekBackup,
  voeding: validateVoedingBackup,
  kracht: validateKrachtBackup,
  duur: validateDuurBackup,
  groei: (data: unknown) => validateGroeiBackup(data, validateKennisStores),
  financien: validateFinancienBackup
};
const lastExportKey = 'personal-ecosystem.backup.last-export';
const navigation = [{ to: '/', label: 'Back-up', icon: '⇩' }];

function readLastExport(): string {
  try {
    return localStorage.getItem(lastExportKey) ?? '';
  } catch {
    return '';
  }
}

function writeLastExport(value: string): void {
  try {
    localStorage.setItem(lastExportKey, value);
  } catch {
    // Alleen een geheugensteun; zonder opslag werkt de back-up gewoon.
  }
}

async function withDatabases<T>(action: (databases: Record<BackupModuleId, LocalDatabase>) => Promise<T>): Promise<T> {
  const opened: Partial<Record<BackupModuleId, LocalDatabase>> = {};
  try {
    for (const id of MODULE_IDS) opened[id] = await openLocalDatabase(configs[id]);
    return await action(opened as Record<BackupModuleId, LocalDatabase>);
  } finally {
    for (const id of MODULE_IDS) opened[id]?.close();
  }
}

export default function BackupApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/back-up">
      <AppFrame appName="Personal Ecosystem" appMark="P" navigation={navigation} moduleLinks={links}>
        <BackupPage />
      </AppFrame>
    </BrowserRouter>
  );
}

function BackupPage() {
  const [lastExport, setLastExport] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<RestorePlan | null>(null);

  useEffect(() => setLastExport(readLastExport()), []);

  async function exportAll() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const exports = await withConsistentDatabaseSnapshot(() => withDatabases(async (databases) => {
        const result: Partial<Record<BackupModuleId, LocalExport>> = {};
        for (const id of MODULE_IDS) result[id] = await databases[id].exportData();
        return result as Record<BackupModuleId, LocalExport>;
      }));
      validateCompleteExports(exports, domainValidators);
      const now = new Date();
      downloadJson(backupFileName(now), await createBackup(exports, now));
      writeLastExport(now.toISOString());
      setLastExport(now.toISOString());
      setMessage('Back-up gedownload.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'De back-up kon niet worden gemaakt.');
    } finally {
      setBusy(false);
    }
  }

  async function checkFile(file: File | undefined) {
    setError('');
    setMessage('');
    setPlan(null);
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Back-ups mogen maximaal 25 MB groot zijn.');
      const data = parseLocalBackup(await file.text());
      const nextPlan = await withDatabases((databases) =>
        planRestore(
          data,
          Object.fromEntries(
            MODULE_IDS.map((id) => [
              id,
              (value: unknown) => {
                databases[id].validateRestore(value);
                domainValidators[id](value);
              }
            ])
          ) as Record<BackupModuleId, (value: unknown) => void>
        )
      );
      setPlan(nextPlan);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dit bestand kan niet worden hersteld.');
    }
  }

  async function restore() {
    if (!plan) return;
    setError('');
    setBusy(true);
    try {
      await withDatabases(async (databases) => {
        for (const id of MODULE_IDS) {
          const data = plan.modules[id];
          if (data) await databases[id].restore(data);
        }
      });
      setPlan(null);
      setMessage('Herstel voltooid.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Herstellen is mislukt.');
    } finally {
      setBusy(false);
    }
  }

  const planned = plan ? MODULE_IDS.filter((id) => plan.modules[id]) : [];

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Jouw gegevens"
        title="Back-up"
        description="Eén bestand met de gegevens van Dashboard, Sport, SIDEQUEST, Lichaam, Dagboek, Voeding, Kracht, Duur, Groei, Kennis en Financiën. Tijdens het maken worden wijzigingen tijdelijk gepauzeerd zodat alle modules uit één stabiel moment komen. Je gegevens staan alleen op dit apparaat; maak regelmatig een back-up. Het bestand bevat ook gezondheidsgegevens, je dagboek, je GPS-routes en je persoonlijke financiën: bewaar het veilig."
      />
      {error && <ErrorBanner message={error} />}
      {message && <p role="status"><StatusPill tone="good">{message}</StatusPill></p>}
      <Card title="Exporteren">
        <p className="item-subtitle">
          Laatste back-up op dit apparaat:{' '}
          {lastExport ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastExport)) : 'nog niet gemaakt'}
        </p>
        <div className="row" style={{ justifyContent: 'flex-start', marginTop: 15 }}>
          <Button onClick={() => void exportAll()} disabled={busy}>Download back-up</Button>
        </div>
      </Card>
      <Card title="Herstellen">
        <p className="item-subtitle">
          Kies een back-up van Personal Ecosystem, of een losse back-up van de oude Hub, Sportapp of SIDEQUEST. Het bestand wordt eerst volledig gecontroleerd; bij een fout wordt niets gewijzigd.
        </p>
        <Field label="Back-upbestand (JSON)">
          <input type="file" accept="application/json,.json" onChange={(event) => void checkFile(event.currentTarget.files?.[0])} />
        </Field>
        {plan && (
          <div className="stack" style={{ marginTop: 15 }}>
            <p>
              Bestand is in orde. Herstel vervangt de huidige gegevens van: <strong>{planned.map((id) => moduleLabel(id)).join(', ')}</strong>.
            </p>
            <div className="row" style={{ justifyContent: 'flex-start' }}>
              <Button variant="danger" onClick={() => void restore()} disabled={busy}>Herstel {planned.length === 1 ? 'deze module' : 'deze modules'}</Button>
              <Button variant="secondary" onClick={() => setPlan(null)} disabled={busy}>Annuleren</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
