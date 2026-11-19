import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import { downloadJson, formatDate, formatDuration, newId } from '@ecosystem/core';
import { openLocalDatabase, parseLocalBackup, runStorageAction as performStorageAction, type LocalDatabase } from '@ecosystem/storage';
import {
  AppFrame,
  Button,
  Card,
  ConfirmAction,
  EmptyState,
  ErrorBanner,
  Field,
  LoadingState,
  PageHeader,
  PwaInstallButton,
  StatusPill,
  type ModuleLink
} from '@ecosystem/ui';
import {
  calculateSportStats,
  fingerprintFile,
  parseGpx,
  sportLabels,
  validateSportActivity,
  validateSportBackup,
  type Activity,
  type GpxPreview,
  type SportType,
  type Training
} from './domain';
import {
  emptyWeekGoal,
  isPlannedSession,
  isWeekGoal,
  planningCalendar,
  planStatus,
  weekProgress,
  type PlannedSession,
  type PlanningRecord,
  type PlanStatus,
  type SessionDay,
  type WeekGoal
} from './planning';
import { CoachPage } from './CoachPage';
import type { CoachLog, CoachRecord } from './coach';

export const databaseConfig = {
  appId: 'sport',
  databaseName: 'personal-ecosystem-sport',
  version: 3,
  stores: ['activities', 'trainings', 'planning', 'coach'],
  migrations: {
    1: (database: IDBDatabase) => {
      database.createObjectStore('activities', { keyPath: 'id' });
      database.createObjectStore('trainings', { keyPath: 'id' });
    },
    // PR 13: weekdoel en geplande trainingen.
    2: (database: IDBDatabase) => {
      database.createObjectStore('planning', { keyPath: 'id' });
    },
    // PR 15: coachprofiel, programma's en terugkoppeling.
    3: (database: IDBDatabase) => {
      database.createObjectStore('coach', { keyPath: 'id' });
    }
  },
  // Back-ups van schema 1 en 2 blijven herstelbaar: zonder planning en coachgegevens.
  exportUpgrades: {
    2: (stores: Record<string, { id: string }[]>) => ({ ...stores, planning: [] }),
    3: (stores: Record<string, { id: string }[]>) => ({ ...stores, coach: [] })
  }
} as const;

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/activiteiten', label: 'Activiteiten', icon: '↗' },
  { to: '/trainingen', label: 'Trainingen', icon: '◉' },
  { to: '/planning', label: 'Planning', icon: '▦' },
  { to: '/coach', label: 'Coach', icon: '✦' },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙' }
];

const activityDiscipline: Record<SportType, CoachLog['discipline']> = { run: 'running', strength: 'strength', walk: 'cardio', bike: 'cardio', swim: 'cardio', other: undefined };

