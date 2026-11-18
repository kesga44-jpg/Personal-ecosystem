import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { downloadJson, formatDate, newId } from '@ecosystem/core';
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
  advanceQuest,
  calculateHabitStreak,
  calculatePoints,
  currentPeriodChecks,
  daysUntilDeadline,
  DEFAULT_QUEST_CATEGORY,
  editQuest,
  HABIT_POINTS_PER_CHECK,
  MAX_QUEST_STEPS,
  normalizeQuest,
  QUEST_CATEGORIES,
  sortActiveQuests,
  toggleQuestStep,
  validateQuest,
  validateSidequestBackup,
  validateProgress,
  type Goal,
  type Habit,
  type HabitCheck,
  type Quest,
  type QuestStep
} from './domain';

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

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/doelen', label: 'Doelen', icon: '◎' },
  { to: '/gewoontes', label: 'Gewoontes', icon: '↻' },
  { to: '/quests', label: 'Quests', icon: '✦' },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙' }
];

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Leest de quest opnieuw uit de database, zodat snel na elkaar afvinken elkaar niet overschrijft. */
async function latestQuest(db: LocalDatabase, quest: Quest): Promise<Quest> {
  return normalizeQuest((await db.get<Quest>('quests', quest.id)) ?? quest);
}

export interface AppProps {
  /** Pad waaronder de app draait; '/' als losse app, bijv. '/sport' als module (ADR 0020). */
  basename?: string;
  /** Links naar de andere modules; leeg als losse app. */
  moduleLinks?: ModuleLink[];
}

