import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { downloadJson, formatDate, newId } from '@ecosystem/core';
import { openLocalDatabase, parseLocalBackup, runStorageAction as performStorageAction, type LocalDatabase } from '@ecosystem/storage';
import {
  Button,
  Card,
  ConfirmAction,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  PwaInstallButton,
  StatusPill
} from '@ecosystem/ui';
import { isSafeUrl, validateHubBackup, type AppLaunch, type Shortcut } from './domain';
import { databaseConfig } from './database';

const BackupSettings = lazy(() => import('./BackupSettings').then((module) => ({ default: module.BackupSettings })));

interface HubPreferences {
  displayName: string;
  sportUrl: string;
  sidequestUrl: string;
  theme: 'light' | 'dark' | 'system';
}

const preferenceKey = 'personal-ecosystem.hub.preferences';
const externalAppUrls = {
  samenThuis: 'https://kesga44-jpg.github.io/Samen-thuis/',
  coach: 'https://kesga44-jpg.github.io/Coach/'
};
const localHubPort = Number(window.location.port);
const localAppBasePort = localHubPort === 4173 ? 4174 : 5174;
const initialPreferences: HubPreferences = {
  displayName: '',
  sportUrl: import.meta.env.VITE_SPORTAPP_URL || (['localhost', '127.0.0.1'].includes(window.location.hostname) ? `${window.location.protocol}//${window.location.hostname}:${localAppBasePort}/` : ''),
  sidequestUrl: import.meta.env.VITE_SIDEQUEST_URL || (['localhost', '127.0.0.1'].includes(window.location.hostname) ? `${window.location.protocol}//${window.location.hostname}:${localAppBasePort + 1}/` : ''),
  theme: 'system'
};

function readPreferences(): HubPreferences {
  const raw = localStorage.getItem(preferenceKey);
  if (!raw) return initialPreferences;
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== 'object') throw new Error('Hub-instellingen zijn beschadigd. Pas ze aan of wis de browserinstelling.');
  const candidate = saved as Partial<HubPreferences>;
  return {
    displayName: typeof candidate.displayName === 'string' ? candidate.displayName.slice(0, 60) : '',
    sportUrl: typeof candidate.sportUrl === 'string' ? candidate.sportUrl : initialPreferences.sportUrl,
    sidequestUrl: typeof candidate.sidequestUrl === 'string' ? candidate.sidequestUrl : initialPreferences.sidequestUrl,
    theme: candidate.theme === 'light' || candidate.theme === 'dark' ? candidate.theme : 'system'
  };
}