function localDateTime(value?: string): string {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export interface AppProps {
  /** Pad waaronder de app draait; '/' als losse app, bijv. '/sport' als module (ADR 0020). */
  basename?: string;
  /** Links naar de andere modules; leeg als losse app. */
  moduleLinks?: ModuleLink[];
  /** Trainingen uit Kracht en Duur (alleen datum en minuten), voor het weekdoel. Ontbreekt in de losse app. */
  otherSessions?: SessionDay[];
}

function App({ basename = '/', moduleLinks = [], otherSessions = [] }: AppProps = {}) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [planning, setPlanning] = useState<PlanningRecord[]>([]);
  const [coach, setCoach] = useState<CoachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const [nextActivities, nextTrainings, nextPlanning, nextCoach] = await Promise.all([
      db.list<Activity>('activities'),
      db.list<Training>('trainings'),
      db.list<PlanningRecord>('planning'),
      db.list<CoachRecord>('coach')
    ]);
    setPlanning(nextPlanning);
    setCoach(nextCoach);
    setActivities(nextActivities.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    setTrainings(nextTrainings.sort((a, b) => a.title.localeCompare(b.title)));
  }

  useEffect(() => {
    let active = true;
    let opened: LocalDatabase | null = null;
    void openLocalDatabase(databaseConfig)
      .then(async (db) => {
        opened = db;
        await refresh(db);
        if (active) setDatabase(db);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Lokale gegevens konden niet worden geopend.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      opened?.close();
    };
  }, []);

  async function runStorageAction(action: (db: LocalDatabase) => Promise<void>) {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return false;
    }
    return performStorageAction(
      () => action(database),
      () => refresh(database),
      setError,
      'De wijziging kon niet worden opgeslagen.'
    );
  }

  const goal = planning.find(isWeekGoal) ?? emptyWeekGoal;
  const plans = planning.filter(isPlannedSession);
  const sessions: SessionDay[] = [
    ...activities.map((activity) => ({ date: localDay(new Date(activity.startedAt)), minutes: activity.durationMinutes })),
    ...otherSessions
  ];
  // Belasting voor de coach: vastgelegde trainingen met een grove discipline.
  const coachLogs: CoachLog[] = [
    ...activities.map((activity) => ({ date: localDay(new Date(activity.startedAt)), discipline: activityDiscipline[activity.type], completed: true, durationMinutes: activity.durationMinutes })),
    ...otherSessions.map((session) => ({ date: session.date, discipline: session.discipline, completed: true, durationMinutes: session.minutes }))
  ];

  if (loading) return <LoadingState />;
  if (!database) return <main className="main-content"><ErrorBanner message={error || 'Lokale opslag is niet beschikbaar.'} /></main>;

  return (
    <BrowserRouter basename={basename}>
      <AppFrame appName="Sportapp" appMark="S" navigation={navigation} moduleLinks={moduleLinks}>
        <Routes>
          <Route
            path="/"
            element={<Dashboard activities={activities} trainings={trainings} sessions={sessions} goal={goal} error={error} />}
          />
          <Route
            path="/activiteiten"
            element={
              <ActivitiesPage
                activities={activities}
                onSave={(activity) => runStorageAction((db) => db.put('activities', activity))}
                onDelete={(id) => runStorageAction((db) => db.remove('activities', id))}
                error={error}
              />
            }
          />
          <Route
            path="/trainingen"
            element={
              <TrainingsPage
                trainings={trainings}
                onSave={(training) => runStorageAction((db) => db.put('trainings', training))}
                onLog={(training) =>
                  runStorageAction((db) =>
                    db.put('activities', {
                      id: newId(),
                      startedAt: new Date().toISOString(),
                      type: 'strength',
                      durationMinutes: training.targetMinutes,
                      distanceKm: null,
                      notes: `Geregistreerd vanuit training: ${training.title}`,
                      trainingId: training.id
                    })
                  )
                }
                onDelete={(id) => runStorageAction((db) => db.remove('trainings', id))}
                error={error}
              />
            }
          />
          <Route
            path="/planning"
            element={
              <PlanningPage
                sessions={sessions}
                goal={goal}
                plans={plans}
                trainings={trainings}
                onGoal={(next) => runStorageAction((db) => db.put('planning', next))}
                onPlan={(plan) => runStorageAction((db) => db.put('planning', plan))}
                onDelete={(id) => runStorageAction((db) => db.remove('planning', id))}
                error={error}
              />
            }
          />
          <Route
            path="/coach"
            element={
              <CoachPage
                records={coach}
                logs={coachLogs}
                onSave={(record) => runStorageAction((db) => db.put('coach', record))}
                onSaveMany={(records) => runStorageAction(async (db) => {
                  for (const record of records) await db.put('coach', record);
                })}
                onDelete={(id) => runStorageAction((db) => db.remove('coach', id))}
                onPlan={(plans) => runStorageAction(async (db) => {
                  for (const plan of plans) await db.put('planning', plan);
                })}
                error={error}
              />
            }
          />
          <Route
            path="/instellingen"
            element={
              <SettingsPage
                database={database}
                onRestore={(data) => runStorageAction((db) => db.restore(data))}
                error={error}
              />
            }
          />
        </Routes>
      </AppFrame>
    </BrowserRouter>
  );
}