function App({ basename = '/', moduleLinks = [] }: AppProps = {}) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheck[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** Quest-wijzigingen lopen na elkaar, zodat snel afvinken nooit een eerdere klik overschrijft. */
  const questQueue = useRef<Promise<unknown>>(Promise.resolve());

  function queueQuestChange(change: (current: Quest) => Quest, quest: Quest): Promise<boolean> {
    const next = questQueue.current.then(() => runStorageAction(async (db) => db.put('quests', change(await latestQuest(db, quest)))));
    questQueue.current = next.catch(() => undefined);
    return next;
  }

  async function refresh(db: LocalDatabase) {
    const [nextGoals, nextHabits, nextChecks, nextQuests] = await Promise.all([
      db.list<Goal>('goals'),
      db.list<Habit>('habits'),
      db.list<HabitCheck>('habitChecks'),
      db.list<Quest>('quests')
    ]);
    setGoals(nextGoals.sort((a, b) => a.targetDate.localeCompare(b.targetDate)));
    setHabits(nextHabits.sort((a, b) => a.title.localeCompare(b.title)));
    setChecks(nextChecks.sort((a, b) => b.date.localeCompare(a.date)));
    setQuests(nextQuests.map(normalizeQuest).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
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

  if (loading) return <LoadingState />;
  if (!database) return <main className="main-content"><ErrorBanner message={error || 'Lokale opslag is niet beschikbaar.'} /></main>;

  return (
    <BrowserRouter basename={basename}>
      <AppFrame appName="SIDEQUEST" appMark="✦" navigation={navigation} moduleLinks={moduleLinks}>
        <Routes>
          <Route path="/" element={<Dashboard goals={goals} habits={habits} checks={checks} quests={quests} error={error} />} />
          <Route
            path="/doelen"
            element={
              <GoalsPage
                goals={goals}
                onSave={(goal) => runStorageAction((db) => db.put('goals', goal))}
                onArchive={(goal) => runStorageAction((db) => db.put('goals', { ...goal, status: 'archived' }))}
                error={error}
              />
            }
          />
          <Route
            path="/gewoontes"
            element={
              <HabitsPage
                habits={habits}
                checks={checks}
                onSave={(habit) => runStorageAction((db) => db.put('habits', habit))}
                onArchive={(habit) => runStorageAction((db) => db.put('habits', { ...habit, archived: true }))}
                onCheck={(habit) =>
                  runStorageAction((db) =>
                    db.put('habitChecks', { id: `${habit.id}:${todayKey()}`, habitId: habit.id, date: todayKey() })
                  )
                }
                error={error}
              />
            }
          />
          <Route
            path="/quests"
            element={
              <QuestsPage
                quests={quests}
                goalCategories={goals.map((goal) => goal.category)}
                onSave={(quest) => runStorageAction((db) => db.put('quests', quest))}
                onProgress={(quest) => queueQuestChange((current) => advanceQuest(current), quest)}
                onToggleStep={(quest, stepId) => queueQuestChange((current) => toggleQuestStep(current, stepId), quest)}
                error={error}
              />
            }
          />
          <Route
            path="/instellingen"
            element={<SettingsPage database={database} onRestore={(data) => runStorageAction((db) => db.restore(data))} error={error} />}
          />
        </Routes>
      </AppFrame>
    </BrowserRouter>
  );
}

function Dashboard({
  goals,
  habits,
  checks,
  quests,
  error
}: {
  goals: Goal[];
  habits: Habit[];
  checks: HabitCheck[];
  quests: Quest[];
  error: string;
}) {
  const today = todayKey();
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const todayHabits = habits.filter((habit) => !habit.archived);
  const activeQuests = sortActiveQuests(quests.filter((quest) => quest.status === 'active'));
  const points = calculatePoints(checks, quests);
  const recent = useMemo(
    () => [
      ...checks.map((check) => ({ id: check.id, label: 'Gewoonte afgevinkt', date: check.date })),
      ...quests.filter((quest) => quest.completedAt).map((quest) => ({
        id: quest.id,
        label: `Quest voltooid: ${quest.title}`,
        date: quest.completedAt!.slice(0, 10)
      }))
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [checks, quests]
  );

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader
        eyebrow="Kleine stappen tellen op"
        title="Jouw volgende quest."
        description="Werk aan doelen, bouw gewoontes op en vier voortgang die je zelf hebt vastgelegd."
        action={<StatusPill tone="good">{points} punten</StatusPill>}
      />
      <div className="grid grid-4">
        <Metric label="Actieve doelen" value={activeGoals.length.toString()} />
        <Metric label="Gewoontes vandaag" value={`${todayHabits.filter((habit) => checks.some((check) => check.habitId === habit.id && check.date === today)).length}/${todayHabits.length}`} />
        <Metric label="Actieve quests" value={activeQuests.length.toString()} />
        <Metric label="Huidige punten" value={points.toString()} />
      </div>
      <div className="grid grid-2">
        <Card title="Gewoontes voor vandaag" action={<Link className="text-button" to="/gewoontes">Beheer →</Link>}>
          {todayHabits.length ? (
            <div className="list">
              {todayHabits.slice(0, 5).map((habit) => {
                const done = checks.some((check) => check.habitId === habit.id && check.date === today);
                return (
                  <div className="list-item" key={habit.id}>
                    <div>
                      <p className="item-title">{habit.title}</p>
                      <p className="item-subtitle">{calculateHabitStreak(habit, checks, today)} {habit.frequency === 'daily' ? 'dagen' : 'weken'} streak</p>
                    </div>
                    <StatusPill tone={done ? 'good' : 'neutral'}>{done ? 'Gedaan' : 'Nog te doen'}</StatusPill>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Begin met een kleine gewoonte">Voeg een dagelijkse of wekelijkse gewoonte toe wanneer je er klaar voor bent.</EmptyState>
          )}
        </Card>
        <Card title="Actieve doelen" action={<Link className="text-button" to="/doelen">Bekijk doelen →</Link>}>
          {activeGoals.length ? (
            <div className="list">
              {activeGoals.slice(0, 4).map((goal) => (
                <div className="list-item" key={goal.id}>
                  <div style={{ flex: 1 }}>
                    <p className="item-title">{goal.title}</p>
                    <p className="item-subtitle">{goal.progress} van {goal.target} · deadline {formatDate(goal.targetDate)}</p>
                    <div className="progress-track" style={{ marginTop: 9 }}>
                      <span style={{ width: `${Math.min(100, (goal.progress / goal.target) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Geen actieve doelen">Je kunt een doel toevoegen en zelf bepalen hoe je voortgang meet.</EmptyState>
          )}
        </Card>
      </div>
      <div className="grid grid-2">
        <Card title="Actieve quests">
          {activeQuests.length ? (
            <div className="list">
              {activeQuests.slice(0, 4).map((quest) => (
                <div className="list-item" key={quest.id}>
                  <div style={{ flex: 1 }}>
                    <p className="item-title">{quest.title}</p>
                    <p className="item-subtitle">{quest.category ?? DEFAULT_QUEST_CATEGORY} · {quest.progress}/{quest.target} stappen · beloning {quest.rewardPoints} punten</p>
                  </div>
                  <DeadlinePill quest={quest} today={today} fallback={`${Math.round((quest.progress / quest.target) * 100)}%`} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Nog geen actieve quests">Maak een quest en bepaal zelf de stappen en puntenbeloning.</EmptyState>
          )}
        </Card>
        <Card title="Recente prestaties">
          {recent.length ? (
            <div className="list">
              {recent.map((item) => (
                <div className="list-item" key={item.id}>
                  <span className="item-title">{item.label}</span>
                  <span className="small muted">{formatDate(item.date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Jouw voortgang begint hier">Na je eerste gewoontecheck of afgeronde quest staat je prestatie hier.</EmptyState>
          )}
        </Card>
      </div>
      <div className="notice">Puntenregels: {HABIT_POINTS_PER_CHECK} punten per geregistreerde gewoontecheck, plus de vooraf ingestelde beloning bij een voltooide quest. Punten worden niet willekeurig gegenereerd.</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card className="metric"><p className="metric-label">{label}</p><p className="metric-value">{value}</p></Card>;
}

function GoalsPage({
  goals,
  onSave,
  onArchive,
  error
}: {
  goals: Goal[];
  onSave: (goal: Goal) => Promise<boolean>;
  onArchive: (goal: Goal) => Promise<boolean>;
  error: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const active = goals.filter((goal) => goal.status !== 'archived');
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Richting en voortgang" title="Doelen" description="Maak een doel, stel een deadline in en houd je voortgang zelf bij." action={<Button onClick={() => { setEditing(null); setShowForm(true); }}>＋ Nieuw doel</Button>} />
      {showForm && (
        <GoalForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSave={async (goal) => {
            const saved = await onSave(goal);
            if (saved) {
              setShowForm(false);
              setEditing(null);
            }
            return saved;
          }}
        />
      )}
      <Card title="Jouw doelen">
        {active.length ? (
          <div className="list">
            {active.map((goal) => (
              <div className="list-item" key={goal.id}>
                <div style={{ flex: 1 }}>
                  <div className="row"><p className="item-title">{goal.title}</p><StatusPill>{goal.category}</StatusPill></div>
                  <p className="item-subtitle">{goal.progress} van {goal.target} · deadline {formatDate(goal.targetDate)}</p>
                  <div className="progress-track" style={{ marginTop: 9 }}><span style={{ width: `${Math.min(100, (goal.progress / goal.target) * 100)}%` }} /></div>
                </div>
                <div className="row">
                  <Button variant="secondary" onClick={() => { setEditing(goal); setShowForm(true); }}>Bewerk</Button>
                  {goal.status === 'active' && goal.progress < goal.target && (
                    <Button onClick={() => void onSave({ ...goal, progress: Math.min(goal.target, goal.progress + 1), status: goal.progress + 1 >= goal.target ? 'completed' : 'active' })}>＋ Voortgang</Button>
                  )}
                  <ConfirmAction label={`Archiveer doel ${goal.title}`} confirmMessage={`Doel "${goal.title}" archiveren? Het blijft bewaard, maar is niet meer actief.`} onConfirm={() => void onArchive(goal)}>Archiveer</ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Kies een doel dat bij je past">Een doel is privé in SIDEQUEST en wordt niet gedeeld met Samen Thuis.</EmptyState>
        )}
      </Card>
      {goals.some((goal) => goal.status === 'archived') && (
        <Card title="Gearchiveerd">
          <div className="list">{goals.filter((goal) => goal.status === 'archived').map((goal) => <div className="list-item" key={goal.id}><span>{goal.title}</span><StatusPill>Gearchiveerd</StatusPill></div>)}</div>
        </Card>
      )}
    </div>
  );
}

function GoalForm({
  initial,
  onCancel,
  onSave
}: {
  initial: Goal | null;
  onCancel: () => void;
  onSave: (goal: Goal) => Promise<boolean>;
}) {
  const [id] = useState(() => initial?.id ?? newId());
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [targetDate, setTargetDate] = useState(initial?.targetDate ?? '');
  const [target, setTarget] = useState(initial?.target.toString() ?? '1');
  const [progress, setProgress] = useState(initial?.progress.toString() ?? '0');
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetValue = Number(target);
    const progressValue = Number(progress);
    try {
      validateProgress(progressValue, targetValue);
      if (!title.trim() || !category.trim() || !targetDate || targetDate < todayKey()) {
        throw new Error('Vul een titel, categorie en deadline vandaag of later in.');
      }
      if (!await onSave({
        id,
        title: title.trim().slice(0, 100),
        category: category.trim().slice(0, 60),
        targetDate,
        target: targetValue,
        progress: progressValue,
        status: progressValue >= targetValue ? 'completed' : 'active',
        createdAt: initial?.createdAt ?? new Date().toISOString()
      })) return;
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Controleer je doelgegevens.');
    }
  }

  return (
    <Card title={initial ? 'Doel aanpassen' : 'Nieuw doel'}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Doel"><input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <Field label="Categorie"><input maxLength={60} placeholder="Bijv. persoonlijk, leren, gezondheid" value={category} onChange={(event) => setCategory(event.target.value)} required /></Field>
          <Field label="Deadline"><input type="date" min={todayKey()} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} required /></Field>
          <Field label="Doelwaarde"><input type="number" min="1" step="1" value={target} onChange={(event) => setTarget(event.target.value)} required /></Field>
          <Field label="Huidige voortgang"><input type="number" min="0" step="1" value={progress} onChange={(event) => setProgress(event.target.value)} required /></Field>
        </div>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Annuleren</Button><Button type="submit">Doel opslaan</Button></div>
      </form>
    </Card>
  );
}

function HabitsPage({
  habits,
  checks,
  onSave,
  onArchive,
  onCheck,
  error
}: {
  habits: Habit[];
  checks: HabitCheck[];
  onSave: (habit: Habit) => Promise<boolean>;
  onArchive: (habit: Habit) => Promise<boolean>;
  onCheck: (habit: Habit) => Promise<boolean>;
  error: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const today = todayKey();
  const active = habits.filter((habit) => !habit.archived);
  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Elke stap telt" title="Gewoontes" description="Kies dagelijks of wekelijks. Een dag missen verlaagt je punten niet." action={<Button onClick={() => { setEditing(null); setShowForm(true); }}>＋ Gewoonte maken</Button>} />
      {showForm && <HabitForm initial={editing} onCancel={() => { setShowForm(false); setEditing(null); }} onSave={async (habit) => {
        const saved = await onSave(habit);
        if (saved) {
          setShowForm(false);
          setEditing(null);
        }
        return saved;
      }} />}
      <Card title="Actieve gewoontes">
        {active.length ? (
          <div className="list">
            {active.map((habit) => {
              const doneToday = checks.some((check) => check.habitId === habit.id && check.date === today);
              const count = currentPeriodChecks(habit, checks, today);
              const target = habit.frequency === 'daily' ? 1 : habit.weeklyTarget;
              return (
                <div className="list-item" key={habit.id}>
                  <div style={{ flex: 1 }}>
                    <div className="row"><p className="item-title">{habit.title}</p><StatusPill>{habit.frequency === 'daily' ? 'Dagelijks' : `${habit.weeklyTarget}× per week`}</StatusPill></div>
                    <p className="item-subtitle">{count}/{target} deze {habit.frequency === 'daily' ? 'dag' : 'week'} · streak {calculateHabitStreak(habit, checks, today)} {habit.frequency === 'daily' ? 'dagen' : 'weken'}</p>
                    <div className="progress-track" style={{ marginTop: 9 }}><span style={{ width: `${Math.min(100, (count / target) * 100)}%` }} /></div>
                  </div>
                  <div className="row">
                    <Button disabled={doneToday} onClick={() => void onCheck(habit)}>{doneToday ? 'Vandaag gedaan' : 'Vink vandaag af'}</Button>
                    <Button variant="secondary" onClick={() => { setEditing(habit); setShowForm(true); }}>Bewerk</Button>
                    <ConfirmAction label={`Pauzeer ${habit.title}`} confirmMessage={`Gewoonte "${habit.title}" archiveren? De historie blijft bewaard.`} onConfirm={() => void onArchive(habit)}>Pauzeer</ConfirmAction>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Maak ruimte voor een gewoonte">Je bepaalt zelf wat haalbaar is. Gemiste dagen kosten geen punten.</EmptyState>
        )}
      </Card>
      <Card title="Recente registraties">
        {checks.length ? (
          <div className="list">
            {checks.slice(0, 8).map((check) => <div className="list-item" key={check.id}><span>{habits.find((habit) => habit.id === check.habitId)?.title ?? 'Gearchiveerde gewoonte'}</span><span className="small muted">{formatDate(check.date)}</span></div>)}
          </div>
        ) : (
          <EmptyState title="Nog geen afgevinkte gewoontes">Als je een gewoonte afrondt, verschijnt de registratie hier.</EmptyState>
        )}
      </Card>
    </div>
  );
}

function HabitForm({
  initial,
  onCancel,
  onSave
}: {
  initial: Habit | null;
  onCancel: () => void;
  onSave: (habit: Habit) => Promise<boolean>;
}) {
  const [id] = useState(() => initial?.id ?? newId());
  const [title, setTitle] = useState(initial?.title ?? '');
  const [frequency, setFrequency] = useState<Habit['frequency']>(initial?.frequency ?? 'daily');
  const [weeklyTarget, setWeeklyTarget] = useState(initial?.weeklyTarget.toString() ?? '3');
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const count = Number(weeklyTarget);
    if (!title.trim() || !Number.isInteger(count) || count < 1 || count > 7) {
      setFormError('Vul een naam in en kies een weekdoel van 1 tot 7.');
      return;
    }
    if (!await onSave({
      id,
      title: title.trim().slice(0, 100),
      frequency,
      weeklyTarget: frequency === 'daily' ? 1 : count,
      archived: false,
      createdAt: initial?.createdAt ?? new Date().toISOString()
    })) return;
  }

  return (
    <Card title={initial ? 'Gewoonte aanpassen' : 'Nieuwe gewoonte'}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Gewoonte"><input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <Field label="Frequentie"><select value={frequency} onChange={(event) => setFrequency(event.target.value as Habit['frequency'])}><option value="daily">Dagelijks</option><option value="weekly">Wekelijks</option></select></Field>
          {frequency === 'weekly' && <Field label="Aantal keer per week"><input type="number" min="1" max="7" value={weeklyTarget} onChange={(event) => setWeeklyTarget(event.target.value)} /></Field>}
        </div>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Annuleren</Button><Button type="submit">Gewoonte opslaan</Button></div>
      </form>
    </Card>
  );
}

function DeadlinePill({ quest, today, fallback }: { quest: Quest; today: string; fallback?: string }) {
  const days = daysUntilDeadline(quest, today);
  if (days === null) return fallback ? <StatusPill>{fallback}</StatusPill> : null;
  if (days < 0) return <StatusPill tone="warning">{days === -1 ? '1 dag te laat' : `${-days} dagen te laat`}</StatusPill>;
  if (days === 0) return <StatusPill tone="warning">Deadline vandaag</StatusPill>;
  if (days === 1) return <StatusPill tone="warning">Deadline morgen</StatusPill>;
  return <StatusPill tone={days <= 3 ? 'warning' : 'neutral'}>Nog {days} dagen</StatusPill>;
}

function QuestsPage({
  quests,
  goalCategories,
  onSave,
  onProgress,
  onToggleStep,
  error
}: {
  quests: Quest[];
  goalCategories: string[];
  onSave: (quest: Quest) => Promise<boolean>;
  onProgress: (quest: Quest) => Promise<boolean>;
  onToggleStep: (quest: Quest, stepId: string) => Promise<boolean>;
  error: string;
}) {
  const today = todayKey();
  const [form, setForm] = useState<{ quest: Quest | null } | null>(null);
  const [filter, setFilter] = useState<string>('alle');
  const categories = useMemo(
    () => [...new Set(quests.map((quest) => quest.category ?? DEFAULT_QUEST_CATEGORY))].sort((a, b) => a.localeCompare(b, 'nl')),
    [quests]
  );
  const suggestions = useMemo(
    () => [...new Set([...QUEST_CATEGORIES, ...categories, ...goalCategories.map((category) => category.trim()).filter(Boolean)])],
    [categories, goalCategories]
  );
  const shown = quests.filter((quest) => filter === 'alle' || (quest.category ?? DEFAULT_QUEST_CATEGORY) === filter);
  const active = sortActiveQuests(shown.filter((quest) => quest.status === 'active'));
  const completed = shown.filter((quest) => quest.status === 'completed');

  return (
    <div className="stack">
      {error && <ErrorBanner message={error} />}
      <PageHeader eyebrow="Uitdagingen, op jouw tempo" title="Quests" description="Maak een uitdaging met een helder doel, eigen stappen en een transparante puntenbeloning." action={<Button onClick={() => setForm({ quest: null })}>＋ Quest maken</Button>} />
      {form && (
        <QuestForm
          key={form.quest?.id ?? 'nieuw'}
          initial={form.quest}
          categories={suggestions}
          onCancel={() => setForm(null)}
          onSave={async (quest) => {
            const saved = await onSave(quest);
            if (saved) setForm(null);
            return saved;
          }}
        />
      )}
      {categories.length > 1 && (
        <div className="chip-row" role="group" aria-label="Filter op categorie">
          {['alle', ...categories].map((category) => (
            <button key={category} type="button" className="chip chip-toggle" aria-pressed={filter === category} onClick={() => setFilter(category)}>
              {category === 'alle' ? 'Alle' : category}
            </button>
          ))}
        </div>
      )}
      <Card title="Actieve quests">
        {active.length ? (
          <div className="list">
            {active.map((quest) => {
              const steps = quest.steps ?? [];
              return (
                <div className="list-item quest-item" key={quest.id}>
                  <div style={{ flex: 1 }}>
                    <div className="quest-heading">
                      <p className="item-title">{quest.title}</p>
                      <StatusPill>{quest.category ?? DEFAULT_QUEST_CATEGORY}</StatusPill>
                      <DeadlinePill quest={quest} today={today} />
                    </div>
                    <p className="item-subtitle">
                      {quest.description || 'Geen aanvullende notitie'} · beloning {quest.rewardPoints} punten
                      {quest.deadline ? ` · deadline ${formatDate(quest.deadline)}` : ''}
                    </p>
                    <p className="item-subtitle">{quest.progress} van {quest.target} stappen</p>
                    <div className="progress-track" style={{ marginTop: 8 }}><span style={{ width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` }} /></div>
                    {steps.length > 0 && (
                      <ul className="quest-steps" aria-label={`Stappen van ${quest.title}`}>
                        {steps.map((step) => (
                          <li key={step.id}>
                            <label className={step.done ? 'quest-step done' : 'quest-step'}>
                              <input type="checkbox" checked={step.done} onChange={() => void onToggleStep(quest, step.id)} />
                              <span>{step.title}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="quest-actions">
                    {steps.length === 0 && <Button onClick={() => void onProgress(quest)}>Registreer stap</Button>}
                    <Button variant="secondary" aria-label={`${quest.title} bewerken`} onClick={() => setForm({ quest })}>Bewerken</Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title={filter === 'alle' ? 'Klaar voor een quest?' : `Geen actieve quests in ${filter}`}>Je kiest de stappen en stelt vooraf de beloning in. Geen willekeurige punten.</EmptyState>
        )}
      </Card>
      <Card title="Afgerond">
        {completed.length ? (
          <div className="list">{completed.map((quest) => <div className="list-item" key={quest.id}><div><p className="item-title">{quest.title}</p><p className="item-subtitle">{quest.category ?? DEFAULT_QUEST_CATEGORY} · +{quest.rewardPoints} punten · afgerond {quest.completedAt ? formatDate(quest.completedAt) : '—'}</p></div><StatusPill tone="good">Voltooid</StatusPill></div>)}</div>
        ) : (
          <EmptyState title="Nog geen afgeronde quests">Voltooide quests komen hier terecht.</EmptyState>
        )}
      </Card>
    </div>
  );
}

function QuestForm({
  initial,
  categories,
  onCancel,
  onSave
}: {
  initial: Quest | null;
  categories: string[];
  onCancel: () => void;
  onSave: (quest: Quest) => Promise<boolean>;
}) {
  const today = todayKey();
  const [id] = useState(() => initial?.id ?? newId());
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState(initial?.category ?? DEFAULT_QUEST_CATEGORY);
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [steps, setSteps] = useState<QuestStep[]>(initial?.steps ?? []);
  const [target, setTarget] = useState(String(initial?.target ?? 3));
  const [reward, setReward] = useState(String(initial?.rewardPoints ?? 20));
  const [formError, setFormError] = useState('');

  function updateStep(stepId: string, value: string) {
    setSteps((list) => list.map((step) => (step.id === stepId ? { ...step, title: value } : step)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const rewardPoints = Number(reward);
    const named = steps.map((step) => ({ ...step, title: step.title.trim() })).filter((step) => step.title);
    try {
      if (!title.trim()) throw new Error('Geef de quest een naam.');
      if (!Number.isInteger(rewardPoints) || rewardPoints < 0 || rewardPoints > 10000) throw new Error('Vul een beloning van 0 tot 10.000 punten in.');
      if (deadline && !initial && deadline < today) throw new Error('Kies een deadline vandaag of later.');
      if (deadline && initial && deadline !== initial.deadline && deadline < today) throw new Error('Kies een deadline vandaag of later.');
      if (named.length > MAX_QUEST_STEPS) throw new Error(`Gebruik maximaal ${MAX_QUEST_STEPS} stappen.`);
      const targetValue = Number(target);
      if (!named.length) {
        validateProgress(0, targetValue);
        if (!Number.isInteger(targetValue)) throw new Error('Vul een geheel aantal stappen in.');
      }
      const changes = {
        title: title.trim().slice(0, 100),
        description: description.trim().slice(0, 500),
        category: category.trim().slice(0, 40) || DEFAULT_QUEST_CATEGORY,
        deadline: deadline || null,
        rewardPoints,
        steps: named,
        target: named.length ? named.length : targetValue
      };
      const quest: Quest = initial
        ? editQuest(initial, changes)
        : {
            id,
            ...changes,
            progress: 0,
            status: 'active',
            completedAt: null,
            createdAt: new Date().toISOString()
          };
      validateQuest(quest);
      await onSave(quest);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Controleer de questgegevens.');
    }
  }

  return (
    <Card title={initial ? 'Quest bewerken' : 'Nieuwe quest'}>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="form-grid">
          <Field label="Naam"><input maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
          <Field label="Categorie"><input maxLength={40} list={`quest-categories-${id}`} value={category} onChange={(event) => setCategory(event.target.value)} /></Field>
          <Field label="Deadline (optioneel)"><input type="date" min={initial?.deadline && initial.deadline < today ? initial.deadline : today} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></Field>
          <Field label="Punten bij voltooien"><input type="number" min="0" max="10000" step="1" value={reward} onChange={(event) => setReward(event.target.value)} required /></Field>
          {steps.length === 0 && (
            <Field label="Aantal stappen" hint="Of benoem hieronder de stappen.">
              <input type="number" min="1" step="1" value={target} onChange={(event) => setTarget(event.target.value)} required />
            </Field>
          )}
          <Field label="Notitie (optioneel)"><input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        </div>
        <datalist id={`quest-categories-${id}`}>
          {categories.map((item) => <option key={item} value={item} />)}
        </datalist>
        <fieldset className="quest-step-editor">
          <legend>Stappen (optioneel)</legend>
          <p className="item-subtitle">Benoemde stappen vink je één voor één af. Zonder stappen houd je alleen een teller bij.</p>
          {steps.map((step, index) => (
            <div className="quest-step-row" key={step.id}>
              <input aria-label={`Stap ${index + 1}`} maxLength={100} value={step.title} onChange={(event) => updateStep(step.id, event.target.value)} />
              {step.done && <StatusPill tone="good">Gedaan</StatusPill>}
              <Button type="button" variant="secondary" aria-label={`Stap ${index + 1} verwijderen`} onClick={() => setSteps((list) => list.filter((item) => item.id !== step.id))}>×</Button>
            </div>
          ))}
          {steps.length < MAX_QUEST_STEPS && (
            <Button type="button" variant="secondary" onClick={() => setSteps((list) => [...list, { id: newId(), title: '', done: false }])}>＋ Stap toevoegen</Button>
          )}
        </fieldset>
        {formError && <ErrorBanner message={formError} />}
        <p className="item-subtitle">De beloning wordt alleen bij voltooiing eenmaal toegevoegd. Een voltooide quest ligt vast.</p>
        <div className="form-actions"><Button type="button" variant="secondary" onClick={onCancel}>Annuleren</Button><Button type="submit">Quest opslaan</Button></div>
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

  async function importData(file?: File) {
    if (!file) return;
    setRestoreError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Back-ups mogen maximaal 25 MB groot zijn.');
      const data = parseLocalBackup(await file.text());
      database.validateRestore(data);
      validateSidequestBackup(data);
      if (!window.confirm('Herstel vervangt alle bestaande SIDEQUEST-gegevens op dit apparaat. Je huidige gegevens worden overschreven. Doorgaan?')) return;
      await onRestore(data);
    } catch (cause) {
      setRestoreError(cause instanceof Error ? cause.message : 'Back-up kon niet worden hersteld.');
    }
  }

  return (
    <div className="stack">
      {(error || restoreError) && <ErrorBanner message={error || restoreError} />}
      <PageHeader eyebrow="Jij bepaalt" title="Instellingen" description="Je doelen, gewoontes en quests zijn alleen op dit apparaat opgeslagen." />
      <Card title="Lokale opslag">
        <div className="list">
          <div className="list-item"><span>Opslagmodus</span><StatusPill tone="good">Alleen lokaal</StatusPill></div>
          <div className="list-item"><span>Database</span><span className="small muted">SIDEQUEST · schema v{database.schemaVersion}</span></div>
          <div className="list-item"><span>Opgeslagen records</span><span>{storageSize ?? '…'}</span></div>
          <div className="list-item"><span>Synchronisatie</span><span className="small muted">Niet geconfigureerd</span></div>
        </div>
      </Card>
      <Card title="Back-up en herstel">
        <p className="item-subtitle">De export bevat alleen SIDEQUEST-gegevens. Herstel overschrijft bestaande SIDEQUEST-data pas nadat je dit bevestigt.</p>
        <div className="row" style={{ justifyContent: 'flex-start', marginTop: 16 }}>
          <Button onClick={async () => {
            try { downloadJson('sidequest-backup.json', await database.exportData()); }
            catch (cause) { setRestoreError(cause instanceof Error ? cause.message : 'Export mislukt.'); }
          }}>Download back-up</Button>
          <Field label="Herstel uit JSON"><input type="file" accept="application/json,.json" onChange={(event) => void importData(event.currentTarget.files?.[0])} /></Field>
        </div>
      </Card>
      <Card title="PWA en voortgang">
        <PwaInstallButton />
        <p className="item-subtitle">Offline worden alleen appbestanden gecachet; je persoonlijke gegevens blijven in de lokale database.</p>
        <p className="item-subtitle">Punten: 5 per gewoontecheck, plus de zelf ingestelde beloning per afgeronde quest. Een gewoontecheck kan per dag maar één keer worden geregistreerd.</p>
      </Card>
      <Link className="text-button" to="/">← Terug naar overzicht</Link>
    </div>
  );
}

export default App;