function App() {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [launches, setLaunches] = useState<AppLaunch[]>([]);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [preferences, setPreferences] = useState<HubPreferences>(initialPreferences);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storageLabel, setStorageLabel] = useState('Wordt gecontroleerd');

  async function refresh(db: LocalDatabase) {
    const [nextLaunches, nextShortcuts] = await Promise.all([
      db.list<AppLaunch>('launches'),
      db.list<Shortcut>('shortcuts')
    ]);
    setLaunches(nextLaunches.sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, 20));
    setShortcuts(nextShortcuts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }

  useEffect(() => {
    let active = true;
    let opened: LocalDatabase | null = null;
    void Promise.all([openLocalDatabase(databaseConfig), Promise.resolve().then(readPreferences)])
      .then(async ([db, savedPreferences]) => {
        opened = db;
        await refresh(db);
        if (active) {
          setDatabase(db);
          setPreferences(savedPreferences);
          document.documentElement.dataset.theme = savedPreferences.theme;
          setStorageLabel('Beschikbaar op dit apparaat');
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Lokale Hub-gegevens konden niet worden geopend.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      opened?.close();
    };
  }, []);

  async function savePreferences(next: HubPreferences) {
    setError('');
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(next));
      setPreferences(next);
      document.documentElement.dataset.theme = next.theme;
    } catch (cause) {
      setError(cause instanceof Error ? `Instellingen konden niet worden opgeslagen: ${cause.message}` : 'Instellingen konden niet worden opgeslagen.');
      throw cause;
    }
  }

  async function openApp(appId: 'sportapp' | 'sidequest') {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return;
    }
    const appName = appId === 'sportapp' ? 'Sportapp' : 'SIDEQUEST';
    await performStorageAction(
      () => database.put('launches', { id: newId(), appId, appName, openedAt: new Date().toISOString() }),
      () => refresh(database),
      setError,
      'App gestart, maar activiteit kon niet worden vastgelegd.'
    );
  }

  async function addShortcut(shortcut: Shortcut): Promise<boolean> {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return false;
    }
    return performStorageAction(
      () => database.put('shortcuts', shortcut),
      () => refresh(database),
      setError,
      'De snelkoppeling kon niet worden opgeslagen.'
    );
  }

  async function removeShortcut(id: string): Promise<boolean> {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return false;
    }
    return performStorageAction(
      () => database.remove('shortcuts', id),
      () => refresh(database),
      setError,
      'De snelkoppeling kon niet worden verwijderd.'
    );
  }

  if (loading) return <LoadingState />;
  if (!database) return <main className="main-content"><ErrorBanner message={error || 'Lokale opslag is niet beschikbaar.'} /></main>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage preferences={preferences} shortcuts={shortcuts} launches={launches} storageLabel={storageLabel} error={error} onOpen={openApp} />} />
        <Route path="/apps/sportapp" element={<AppInfoPage appId="sportapp" appName="Sportapp" url={preferences.sportUrl} onOpen={openApp} error={error} />} />
        <Route path="/apps/sidequest" element={<AppInfoPage appId="sidequest" appName="SIDEQUEST" url={preferences.sidequestUrl} onOpen={openApp} error={error} />} />
        <Route path="/activiteiten" element={<ActivityPage launches={launches} />} />
        <Route
          path="/instellingen"
          element={
            <SettingsPage
              database={database}
              preferences={preferences}
              shortcuts={shortcuts}
              error={error}
              onSavePreferences={savePreferences}
              onAddShortcut={addShortcut}
              onRemoveShortcut={removeShortcut}
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export function HomePage({
  preferences,
  shortcuts,
  launches,
  storageLabel,
  error,
  onOpen
}: {
  preferences: HubPreferences;
  shortcuts: Shortcut[];
  launches: AppLaunch[];
  storageLabel: string;
  error: string;
  onOpen: (appId: 'sportapp' | 'sidequest') => Promise<void>;
}) {
  const name = preferences.displayName.trim() || 'daar';
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Jouw persoonlijke startpunt"
        title={`Welkom${name === 'daar' ? '' : `, ${name}`}.`}
        description="Je apps, snelkoppelingen en lokale status op één plek. Elke app houdt de eigen gegevens."
      />
      <div className="grid grid-4">
        <AppTile icon="↗" title="Sport" description="Activiteiten, trainingen en sportgeschiedenis." url="/sport" onOpen={() => onOpen('sportapp')} />
        <AppTile icon="✦" title="SIDEQUEST" description="Persoonlijke doelen, gewoontes en quests." url="/quest" onOpen={() => onOpen('sidequest')} />
        <AppTile icon="⌂" title="Samen Thuis" description="Huishouden en gedeelde planning blijven in hun eigen app." url={externalAppUrls.samenThuis} />
        <AppTile icon="C" title="Coach" description="Teams, trainingen en wedstrijden in hun eigen app." url={externalAppUrls.coach} />
      </div>
      <div className="grid grid-2">
        <Card title="Recente activiteit" action={<Link className="text-button" to="/activiteiten">Alles bekijken →</Link>}>
          {launches.length ? (
            <div className="list">
              {launches.slice(0, 5).map((launch) => (
                <div className="list-item" key={launch.id}>
                  <div><p className="item-title">{launch.appName} geopend</p><p className="item-subtitle">Via Hub · {formatDate(launch.openedAt)}</p></div>
                  <StatusPill>App geopend</StatusPill>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Je Hub is klaar voor gebruik">App-openingen die je via deze Hub start verschijnen hier. App-activiteiten zelf blijven bij de eigenaar-app.</EmptyState>
          )}
        </Card>
        <Card title="Persoonlijk overzicht">
          <EmptyState title="Appdata blijft gescheiden">Sportstatistieken en SIDEQUEST-voortgang worden niet gekopieerd naar de Hub. Koppelingen verschijnen hier pas wanneer ze expliciet zijn ontworpen en ingesteld.</EmptyState>
        </Card>
      </div>
      <div className="grid grid-2">
        <Card title="Lokale status">
          <div className="list">
            <div className="list-item"><span>Hub-opslag</span><StatusPill tone="good">{storageLabel}</StatusPill></div>
            <div className="list-item"><span>Sport</span><StatusPill tone="good">Beschikbaar in deze app</StatusPill></div>
            <div className="list-item"><span>SIDEQUEST</span><StatusPill tone="good">Beschikbaar in deze app</StatusPill></div>
            <div className="list-item"><span>Synchronisatie</span><span className="small muted">Niet geconfigureerd · lokale modus</span></div>
          </div>
          <Link className="text-button" to="/instellingen">Beheer instellingen →</Link>
        </Card>
        <Card title="Snelkoppelingen" action={<Link className="text-button" to="/instellingen">Beheren →</Link>}>
          {shortcuts.length ? <div className="list">{shortcuts.slice(0, 4).map((shortcut) => <a className="list-item" key={shortcut.id} href={shortcut.url} target="_blank" rel="noopener noreferrer"><span className="item-title">{shortcut.title}</span><span className="small muted">Open ↗</span></a>)}</div> : <EmptyState title="Geen snelkoppelingen">Voeg in Instellingen een link toe die jij vaak gebruikt.</EmptyState>}
        </Card>
      </div>
    </div>
  );
}

function AppTile({ icon, title, description, url, onOpen }: { icon: string; title: string; description: string; url: string; onOpen?: () => Promise<void> }) {
  const isInternal = url.startsWith('/');
  async function handleOpen(event: MouseEvent<HTMLAnchorElement>) {
    if (!isInternal) {
      void onOpen?.();
      return;
    }
    event.preventDefault();
    await onOpen?.();
    window.location.assign(url);
  }
  return (
    <div className="app-tile">
      <span className="tile-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {url ? <><StatusPill tone="good">Beschikbaar</StatusPill><a className="button button-primary" style={{ marginTop: 14 }} href={url} {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })} onClick={handleOpen}>Open {title} {isInternal ? '→' : '↗'}</a></> : <><StatusPill tone="warning">URL niet ingesteld</StatusPill><Link className="text-button" to="/instellingen" style={{ marginTop: 8 }}>Stel URL in →</Link></>}
    </div>
  );
}

function AppInfoPage({
  appId,
  appName,
  url,
  onOpen,
  error
}: {
  appId: 'sportapp' | 'sidequest';
  appName: string;
  url: string;
  onOpen: (appId: 'sportapp' | 'sidequest') => Promise<void>;
  error: string;
}) {
  const description = appId === 'sportapp'
    ? 'Persoonlijke sportactiviteiten, trainingsplannen, GPX-import en statistieken.'
    : 'Persoonlijke doelen, dagelijkse of wekelijkse gewoontes, quests en voortgang.';
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Applicatie" title={appName} description={description} />
      <Card title="Applicatiegegevens">
        <div className="list">
          <div className="list-item"><span>Gegevenseigenaar</span><span>{appName}</span></div>
          <div className="list-item"><span>Opslag</span><span>Eigen IndexedDB-namespace</span></div>
          <div className="list-item"><span>Toegang</span><span>{url || 'Niet beschikbaar; URL instellen via Instellingen'}</span></div>
          <div className="list-item"><span>Synchronisatie</span><span>Niet geconfigureerd</span></div>
        </div>
        {url && <a className="button button-primary" style={{ marginTop: 16 }} href={url} target="_blank" rel="noopener noreferrer" onClick={() => void onOpen(appId)}>Open {appName} ↗</a>}
      </Card>
    </div>
  );
}

function ActivityPage({ launches }: { launches: AppLaunch[] }) {
  return (
    <div className="stack">
      <PageHeader eyebrow="Wat je via de Hub startte" title="Activiteiten" description="Deze lijst bevat alleen app-openingen via de Hub, geen kopieën van activiteiten uit andere apps." />
      <Card title="Recente app-openingen">
        {launches.length ? (
          <div className="list">
            {launches.map((launch) => <div className="list-item" key={launch.id}><div><p className="item-title">{launch.appName}</p><p className="item-subtitle">Gestart via de Hub</p></div><span className="small muted">{new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(launch.openedAt))}</span></div>)}
          </div>
        ) : (
          <EmptyState title="Nog geen app-openingen">Open Sportapp of SIDEQUEST via de Hub om deze lijst te vullen.</EmptyState>
        )}
      </Card>
    </div>
  );
}

function SettingsPage({
  database,
  preferences,
  shortcuts,
  error,
  onSavePreferences,
  onAddShortcut,
  onRemoveShortcut
}: {
  database: LocalDatabase;
  preferences: HubPreferences;
  shortcuts: Shortcut[];
  error: string;
  onSavePreferences: (preferences: HubPreferences) => Promise<void>;
  onAddShortcut: (shortcut: Shortcut) => Promise<boolean>;
  onRemoveShortcut: (id: string) => Promise<boolean>;
}) {
  const [name, setName] = useState(preferences.displayName);
  const [sportUrl, setSportUrl] = useState(preferences.sportUrl);
  const [sidequestUrl, setSidequestUrl] = useState(preferences.sidequestUrl);
  const [theme, setTheme] = useState<HubPreferences['theme']>(preferences.theme);
  const [shortcutTitle, setShortcutTitle] = useState('');
  const [shortcutUrl, setShortcutUrl] = useState('');
  const [shortcutId, setShortcutId] = useState(() => newId());
  const [formError, setFormError] = useState('');
  const [storageBytes, setStorageBytes] = useState<number | null>(null);
  const [records, setRecords] = useState<number | null>(null);
  const [backupError, setBackupError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    void Promise.all([
      database.exportData(),
      navigator.storage?.estimate?.()
    ]).then(([data, estimate]) => {
      setRecords(Object.values(data.stores).reduce((sum, items) => sum + items.length, 0));
      setStorageBytes(estimate?.usage ?? null);
    }).catch((cause: unknown) => setFormError(cause instanceof Error ? cause.message : 'Opslagstatus is niet beschikbaar.'));
  }, [database]);

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    try {
      await onSavePreferences({ displayName: name.trim().slice(0, 60), sportUrl, sidequestUrl, theme });
    } catch {
      setFormError('Instellingen zijn niet opgeslagen. Controleer de foutmelding.');
    }
  }

  async function submitShortcut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const normalized = validateAppUrl(shortcutUrl);
    if (normalized.error || !shortcutTitle.trim()) {
      setFormError(normalized.error || 'Vul een naam voor de snelkoppeling in.');
      return;
    }
    try {
      if (!await onAddShortcut({ id: shortcutId, title: shortcutTitle.trim().slice(0, 60), url: normalized.url, createdAt: new Date().toISOString() })) return;
      setShortcutTitle('');
      setShortcutUrl('');
      setShortcutId(newId());
    } catch {
      setFormError('De snelkoppeling kon niet worden opgeslagen.');
    }
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      {formError && <ErrorBanner message={formError} />}
      <PageHeader eyebrow="Platforminstellingen" title="Instellingen" description="Algemene voorkeuren en app-links. Persoonlijke appgegevens blijven in hun eigen app." />
      <Card title="Profiel en app-toegang">
        <form onSubmit={(event) => void submitSettings(event)}>
          <div className="form-grid">
            <Field label="Weergavenaam" hint="Alleen op dit apparaat">
              <input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Thema">
              <select value={theme} onChange={(event) => setTheme(event.target.value as HubPreferences['theme'])}>
                <option value="system">Systeeminstelling</option>
                <option value="light">Licht</option>
                <option value="dark">Donker</option>
              </select>
            </Field>
          </div>
          <div className="form-actions"><Button type="submit">Instellingen opslaan</Button></div>
        </form>
      </Card>
      <Card title="Eigen snelkoppeling">
        <form onSubmit={(event) => void submitShortcut(event)}>
          <div className="form-grid">
            <Field label="Naam"><input maxLength={60} value={shortcutTitle} onChange={(event) => setShortcutTitle(event.target.value)} required /></Field>
            <Field label="URL"><input type="url" value={shortcutUrl} onChange={(event) => setShortcutUrl(event.target.value)} placeholder="https://voorbeeld.nl" required /></Field>
          </div>
          <div className="form-actions"><Button type="submit">Snelkoppeling toevoegen</Button></div>
        </form>
        {shortcuts.length > 0 && <div className="list" style={{ marginTop: 18 }}>{shortcuts.map((shortcut) => <div className="list-item" key={shortcut.id}><div><p className="item-title">{shortcut.title}</p><p className="item-subtitle">{shortcut.url}</p></div><ConfirmAction label={`Verwijder snelkoppeling ${shortcut.title}`} confirmMessage={`Snelkoppeling "${shortcut.title}" verwijderen?`} onConfirm={() => void onRemoveShortcut(shortcut.id)}>Verwijder</ConfirmAction></div>)}</div>}
      </Card>
      <Card title="Opslag en synchronisatie">
        <div className="list">
          <div className="list-item"><span>Opslagstatus</span><StatusPill tone="good">Hub lokaal opgeslagen</StatusPill></div>
          <div className="list-item"><span>Hub-records</span><span>{records ?? '…'}</span></div>
          <div className="list-item"><span>Browseropslag gebruikt</span><span>{storageBytes === null ? 'Niet ondersteund' : `${(storageBytes / 1024 / 1024).toFixed(2)} MB`}</span></div>
          <div className="list-item"><span>Supabase / synchronisatie</span><span>Niet ingesteld; geen gegevens worden geüpload</span></div>
        </div>
      </Card>
      <Card title="Installatie">
        <PwaInstallButton />
      </Card>
      <Suspense fallback={<LoadingState />}>
        <BackupSettings hubDatabase={database} />
      </Suspense>
      <Card title="Hub-back-up">
        <p className="item-subtitle">Back-up bevat alleen Hub-appopeningen en snelkoppelingen; sport- en questgegevens vallen buiten deze opslag.</p>
        {backupError && <ErrorBanner message={backupError} />}
        <div className="row" style={{ justifyContent: 'flex-start', marginTop: 15 }}>
          <Button onClick={async () => {
            try { downloadJson('hub-backup.json', await database.exportData()); }
            catch (cause) { setBackupError(cause instanceof Error ? cause.message : 'Hub-back-up mislukt.'); }
          }}>Download Hub-back-up</Button>
          <Field label="Herstel uit JSON"><input type="file" accept="application/json,.json" onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            setBackupError('');
            try {
              if (file.size > 25 * 1024 * 1024) throw new Error('Back-ups mogen maximaal 25 MB groot zijn.');
              const data = parseLocalBackup(await file.text());
              database.validateRestore(data);
              validateHubBackup(data);
              if (!window.confirm('Herstel vervangt alle bestaande Hub-appopeningen en snelkoppelingen op dit apparaat. Doorgaan?')) return;
              await database.restore(data);
              window.location.reload();
            } catch (cause) {
              setBackupError(cause instanceof Error ? cause.message : 'Hub-back-up kon niet worden hersteld.');
            }
          }} /></Field>
        </div>
      </Card>
      <Button variant="secondary" onClick={() => navigate('/')}>← Terug naar Home</Button>
    </div>
  );
}

function validateAppUrl(raw: string): { url: string; error: string } {
  if (!raw.trim()) return { url: '', error: '' };
  if (!isSafeUrl(raw.trim())) return { url: '', error: 'Gebruik een geldig HTTPS-adres. Alleen localhost mag HTTP gebruiken; URL-wachtwoorden zijn niet toegestaan.' };
  return { url: new URL(raw.trim()).toString(), error: '' };
}

export default App;