function Dashboard({
  activities,
  trainings,
  sessions,
  goal,
  error
}: {
  activities: Activity[];
  trainings: Training[];
  sessions: SessionDay[];
  goal: WeekGoal;
  error: string;
}) {
  const navigate = useNavigate();
  const stats = calculateSportStats(activities);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthCount = activities.filter((activity) => activity.startedAt.startsWith(thisMonth)).length;
  const typeEntries = Object.entries(stats.byType) as [SportType, number][];

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Jouw beweging"
        title="Sport, op jouw manier."
        description="Houd activiteiten en trainingen bij. Je gegevens blijven op dit apparaat."
        action={<Button onClick={() => navigate('/activiteiten')}>＋ Activiteit toevoegen</Button>}
      />
      <div className="grid grid-4">
        <Metric label="Activiteiten" value={stats.count.toString()} note={`${monthCount} deze maand`} />
        <Metric label="Afstand totaal" value={`${stats.distanceKm.toFixed(1)} km`} note="Alle vastgelegde activiteiten" />
        <Metric label="Beweegtijd" value={formatDuration(stats.durationMinutes)} note="Totale trainingsduur" />
        <Metric label="Trainingen" value={trainings.filter((training) => !training.archived).length.toString()} note="Actieve trainingsplannen" />
      </div>
      <WeekGoalCard sessions={sessions} goal={goal} />
      <div className="grid grid-2">
        <Card title="Recente activiteiten">
          {activities.length ? (
            <div className="list">
              {activities.slice(0, 4).map((activity) => (
                <div className="list-item" key={activity.id}>
                  <div>
                    <p className="item-title">{sportLabels[activity.type]}</p>
                    <p className="item-subtitle">{formatDate(activity.startedAt)} · {formatDuration(activity.durationMinutes)}</p>
                  </div>
                  {activity.distanceKm !== null && <StatusPill>{activity.distanceKm.toFixed(1)} km</StatusPill>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Je eerste activiteit begint hier">
              Voeg een activiteit toe of importeer een GPX-bestand. Er worden geen voorbeeldgegevens getoond.
            </EmptyState>
          )}
          {activities.length > 4 && <Link className="text-button" to="/activiteiten">Bekijk alle activiteiten →</Link>}
        </Card>
        <Card title="Verdeling per sport">
          {typeEntries.length ? (
            <div className="list">
              {typeEntries.map(([type, count]) => (
                <div className="list-item" key={type}>
                  <span className="item-title">{sportLabels[type]}</span>
                  <StatusPill>{count} {count === 1 ? 'activiteit' : 'activiteiten'}</StatusPill>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nog geen verdeling">Na je eerste activiteit zie je hier welke sporten je doet.</EmptyState>
          )}
        </Card>
      </div>
      <div className="notice">Lokale modus actief · Sportdata staat alleen in de Sportapp-opslag. Er is geen synchronisatie of externe sportkoppeling ingeschakeld.</div>
    </div>
  );
}

function localDay(value: Date = new Date()): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function shortDay(day: string, withWeekday = false): string {
  return new Intl.DateTimeFormat('nl-NL', withWeekday ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00`));
}

const statusLabels: Record<PlanStatus, string> = { gedaan: 'Gedaan', gemist: 'Gemist', gepland: 'Gepland' };

function WeekGoalCard({ sessions, goal }: { sessions: SessionDay[]; goal: WeekGoal }) {
  const progress = weekProgress(sessions, goal, localDay());
  if (goal.sessions === null && goal.minutes === null) {
    return (
      <Card title="Weekdoel">
        <p className="item-subtitle">Nog geen weekdoel. Deze week: {progress.sessions} {progress.sessions === 1 ? 'training' : 'trainingen'}, {progress.minutes} min.</p>
        <Link className="text-button" to="/planning">Weekdoel instellen →</Link>
      </Card>
    );
  }
  return (
    <Card title="Weekdoel" action={progress.reached ? <StatusPill tone="good">Gehaald</StatusPill> : undefined}>
      <div className="list">
        {goal.sessions !== null && <GoalRow label="Trainingen" value={progress.sessions} target={goal.sessions} unit="" />}
        {goal.minutes !== null && <GoalRow label="Minuten" value={progress.minutes} target={goal.minutes} unit=" min" />}
      </div>
      <p className="item-subtitle">Week van {shortDay(progress.weekStart)}; trainingen uit Sport, Kracht en Duur tellen mee.</p>
      <Link className="text-button" to="/planning">Naar planning →</Link>
    </Card>
  );
}

function GoalRow({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  return (
    <div className="list-item goal-row">
      <div style={{ flex: 1 }}>
        <p className="item-title">{label}: {value} van {target}{unit}</p>
        <div className="progress-track" role="progressbar" aria-label={`${label} deze week`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(value, target)}>
          <span style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function PlanningPage({
  sessions,
  goal,
  plans,
  trainings,
  onGoal,
  onPlan,
  onDelete,
  error
}: {
  sessions: SessionDay[];
  goal: WeekGoal;
  plans: PlannedSession[];
  trainings: Training[];
  onGoal: (goal: WeekGoal) => Promise<boolean>;
  onPlan: (plan: PlannedSession) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  error: string;
}) {
  const today = localDay();
  const calendar = planningCalendar(plans, sessions, today);
  const activeTrainings = trainings.filter((training) => !training.archived);
  const [goalSessions, setGoalSessions] = useState(goal.sessions?.toString() ?? '');
  const [goalMinutes, setGoalMinutes] = useState(goal.minutes?.toString() ?? '');
  const [date, setDate] = useState(today);
  const [trainingId, setTrainingId] = useState('');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('45');
  const [formError, setFormError] = useState('');
  const [savedGoal, setSavedGoal] = useState(false);

  useEffect(() => {
    setGoalSessions(goal.sessions?.toString() ?? '');
    setGoalMinutes(goal.minutes?.toString() ?? '');
  }, [goal.sessions, goal.minutes]);

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    setSavedGoal(false);
    const next: WeekGoal = { ...emptyWeekGoal, sessions: goalSessions.trim() ? Number(goalSessions) : null, minutes: goalMinutes.trim() ? Number(goalMinutes) : null };
    if (!isWeekGoal(next)) {
      setFormError('Vul 1 tot 21 trainingen en/of 1 tot 3000 minuten per week in, of laat een veld leeg.');
      return;
    }
    setSavedGoal(await onGoal(next));
  }

  async function addPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const training = activeTrainings.find((item) => item.id === trainingId);
    const plan: PlannedSession = { id: newId(), kind: 'plan', date, title: (title.trim() || training?.title || '').slice(0, 100), minutes: Number(minutes), trainingId: training?.id ?? null };
    if (date < today) {
      setFormError('Plan een training vandaag of later.');
      return;
    }
    if (!isPlannedSession(plan)) {
      setFormError('Kies een datum, geef de training een naam (of kies een training) en vul 1 tot 600 minuten in.');
      return;
    }
    if (await onPlan(plan)) {
      setTitle('');
      setTrainingId('');
    }
  }

  return (
    <div className="stack">
      {(error || formError) && <ErrorBanner message={error || formError} />}
      <PageHeader eyebrow="Vooruit kijken" title="Planning" description="Stel een weekdoel in en plan trainingen. Of een geplande training gedaan is, zie je aan je vastgelegde trainingen op die dag." />
      <div className="grid grid-2">
        <WeekGoalCard sessions={sessions} goal={goal} />
        <Card title="Weekdoel instellen">
          <form onSubmit={(event) => void saveGoal(event)} noValidate>
            <div className="form-grid">
              <Field label="Trainingen per week" hint="Leeg = geen doel"><input type="number" min="1" max="21" step="1" value={goalSessions} onChange={(event) => setGoalSessions(event.target.value)} /></Field>
              <Field label="Minuten per week" hint="Leeg = geen doel"><input type="number" min="1" max="3000" step="1" value={goalMinutes} onChange={(event) => setGoalMinutes(event.target.value)} /></Field>
            </div>
            {savedGoal && <p role="status"><StatusPill tone="good">Weekdoel opgeslagen</StatusPill></p>}
            <div className="form-actions"><Button type="submit">Weekdoel opslaan</Button></div>
          </form>
        </Card>
      </div>
      <Card title="Training plannen">
        <form onSubmit={(event) => void addPlan(event)} noValidate>
          <div className="form-grid">
            <Field label="Datum"><input type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Training (optioneel)">
              <select value={trainingId} onChange={(event) => {
                setTrainingId(event.target.value);
                const chosen = activeTrainings.find((item) => item.id === event.target.value);
                if (chosen) setMinutes(chosen.targetMinutes.toString());
              }}>
                <option value="">Zelf invullen</option>
                {activeTrainings.map((training) => <option key={training.id} value={training.id}>{training.title}</option>)}
              </select>
            </Field>
            <Field label="Naam" hint={trainingId ? 'Leeg = naam van de training' : 'Bijv. Hardlopen of Zwemmen'}><input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
            <Field label="Minuten"><input type="number" min="1" max="600" step="1" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></Field>
          </div>
          <div className="form-actions"><Button type="submit">Inplannen</Button></div>
        </form>
      </Card>
      <Card title="Deze en volgende week">
        <ul className="plan-calendar">
          {calendar.map((day) => (
            <li key={day.date} className={day.date === today ? 'plan-day today' : 'plan-day'}>
              <div className="plan-day-head">
                <span className="item-title">{shortDay(day.date, true)}{day.date === today ? ' · vandaag' : ''}</span>
                {day.sessions > 0 && <span className="item-subtitle">{day.sessions} {day.sessions === 1 ? 'training' : 'trainingen'} · {day.minutes} min</span>}
              </div>
              {day.plans.map((plan) => {
                const status = planStatus(plan, sessions, today);
                return (
                  <div className="plan-item" key={plan.id}>
                    <span>{plan.title} · {plan.minutes} min</span>
                    <StatusPill tone={status === 'gedaan' ? 'good' : status === 'gemist' ? 'warning' : 'neutral'}>{statusLabels[status]}</StatusPill>
                    <ConfirmAction label={`${plan.title} op ${shortDay(plan.date)} verwijderen`} confirmMessage={`Geplande training "${plan.title}" verwijderen?`} onConfirm={() => void onDelete(plan.id)}>×</ConfirmAction>
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </Card>
  );
}

function ActivitiesPage({
  activities,
  onSave,
  onDelete,
  error
}: {
  activities: Activity[];
  onSave: (activity: Activity) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  error: string;
}) {
  const [editing, setEditing] = useState<Activity | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<{ details: GpxPreview; fingerprint: string } | null>(null);
  const [importError, setImportError] = useState('');
  const navigate = useNavigate();
  const duplicateFingerprints = useMemo(
    () => new Set(activities.flatMap((activity) => activity.sourceFingerprint ? [activity.sourceFingerprint] : [])),
    [activities]
  );

  async function readGpx(file?: File) {
    if (!file) return;
    setImportError('');
    setPreview(null);
    try {
      if (!file.name.toLowerCase().endsWith('.gpx')) throw new Error('Kies een bestand met de extensie .gpx.');
      if (file.size > 10 * 1024 * 1024) throw new Error('GPX-bestanden mogen maximaal 10 MB groot zijn.');
      const content = await file.text();
      const details = parseGpx(content, file.name);
      const fingerprint = await fingerprintFile(content);
      if (duplicateFingerprints.has(fingerprint)) throw new Error('Dit GPX-bestand is al eerder geïmporteerd.');
      setPreview({ details, fingerprint });
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : 'GPX kon niet worden gelezen.');
    }
  }

  async function saveGpx() {
    if (!preview) return;
    const activity: Activity = {
      id: preview.fingerprint,
      startedAt: preview.details.startedAt,
      type: 'run',
      durationMinutes: preview.details.durationMinutes,
      distanceKm: preview.details.distanceKm,
      notes: `GPX-import: ${preview.details.name}`,
      sourceFingerprint: preview.fingerprint
    };
    try {
      validateSportActivity(activity);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : 'GPX-activiteit bevat ongeldige gegevens.');
      return;
    }
    const saved = await onSave(activity);
    if (!saved) return;
    setPreview(null);
    setImportError('');
  }

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Sportlogboek"
        title="Activiteiten"
        description="Registreer activiteiten of importeer een GPX-route nadat je de samenvatting hebt gecontroleerd."
        action={<Button onClick={() => { setEditing(null); setShowForm(true); }}>＋ Toevoegen</Button>}
      />
      <Card title="GPX importeren">
        <div className="row">
          <div>
            <p className="item-title">GPX-routebestand</p>
            <p className="item-subtitle">Maximaal 10 MB. Alleen afstand, tijd en samenvatting worden opgeslagen; ruwe GPS-punten niet.</p>
          </div>
          <Field label="Kies .gpx-bestand">
            <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={(event) => void readGpx(event.currentTarget.files?.[0])} />
          </Field>
        </div>
        {importError && <ErrorBanner message={importError} />}
        {preview && (
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="notice">
              <strong>Voorbeeld: {preview.details.name}</strong><br />
              {formatDate(preview.details.startedAt)} · {preview.details.distanceKm.toFixed(2)} km · {preview.details.durationMinutes} min
            </div>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setPreview(null)}>Annuleren</Button>
              <Button onClick={() => void saveGpx()}>Importeer activiteit</Button>
            </div>
          </div>
        )}
      </Card>
      {showForm && (
        <ActivityForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={async (activity) => {
            const saved = await onSave(activity);
            if (saved) {
              setShowForm(false);
              setEditing(null);
            }
            return saved;
          }}
        />
      )}
      <Card title="Geschiedenis">
        {activities.length ? (
          <div className="list">
            {activities.map((activity) => (
              <div className="list-item" key={activity.id}>
                <div>
                  <p className="item-title">{sportLabels[activity.type]}</p>
                  <p className="item-subtitle">
                    {formatDate(activity.startedAt)} · {formatDuration(activity.durationMinutes)}
                    {activity.distanceKm !== null ? ` · ${activity.distanceKm.toFixed(2)} km` : ''}
                    {activity.notes ? ` · ${activity.notes}` : ''}
                  </p>
                </div>
                <div className="row">
                  <Button variant="secondary" onClick={() => { setEditing(activity); setShowForm(true); }}>Bewerk</Button>
                  <ConfirmAction
                    label={`Verwijder ${sportLabels[activity.type]} van ${formatDate(activity.startedAt)}`}
                    confirmMessage="Deze activiteit definitief verwijderen?"
                    onConfirm={() => void onDelete(activity.id)}
                  >Verwijder</ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen activiteiten">Activiteiten die je toevoegt of importeert verschijnen hier.</EmptyState>
        )}
      </Card>
      <Button variant="secondary" onClick={() => navigate('/')}>← Terug naar overzicht</Button>
    </div>
  );
}

function ActivityForm({
  initial,
  onCancel,
  onSave
}: {
  initial: Activity | null;
  onCancel: () => void;
  onSave: (activity: Activity) => Promise<boolean>;
}) {
  const [id] = useState(() => initial?.id ?? newId());
  const [type, setType] = useState<SportType>(initial?.type ?? 'run');
  const [startedAt, setStartedAt] = useState(localDateTime(initial?.startedAt));
  const [duration, setDuration] = useState(initial?.durationMinutes.toString() ?? '');
  const [distance, setDistance] = useState(initial?.distanceKm?.toString() ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [formError, setFormError] = useState('');
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const durationMinutes = Number(duration);
    const distanceKm = distance === '' ? null : Number(distance);
    if (!startedAt || !Number.isFinite(Date.parse(startedAt)) || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setFormError('Vul een geldige datum en een duur van minimaal 1 minuut in.');
      return;
    }
    if (distanceKm !== null && (!Number.isFinite(distanceKm) || distanceKm <= 0)) {
      setFormError('Afstand moet een positief getal zijn.');
      return;
    }
    const activity: Activity = {
      id,
      startedAt: new Date(startedAt).toISOString(),
      type,
      durationMinutes,
      distanceKm,
      notes: notes.trim().slice(0, 1000),
      ...(initial?.sourceFingerprint ? { sourceFingerprint: initial.sourceFingerprint } : {}),
      ...(initial?.trainingId ? { trainingId: initial.trainingId } : {})
    };
    try {
      validateSportActivity(activity);
      if (await onSave(activity)) navigate('/activiteiten');
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Activiteit bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={initial ? 'Activiteit bewerken' : 'Activiteit toevoegen'}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Sporttype">
            <select value={type} onChange={(event) => setType(event.target.value as SportType)}>
              {Object.entries(sportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Datum en tijd">
            <input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} required />
          </Field>
          <Field label="Duur (minuten)">
            <input type="number" min="1" step="1" value={duration} onChange={(event) => setDuration(event.target.value)} required />
          </Field>
          <Field label="Afstand (km)" hint="Optioneel">
            <input type="number" min="0.01" step="0.01" value={distance} onChange={(event) => setDistance(event.target.value)} />
          </Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Notities">
              <textarea maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>
        </div>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onCancel}>Annuleren</Button>
          <Button type="submit">{initial ? 'Wijzigingen opslaan' : 'Activiteit opslaan'}</Button>
        </div>
      </form>
    </Card>
  );
}

function TrainingsPage({
  trainings,
  onSave,
  onLog,
  onDelete,
  error
}: {
  trainings: Training[];
  onSave: (training: Training) => Promise<boolean>;
  onLog: (training: Training) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  error: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Training | null>(null);
  const activeTrainings = trainings.filter((training) => !training.archived);

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Jouw trainingsplan"
        title="Trainingen"
        description="Maak je eigen trainingsdoelen en registreer een sessie met één tik."
        action={<Button onClick={() => { setEditing(null); setShowForm(true); }}>＋ Training maken</Button>}
      />
      {showForm && (
        <TrainingForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={async (training) => {
            const saved = await onSave(training);
            if (saved) {
              setShowForm(false);
              setEditing(null);
            }
            return saved;
          }}
        />
      )}
      <Card title="Jouw trainingen">
        {activeTrainings.length ? (
          <div className="list">
            {activeTrainings.map((training) => (
              <div className="list-item" key={training.id}>
                <div>
                  <p className="item-title">{training.title}</p>
                  <p className="item-subtitle">{training.category} · {training.targetMinutes} min · {training.goal || 'Geen doelnotitie'}</p>
                </div>
                <div className="row">
                  <Button onClick={() => void onLog(training)}>Registreer sessie</Button>
                  <Button variant="secondary" onClick={() => { setEditing(training); setShowForm(true); }}>Bewerk</Button>
                  <ConfirmAction label={`Archiveer ${training.title}`} confirmMessage={`Training "${training.title}" verwijderen?`} onConfirm={() => void onDelete(training.id)}>Verwijder</ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen trainingen">Maak een training aan om je sessies makkelijker vast te leggen.</EmptyState>
        )}
      </Card>
      <Card title="Trainingshistorie">
        <p className="item-subtitle">Geregistreerde sessies verschijnen samen met je activiteiten in het sportlogboek.</p>
        <Link className="text-button" to="/activiteiten">Open activiteitenhistorie →</Link>
      </Card>
    </div>
  );
}

function TrainingForm({
  initial,
  onCancel,
  onSave
}: {
  initial: Training | null;
  onCancel: () => void;
  onSave: (training: Training) => Promise<boolean>;
}) {
  const [id] = useState(() => initial?.id ?? newId());
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [goal, setGoal] = useState(initial?.goal ?? '');
  const [targetMinutes, setTargetMinutes] = useState(initial?.targetMinutes.toString() ?? '45');
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const minutes = Number(targetMinutes);
    if (!title.trim() || !category.trim() || !Number.isInteger(minutes) || minutes < 1) {
      setFormError('Vul een naam, categorie en geldige doelduur in.');
      return;
    }
    await onSave({
      id,
      title: title.trim().slice(0, 100),
      category: category.trim().slice(0, 60),
      goal: goal.trim().slice(0, 500),
      targetMinutes: minutes,
      archived: false
    });
  }

  return (
    <Card title={initial ? 'Training aanpassen' : 'Nieuwe training'}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Naam"><input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <Field label="Eigen categorie"><input maxLength={60} placeholder="Bijv. kracht, interval, herstel" value={category} onChange={(event) => setCategory(event.target.value)} required /></Field>
          <Field label="Doelduur (minuten)"><input type="number" min="1" value={targetMinutes} onChange={(event) => setTargetMinutes(event.target.value)} required /></Field>
          <Field label="Trainingsdoel"><input maxLength={500} value={goal} onChange={(event) => setGoal(event.target.value)} /></Field>
        </div>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onCancel}>Annuleren</Button>
          <Button type="submit">Training opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

function SettingsPage({
  database,
  onRestore,
  error
}: {
  database: LocalDatabase;
  onRestore: (data: unknown) => Promise<boolean>;
  error: string;
}) {
  const [storageSize, setStorageSize] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState('');

  useEffect(() => {
    void database.exportData().then((data) => setStorageSize(Object.values(data.stores).reduce((sum, records) => sum + records.length, 0)));
  }, [database]);

  async function exportData() {
    setRestoreError('');
    try {
      downloadJson('sportapp-backup.json', await database.exportData());
    } catch (cause) {
      setRestoreError(cause instanceof Error ? `Back-up kon niet worden geëxporteerd: ${cause.message}` : 'Back-up kon niet worden geëxporteerd.');
    }
  }

  async function importData(file?: File) {
    if (!file) return;
    setRestoreError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Back-ups mogen maximaal 25 MB groot zijn.');
      const data = parseLocalBackup(await file.text());
      database.validateRestore(data);
      validateSportBackup(data);
      if (!window.confirm('Herstel vervangt alle bestaande Sportapp-gegevens op dit apparaat. Je huidige gegevens worden overschreven. Doorgaan?')) return;
      await onRestore(data);
    } catch (cause) {
      setRestoreError(cause instanceof Error ? cause.message : 'Back-up kon niet worden hersteld.');
    }
  }

  return (
    <div className="stack">
      {(error || restoreError) && <ErrorBanner message={error || restoreError} />}
      <PageHeader eyebrow="Privé op dit apparaat" title="Instellingen" description="Beheer je lokale gegevens en maak een herstelbare kopie." />
      <Card title="Lokale opslag">
        <div className="list">
          <div className="list-item"><span>Opslagmodus</span><StatusPill tone="good">Alleen lokaal</StatusPill></div>
          <div className="list-item"><span>Database</span><span className="small muted">Sportapp · schema v{database.schemaVersion}</span></div>
          <div className="list-item"><span>Opgeslagen records</span><span>{storageSize ?? '…'}</span></div>
          <div className="list-item"><span>Synchronisatie</span><span className="small muted">Niet geconfigureerd</span></div>
        </div>
      </Card>
      <Card title="Back-up en herstel">
        <p className="item-subtitle">De JSON-back-up bevat alleen Sportapp-gegevens. Bewaar deze op een plek die jij vertrouwt.</p>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-start' }}>
          <Button onClick={() => void exportData()}>Download back-up</Button>
          <Field label="Herstel uit JSON">
            <input type="file" accept="application/json,.json" onChange={(event) => void importData(event.currentTarget.files?.[0])} />
          </Field>
        </div>
      </Card>
      <Card title="Installatie en privacy">
        <div className="stack">
          <PwaInstallButton />
          <p className="item-subtitle">De offline cache bevat alleen de statische app-shell, nooit jouw activiteiten.</p>
          <p className="item-subtitle">GPX-routepunten worden lokaal verwerkt en niet bewaard; alleen de gevalideerde samenvatting blijft in de Sportapp.</p>
        </div>
      </Card>
    </div>
  );
}

export default App;
