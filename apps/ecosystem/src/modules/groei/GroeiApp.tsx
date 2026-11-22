import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { newId } from '@ecosystem/core';
import { openLocalDatabase, runStorageAction as performStorageAction, type LocalDatabase } from '@ecosystem/storage';
import { AppFrame, Button, Card, ConfirmAction, EmptyState, ErrorBanner, Field, LoadingState, PageHeader, StatusPill, type ModuleLink } from '@ecosystem/ui';
import {
  ACTION_STATUSES,
  EVALUATION_PERIODS,
  FIVE_STEPS,
  GOAL_STATUSES,
  GROWTH_SYSTEM_LABEL,
  checkId,
  filterGoals,
  findGoalCycle,
  formatEuros,
  goalOverview,
  habitStreak,
  habitWeek,
  isOverdue,
  parseEuros,
  sortActions,
  tenTenResult,
  validateAction,
  validateEvaluation,
  validateGoal,
  validateHabit,
  validateSettings,
  validateSkill,
  validateTenTen,
  withActionStatus,
  type Action,
  type ActionStatus,
  type Evaluation,
  type EvaluationPeriod,
  type Goal,
  type GoalStatus,
  type GrowthSettings,
  type Habit,
  type HabitCheck,
  type Skill,
  type SortKey,
  type TenTenMonth
} from './domain';
import { databaseConfig } from './storage';

const navigation = [
  { to: '/', label: 'Overzicht', icon: '⌂' },
  { to: '/doelen', label: 'Doelen', icon: '◎' },
  { to: '/acties', label: 'Acties', icon: '☑' },
  { to: '/gewoontes', label: 'Gewoontes', icon: '↻' },
  { to: '/vaardigheden', label: 'Vaardigheden', icon: '★' },
  { to: '/evaluaties', label: 'Evaluaties', icon: '✎' },
  { to: '/systeem', label: 'Groeisysteem', icon: '∞' }
];

const UNAVAILABLE = 'Niet meer beschikbaar';

interface Data {
  goals: Goal[];
  skills: Skill[];
  habits: Habit[];
  checks: HabitCheck[];
  actions: Action[];
  evaluations: Evaluation[];
  tenTen: TenTenMonth[];
  settings: GrowthSettings | null;
}

const empty: Data = { goals: [], skills: [], habits: [], checks: [], actions: [], evaluations: [], tenTen: [], settings: null };

type Run = (action: (db: LocalDatabase) => Promise<void>) => Promise<boolean>;

function todayKey(): string {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function nowIso(): string {
  return new Date().toISOString();
}

export default function GroeiApp({ links }: { links: ModuleLink[] }) {
  return (
    <BrowserRouter basename="/groei">
      <GroeiRoutes links={links} />
    </BrowserRouter>
  );
}

function GroeiRoutes({ links }: { links: ModuleLink[] }) {
  const [database, setDatabase] = useState<LocalDatabase | null>(null);
  const [data, setData] = useState<Data>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function refresh(db: LocalDatabase) {
    const [goals, skills, habits, checks, actions, evaluations, tenTen, settings] = await Promise.all([
      db.list<Goal>('goals'),
      db.list<Skill>('skills'),
      db.list<Habit>('habits'),
      db.list<HabitCheck>('habitChecks'),
      db.list<Action>('actions'),
      db.list<Evaluation>('evaluations'),
      db.list<TenTenMonth>('tenTen'),
      db.get<GrowthSettings>('settings', 'ugs')
    ]);
    setData({
      goals,
      skills: skills.sort((a, b) => a.title.localeCompare(b.title, 'nl-NL')),
      habits: habits.sort((a, b) => a.title.localeCompare(b.title, 'nl-NL')),
      checks,
      actions,
      evaluations: evaluations.sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
      tenTen: tenTen.sort((a, b) => b.id.localeCompare(a.id)),
      settings: settings ?? null
    });
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
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : 'Lokale gegevens konden niet worden geopend.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      opened?.close();
    };
  }, []);

  const run: Run = async (action) => {
    if (!database) {
      setError('Lokale opslag is niet beschikbaar.');
      return false;
    }
    return performStorageAction(() => action(database), () => refresh(database), setError, 'De wijziging kon niet worden opgeslagen.');
  };

  return (
    <AppFrame appName="Groei" appMark="◎" navigation={navigation} moduleLinks={links}>
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {error && <ErrorBanner message={error} />}
          <Routes>
            <Route path="/" element={<OverviewPage data={data} run={run} />} />
            <Route path="/doelen" element={<GoalsPage data={data} run={run} />} />
            <Route path="/doelen/:id" element={<GoalDetailPage data={data} run={run} />} />
            <Route path="/acties" element={<ActionsPage data={data} run={run} />} />
            <Route path="/gewoontes" element={<HabitsPage data={data} run={run} />} />
            <Route path="/vaardigheden" element={<SkillsPage data={data} run={run} />} />
            <Route path="/evaluaties" element={<EvaluationsPage data={data} run={run} />} />
            <Route path="/systeem" element={<SystemPage data={data} run={run} />} />
            <Route path="*" element={<OverviewPage data={data} run={run} />} />
          </Routes>
        </>
      )}
    </AppFrame>
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

function titleOf(list: readonly { id: string; title: string }[], id: string | null): string {
  if (!id) return '—';
  return list.find((item) => item.id === id)?.title ?? UNAVAILABLE;
}

function GoalRef({ goals, id }: { goals: Goal[]; id: string | null }) {
  if (!id) return <>—</>;
  const goal = goals.find((item) => item.id === id);
  return goal ? <Link to={`/doelen/${goal.id}`}>{goal.title}</Link> : <span className="item-subtitle">{UNAVAILABLE}</span>;
}

function toggleCheck(run: Run, habit: Habit, date: string, checked: boolean) {
  const id = checkId(habit.id, date);
  return run((db) => (checked ? db.remove('habitChecks', id) : db.put('habitChecks', { id, habitId: habit.id, date })));
}

// ——— Overzicht ———

function OverviewPage({ data, run }: { data: Data; run: Run }) {
  const today = todayKey();
  const active = data.goals.filter((goal) => goal.status === 'actief');
  const open = sortActions(data.actions.filter((action) => action.status !== 'klaar'), today);
  const overdue = open.filter((action) => isOverdue(action, today));
  const habits = data.habits.filter((habit) => !habit.archived);
  const doneToday = habits.filter((habit) => data.checks.some((check) => check.id === checkId(habit.id, today)));

  return (
    <div className="stack">
      <PageHeader eyebrow="Groei" title="Waar groei je naartoe?" description="Doelen, acties, gewoontes en evaluaties. Alles staat alleen op dit apparaat." action={<Link className="button button-primary" to="/doelen?nieuw=1">＋ Doel</Link>} />
      <div className="grid grid-4">
        <Metric label="Actieve doelen" value={String(active.length)} note={`${data.goals.length} in totaal`} />
        <Metric label="Open acties" value={String(open.length)} note={overdue.length ? `${overdue.length} te laat` : 'Niets te laat'} />
        <Metric label="Gewoontes vandaag" value={`${doneToday.length}/${habits.length}`} note="Afgevinkt" />
        <Metric label="Evaluaties" value={String(data.evaluations.length)} note={data.evaluations[0] ? `Laatste: ${formatDate(data.evaluations[0].periodStart)}` : 'Nog geen'} />
      </div>
      <div className="grid grid-2">
        <Card title="Gewoontes vandaag">
          {habits.length ? (
            <div className="list">
              {habits.map((habit) => {
                const checked = data.checks.some((check) => check.id === checkId(habit.id, today));
                const week = habitWeek(habit, data.checks, today);
                return (
                  <div className="list-item" key={habit.id}>
                    <label className="row" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                      <input type="checkbox" checked={checked} onChange={() => void toggleCheck(run, habit, today, checked)} aria-label={`${habit.title} vandaag afgevinkt`} />
                      <span className="item-title">{habit.title}</span>
                    </label>
                    <StatusPill tone={week.reached ? 'good' : 'neutral'}>{week.done}/{week.target} deze week</StatusPill>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState title="Nog geen gewoontes">Voeg een gewoonte toe onder Gewoontes.</EmptyState>
          )}
        </Card>
        <Card title="Volgende acties" action={<Link className="text-button" to="/acties">Alle acties</Link>}>
          {open.length ? (
            <div className="list">
              {open.slice(0, 6).map((action) => (
                <div className="list-item" key={action.id}>
                  <div>
                    <p className="item-title">{action.title}</p>
                    <p className="item-subtitle">{titleOf(data.goals, action.goalId)} · {formatDate(action.dueDate)}</p>
                  </div>
                  {isOverdue(action, today) ? <StatusPill tone="warning">Te laat</StatusPill> : <StatusPill>{action.status}</StatusPill>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Geen open acties">Een actie is een concrete stap richting een doel.</EmptyState>
          )}
        </Card>
      </div>
      <Card title="Actieve doelen">
        {active.length ? (
          <div className="list">
            {active.map((goal) => (
              <div className="list-item" key={goal.id}>
                <div>
                  <p className="item-title"><Link to={`/doelen/${goal.id}`}>{goal.title}</Link></p>
                  <p className="item-subtitle">{goal.area || 'Geen gebied'} · streefdatum {formatDate(goal.targetDate)}</p>
                </div>
                <progress max={100} value={goal.progress} aria-label={`Voortgang ${goal.title}`} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen actieve doelen">Begin met één doel dat je dit jaar wilt bereiken. Er worden geen voorbeeldgegevens getoond.</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ——— Doelen ———

interface GoalForm {
  title: string;
  description: string;
  parentId: string;
  area: string;
  status: GoalStatus;
  targetDate: string;
  measure: string;
  progress: string;
}

function goalForm(goal?: Goal, parentId = ''): GoalForm {
  return {
    title: goal?.title ?? '',
    description: goal?.description ?? '',
    parentId: goal?.parentId ?? parentId,
    area: goal?.area ?? '',
    status: goal?.status ?? 'actief',
    targetDate: goal?.targetDate ?? '',
    measure: goal?.measure ?? '',
    progress: String(goal?.progress ?? 0)
  };
}

function GoalEditor({ data, run, goal, parentId, onDone }: { data: Data; run: Run; goal?: Goal; parentId?: string; onDone: () => void }) {
  const [form, setForm] = useState<GoalForm>(() => goalForm(goal, parentId));
  const [formError, setFormError] = useState('');
  const set = <K extends keyof GoalForm>(key: K, value: GoalForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const parents = data.goals.filter((candidate) => candidate.id !== goal?.id);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const next: Goal = {
        ...(goal ?? {}),
        id: goal?.id ?? newId(),
        title: form.title.trim(),
        description: form.description.trim(),
        parentId: form.parentId || null,
        area: form.area.trim(),
        status: form.status,
        targetDate: form.targetDate || null,
        measure: form.measure.trim(),
        progress: Number(form.progress),
        createdAt: goal?.createdAt ?? now,
        updatedAt: now
      };
      validateGoal(next);
      if (findGoalCycle([...data.goals.filter((item) => item.id !== next.id), next])) throw new Error('Dit subdoel zou naar zichzelf terugverwijzen.');
      if (await run((db) => db.put('goals', next))) onDone();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Het doel bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={goal ? 'Doel aanpassen' : 'Nieuw doel'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <Field label="Titel">
          <input value={form.title} maxLength={200} onChange={(event) => set('title', event.target.value)} required />
        </Field>
        <div className="form-grid">
          <Field label="Levensgebied" hint="Bijvoorbeeld Gezondheid, Werk of Relaties">
            <input value={form.area} maxLength={200} onChange={(event) => set('area', event.target.value)} />
          </Field>
          <Field label="Subdoel van">
            <select value={form.parentId} onChange={(event) => set('parentId', event.target.value)}>
              <option value="">Geen (hoofddoel)</option>
              {parents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(event) => set('status', event.target.value as GoalStatus)}>
              {GOAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Streefdatum">
            <input type="date" value={form.targetDate} onChange={(event) => set('targetDate', event.target.value)} />
          </Field>
          <Field label="Voortgang (%)">
            <input type="number" min={0} max={100} step={1} value={form.progress} onChange={(event) => set('progress', event.target.value)} />
          </Field>
        </div>
        <Field label="Hoe meet je het?">
          <input value={form.measure} onChange={(event) => set('measure', event.target.value)} />
        </Field>
        <Field label="Omschrijving">
          <textarea value={form.description} onChange={(event) => set('description', event.target.value)} />
        </Field>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onDone}>Annuleren</Button>
          <Button type="submit">Doel opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

function GoalsPage({ data, run }: { data: Data; run: Run }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<GoalStatus | ''>('');
  const [area, setArea] = useState('');
  const [sort, setSort] = useState<SortKey>('gewijzigd');
  const areas = useMemo(() => [...new Set(data.goals.map((goal) => goal.area).filter(Boolean))].sort(), [data.goals]);
  const overview = new Map(goalOverview(data.goals, data.actions).map((item) => [item.goal.id, item]));
  const results = filterGoals(data.goals, { query, status, area, sort });
  const creating = params.get('nieuw') === '1';

  return (
    <div className="stack">
      <PageHeader eyebrow="Groei" title="Doelen" description="Hoofddoelen en subdoelen. Zoek, filter en sorteer." action={!creating && <Button onClick={() => setParams({ nieuw: '1' })}>＋ Doel</Button>} />
      {creating && <GoalEditor data={data} run={run} parentId={params.get('onder') ?? ''} onDone={() => setParams({})} />}
      <Card>
        <div className="form-grid">
          <Field label="Zoeken">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titel, omschrijving of meting" />
          </Field>
          <Field label="Filter op status">
            <select value={status} onChange={(event) => setStatus(event.target.value as GoalStatus | '')}>
              <option value="">Alle</option>
              {GOAL_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Filter op gebied">
            <select value={area} onChange={(event) => setArea(event.target.value)}>
              <option value="">Alle</option>
              {areas.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Sorteren">
            <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="gewijzigd">Laatst gewijzigd</option>
              <option value="titel">Titel</option>
              <option value="streefdatum">Streefdatum</option>
              <option value="voortgang">Voortgang</option>
            </select>
          </Field>
        </div>
      </Card>
      {results.length ? (
        <Card>
          <div className="list">
            {results.map((goal) => {
              const info = overview.get(goal.id);
              return (
                <div className="list-item" key={goal.id}>
                  <div>
                    <p className="item-title"><Link to={`/doelen/${goal.id}`}>{goal.title}</Link></p>
                    <p className="item-subtitle">
                      {goal.parentId ? <>Subdoel van {titleOf(data.goals, goal.parentId)} · </> : null}
                      {goal.area || 'Geen gebied'} · {goal.progress}% · {info?.actionsOpen ?? 0} open acties
                    </p>
                  </div>
                  <StatusPill tone={goal.status === 'behaald' ? 'good' : goal.status === 'actief' ? 'neutral' : 'warning'}>{goal.status}</StatusPill>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title={data.goals.length ? 'Niets gevonden' : 'Nog geen doelen'}>{data.goals.length ? 'Pas je zoekterm of filters aan.' : 'Voeg je eerste doel toe.'}</EmptyState>
        </Card>
      )}
    </div>
  );
}

function GoalDetailPage({ data, run }: { data: Data; run: Run }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const goal = data.goals.find((item) => item.id === id);
  if (!goal) {
    return (
      <Card>
        <EmptyState title={UNAVAILABLE}>Dit doel bestaat niet (meer). <Link to="/doelen">Terug naar doelen</Link></EmptyState>
      </Card>
    );
  }
  const today = todayKey();
  const subgoals = data.goals.filter((item) => item.parentId === goal.id);
  const actions = sortActions(data.actions.filter((action) => action.goalId === goal.id), today);
  const habits = data.habits.filter((habit) => habit.goalId === goal.id);
  const skills = data.skills.filter((skill) => skill.goalIds.includes(goal.id));
  const evaluations = data.evaluations.filter((evaluation) => evaluation.goalIds.includes(goal.id));

  return (
    <div className="stack">
      <PageHeader
        eyebrow={goal.parentId ? `Subdoel van ${titleOf(data.goals, goal.parentId)}` : 'Doel'}
        title={goal.title}
        {...(goal.description ? { description: goal.description } : {})}
        action={<Button variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? 'Sluiten' : 'Aanpassen'}</Button>}
      />
      {editing && <GoalEditor data={data} run={run} goal={goal} onDone={() => setEditing(false)} />}
      <div className="grid grid-4">
        <Metric label="Status" value={goal.status} note={goal.area || 'Geen gebied'} />
        <Metric label="Voortgang" value={`${goal.progress}%`} note={subgoals.length ? `Subdoelen gemiddeld ${Math.round(subgoals.reduce((s, g) => s + g.progress, 0) / subgoals.length)}%` : 'Zelf bijgehouden'} />
        <Metric label="Streefdatum" value={formatDate(goal.targetDate)} note={goal.measure || 'Geen meting'} />
        <Metric label="Acties" value={`${actions.filter((a) => a.status === 'klaar').length}/${actions.length}`} note="Afgerond" />
      </div>
      <div className="grid grid-2">
        <RelatedList title="Subdoelen" empty="Geen subdoelen." add={<Link className="text-button" to={`/doelen?nieuw=1&onder=${goal.id}`}>＋ Subdoel</Link>}>
          {subgoals.map((item) => <RelatedRow key={item.id} title={<Link to={`/doelen/${item.id}`}>{item.title}</Link>} note={`${item.progress}% · ${item.status}`} />)}
        </RelatedList>
        <RelatedList title="Acties" empty="Geen acties bij dit doel." add={<Link className="text-button" to={`/acties?nieuw=1&doel=${goal.id}`}>＋ Actie</Link>}>
          {actions.map((item) => <RelatedRow key={item.id} title={item.title} note={`${item.status} · ${formatDate(item.dueDate)}`} />)}
        </RelatedList>
        <RelatedList title="Gewoontes" empty="Geen gewoontes bij dit doel.">
          {habits.map((item) => <RelatedRow key={item.id} title={item.title} note={`${habitWeek(item, data.checks, today).done}/${item.weeklyTarget} deze week`} />)}
        </RelatedList>
        <RelatedList title="Vaardigheden" empty="Geen vaardigheden bij dit doel.">
          {skills.map((item) => <RelatedRow key={item.id} title={item.title} note={`Niveau ${item.level}/10, doel ${item.targetLevel}`} />)}
        </RelatedList>
        <RelatedList title="Evaluaties" empty="Geen evaluaties bij dit doel.">
          {evaluations.map((item) => <RelatedRow key={item.id} title={`${item.period} vanaf ${formatDate(item.periodStart)}`} note={item.score ? `Score ${item.score}/10` : 'Geen score'} />)}
        </RelatedList>
      </div>
      <Card>
        {subgoals.length ? (
          <p className="item-subtitle">Dit doel heeft subdoelen. Verplaats of verwijder die eerst voordat je dit doel verwijdert.</p>
        ) : (
          <ConfirmAction
            label={`Doel ${goal.title} verwijderen`}
            confirmMessage="Dit doel verwijderen? Acties, gewoontes en evaluaties blijven bestaan en tonen het doel daarna als 'Niet meer beschikbaar'. Dit kan niet ongedaan worden gemaakt."
            onConfirm={() => void run((db) => db.remove('goals', goal.id)).then((ok) => ok && navigate('/doelen'))}
          >
            Doel verwijderen
          </ConfirmAction>
        )}
      </Card>
    </div>
  );
}

function RelatedList({ title, empty: emptyText, add, children }: { title: string; empty: string; add?: ReactNode; children: ReactNode[] }) {
  return (
    <Card title={title} {...(add ? { action: add } : {})}>
      {children.length ? <div className="list">{children}</div> : <p className="item-subtitle">{emptyText}</p>}
    </Card>
  );
}

function RelatedRow({ title, note }: { title: ReactNode; note: string }) {
  return (
    <div className="list-item">
      <p className="item-title">{title}</p>
      <p className="item-subtitle">{note}</p>
    </div>
  );
}

// ——— Acties ———

function ActionEditor({ data, run, action, goalId, onDone }: { data: Data; run: Run; action?: Action; goalId?: string; onDone: () => void }) {
  const [title, setTitle] = useState(action?.title ?? '');
  const [notes, setNotes] = useState(action?.notes ?? '');
  const [goal, setGoal] = useState(action?.goalId ?? goalId ?? '');
  const [skill, setSkill] = useState(action?.skillId ?? '');
  const [dueDate, setDueDate] = useState(action?.dueDate ?? '');
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const next: Action = {
        ...(action ?? {}),
        id: action?.id ?? newId(),
        title: title.trim(),
        notes: notes.trim(),
        status: action?.status ?? 'open',
        goalId: goal || null,
        skillId: skill || null,
        dueDate: dueDate || null,
        doneAt: action?.doneAt ?? null,
        createdAt: action?.createdAt ?? now,
        updatedAt: now
      };
      validateAction(next);
      if (await run((db) => db.put('actions', next))) onDone();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De actie bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={action ? 'Actie aanpassen' : 'Nieuwe actie'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <Field label="Actie">
          <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} required />
        </Field>
        <div className="form-grid">
          <Field label="Doel">
            <select value={goal} onChange={(event) => setGoal(event.target.value)}>
              <option value="">Geen</option>
              {data.goals.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </Field>
          <Field label="Vaardigheid">
            <select value={skill} onChange={(event) => setSkill(event.target.value)}>
              <option value="">Geen</option>
              {data.skills.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </Field>
          <Field label="Streefdatum">
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>
        <Field label="Notities">
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onDone}>Annuleren</Button>
          <Button type="submit">Actie opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

function ActionsPage({ data, run }: { data: Data; run: Run }) {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'open' | 'klaar' | 'alle'>('open');
  const [query, setQuery] = useState('');
  const today = todayKey();
  const editing = data.actions.find((action) => action.id === params.get('bewerk'));
  const needle = query.trim().toLocaleLowerCase('nl-NL');
  const list = sortActions(
    data.actions.filter((action) => (filter === 'alle' ? true : filter === 'klaar' ? action.status === 'klaar' : action.status !== 'klaar')).filter((action) => !needle || `${action.title} ${action.notes}`.toLocaleLowerCase('nl-NL').includes(needle)),
    today
  );

  function setStatus(action: Action, status: ActionStatus) {
    const next = withActionStatus(action, status, today);
    return run((db) => db.put('actions', next));
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Groei" title="Acties" description="Concrete stappen richting je doelen." action={!params.get('nieuw') && !editing && <Button onClick={() => setParams({ nieuw: '1' })}>＋ Actie</Button>} />
      {(params.get('nieuw') === '1' || editing) && <ActionEditor key={editing?.id ?? 'nieuw'} data={data} run={run} {...(editing ? { action: editing } : {})} goalId={params.get('doel') ?? ''} onDone={() => setParams({})} />}
      <Card>
        <div className="form-grid">
          <Field label="Zoeken">
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          </Field>
          <Field label="Tonen">
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="open">Open</option>
              <option value="klaar">Afgerond</option>
              <option value="alle">Alle</option>
            </select>
          </Field>
        </div>
      </Card>
      {list.length ? (
        <Card>
          <div className="list">
            {list.map((action) => (
              <div className="list-item" key={action.id}>
                <div>
                  <p className="item-title">{action.title}</p>
                  <p className="item-subtitle">
                    <GoalRef goals={data.goals} id={action.goalId} /> · {action.skillId ? titleOf(data.skills, action.skillId) : 'geen vaardigheid'} · {formatDate(action.dueDate)}
                    {isOverdue(action, today) && <> · <strong>te laat</strong></>}
                  </p>
                </div>
                <div className="row">
                  <select value={action.status} aria-label={`Status van ${action.title}`} onChange={(event) => void setStatus(action, event.target.value as ActionStatus)}>
                    {ACTION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <button type="button" className="text-button" onClick={() => setParams({ bewerk: action.id })}>Aanpassen</button>
                  <ConfirmAction label={`Actie ${action.title} verwijderen`} confirmMessage="Deze actie verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={() => void run((db) => db.remove('actions', action.id))}>
                    Verwijderen
                  </ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState title="Geen acties">Voeg een actie toe, eventueel bij een doel.</EmptyState>
        </Card>
      )}
    </div>
  );
}

// ——— Gewoontes ———

function HabitsPage({ data, run }: { data: Data; run: Run }) {
  const today = todayKey();
  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState<'dagelijks' | 'wekelijks'>('dagelijks');
  const [weeklyTarget, setWeeklyTarget] = useState('3');
  const [goalId, setGoalId] = useState('');
  const [formError, setFormError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const habit: Habit = { id: newId(), title: title.trim(), frequency, weeklyTarget: frequency === 'dagelijks' ? 7 : Number(weeklyTarget), goalId: goalId || null, archived: false, createdAt: now, updatedAt: now };
      validateHabit(habit);
      if (await run((db) => db.put('habits', habit))) {
        setTitle('');
        setGoalId('');
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De gewoonte bevat ongeldige gegevens.');
    }
  }

  const list = data.habits.filter((habit) => habit.archived === showArchived);

  return (
    <div className="stack">
      <PageHeader eyebrow="Groei" title="Gewoontes" description="Vink af wat je vandaag deed. Groei is eigenaar van gewoontes (K-A)." />
      <Card title="Nieuwe gewoonte">
        <form className="stack" noValidate onSubmit={(event) => void add(event)}>
          <div className="form-grid">
            <Field label="Gewoonte">
              <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} required />
            </Field>
            <Field label="Hoe vaak">
              <select value={frequency} onChange={(event) => setFrequency(event.target.value as 'dagelijks' | 'wekelijks')}>
                <option value="dagelijks">Dagelijks</option>
                <option value="wekelijks">Aantal keer per week</option>
              </select>
            </Field>
            {frequency === 'wekelijks' && (
              <Field label="Keer per week">
                <input type="number" min={1} max={7} value={weeklyTarget} onChange={(event) => setWeeklyTarget(event.target.value)} />
              </Field>
            )}
            <Field label="Doel">
              <select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
                <option value="">Geen</option>
                {data.goals.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </Field>
          </div>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="submit">Gewoonte toevoegen</Button>
          </div>
        </form>
      </Card>
      <Card title={showArchived ? 'Gearchiveerd' : 'Actief'} action={<button type="button" className="text-button" onClick={() => setShowArchived((value) => !value)}>{showArchived ? 'Toon actieve' : 'Toon gearchiveerde'}</button>}>
        {list.length ? (
          <div className="list">
            {list.map((habit) => {
              const checked = data.checks.some((check) => check.id === checkId(habit.id, today));
              const week = habitWeek(habit, data.checks, today);
              return (
                <div className="list-item" key={habit.id}>
                  <div>
                    <p className="item-title">{habit.title}</p>
                    <p className="item-subtitle">
                      {week.done}/{week.target} deze week · reeks {habitStreak(habit.id, data.checks, today)} dagen · <GoalRef goals={data.goals} id={habit.goalId} />
                    </p>
                  </div>
                  <div className="row">
                    {!habit.archived && (
                      <Button variant={checked ? 'secondary' : 'primary'} onClick={() => void toggleCheck(run, habit, today, checked)} aria-pressed={checked}>
                        {checked ? '✓ Vandaag gedaan' : 'Vandaag afvinken'}
                      </Button>
                    )}
                    <button type="button" className="text-button" onClick={() => void run((db) => db.put('habits', { ...habit, archived: !habit.archived, updatedAt: nowIso() }))}>
                      {habit.archived ? 'Terugzetten' : 'Archiveren'}
                    </button>
                    <ConfirmAction label={`Gewoonte ${habit.title} verwijderen`} confirmMessage="Deze gewoonte verwijderen? De afvinkingen blijven in je back-up staan maar zijn niet meer zichtbaar. Archiveren bewaart alles." onConfirm={() => void run((db) => db.remove('habits', habit.id))}>
                      Verwijderen
                    </ConfirmAction>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Geen gewoontes">{showArchived ? 'Er zijn geen gearchiveerde gewoontes.' : 'Voeg hierboven een gewoonte toe.'}</EmptyState>
        )}
      </Card>
    </div>
  );
}

// ——— Vaardigheden ———

function SkillsPage({ data, run }: { data: Data; run: Run }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = data.skills.find((skill) => skill.id === editingId);

  return (
    <div className="stack">
      <PageHeader eyebrow="Groei" title="Vaardigheden" description="Wat ontwikkel je, hoe goed ben je nu en waar wil je naartoe?" />
      <SkillEditor key={editing?.id ?? 'nieuw'} data={data} run={run} {...(editing ? { skill: editing } : {})} onDone={() => setEditingId(null)} />
      <Card>
        {data.skills.length ? (
          <div className="list">
            {data.skills.map((skill) => (
              <div className="list-item" key={skill.id}>
                <div>
                  <p className="item-title">{skill.title}</p>
                  <p className="item-subtitle">
                    Niveau {skill.level}/10 → {skill.targetLevel}/10 · {skill.goalIds.length ? skill.goalIds.map((id) => titleOf(data.goals, id)).join(', ') : 'geen doel'}
                  </p>
                </div>
                <div className="row">
                  <progress max={10} value={skill.level} aria-label={`Niveau ${skill.title}`} />
                  <button type="button" className="text-button" onClick={() => setEditingId(skill.id)}>Aanpassen</button>
                  <ConfirmAction label={`Vaardigheid ${skill.title} verwijderen`} confirmMessage="Deze vaardigheid verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={() => void run((db) => db.remove('skills', skill.id))}>
                    Verwijderen
                  </ConfirmAction>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nog geen vaardigheden">Voeg een vaardigheid toe die je wilt ontwikkelen.</EmptyState>
        )}
      </Card>
    </div>
  );
}

function SkillEditor({ data, run, skill, onDone }: { data: Data; run: Run; skill?: Skill; onDone: () => void }) {
  const [title, setTitle] = useState(skill?.title ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [level, setLevel] = useState(String(skill?.level ?? 1));
  const [targetLevel, setTargetLevel] = useState(String(skill?.targetLevel ?? 5));
  const [goalIds, setGoalIds] = useState<string[]>(skill?.goalIds ?? []);
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const next: Skill = { ...(skill ?? {}), id: skill?.id ?? newId(), title: title.trim(), description: description.trim(), level: Number(level), targetLevel: Number(targetLevel), goalIds, createdAt: skill?.createdAt ?? now, updatedAt: now };
      validateSkill(next);
      if (await run((db) => db.put('skills', next))) {
        setTitle('');
        setDescription('');
        setGoalIds([]);
        onDone();
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De vaardigheid bevat ongeldige gegevens.');
    }
  }

  return (
    <Card title={skill ? 'Vaardigheid aanpassen' : 'Nieuwe vaardigheid'}>
      <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <Field label="Vaardigheid">
            <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
          <Field label="Huidig niveau (1–10)">
            <input type="number" min={1} max={10} value={level} onChange={(event) => setLevel(event.target.value)} />
          </Field>
          <Field label="Gewenst niveau (1–10)">
            <input type="number" min={1} max={10} value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)} />
          </Field>
        </div>
        <Field label="Omschrijving">
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {data.goals.length > 0 && (
          <fieldset className="plain-fieldset">
            <legend>Hoort bij doelen</legend>
            <div className="chip-row">
              {data.goals.map((goal) => (
                <button key={goal.id} type="button" className="chip chip-toggle" aria-pressed={goalIds.includes(goal.id)} onClick={() => setGoalIds((current) => (current.includes(goal.id) ? current.filter((id) => id !== goal.id) : [...current, goal.id]))}>
                  {goal.title}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {formError && <ErrorBanner message={formError} />}
        <div className="form-actions">
          {skill && <Button type="button" variant="secondary" onClick={onDone}>Annuleren</Button>}
          <Button type="submit">Vaardigheid opslaan</Button>
        </div>
      </form>
    </Card>
  );
}

// ——— Evaluaties ———

function EvaluationsPage({ data, run }: { data: Data; run: Run }) {
  const [period, setPeriod] = useState<EvaluationPeriod>('week');
  const [periodStart, setPeriodStart] = useState(todayKey());
  const [wentWell, setWentWell] = useState('');
  const [toImprove, setToImprove] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [score, setScore] = useState('');
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [formError, setFormError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const now = nowIso();
      const evaluation: Evaluation = { id: newId(), period, periodStart, wentWell: wentWell.trim(), toImprove: toImprove.trim(), nextSteps: nextSteps.trim(), score: score ? Number(score) : null, goalIds, createdAt: now, updatedAt: now };
      validateEvaluation(evaluation);
      if (await run((db) => db.put('evaluations', evaluation))) {
        setWentWell('');
        setToImprove('');
        setNextSteps('');
        setScore('');
        setGoalIds([]);
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'De evaluatie bevat ongeldige gegevens.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Groei" title="Evaluaties" description="Kijk terug per week, maand, kwartaal of jaar." />
      <Card title="Nieuwe evaluatie">
        <form className="stack" noValidate onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <Field label="Periode">
              <select value={period} onChange={(event) => setPeriod(event.target.value as EvaluationPeriod)}>
                {EVALUATION_PERIODS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Begint op">
              <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            </Field>
            <Field label="Score (1–10)">
              <input type="number" min={1} max={10} value={score} onChange={(event) => setScore(event.target.value)} />
            </Field>
          </div>
          <Field label="Wat ging goed?">
            <textarea value={wentWell} onChange={(event) => setWentWell(event.target.value)} />
          </Field>
          <Field label="Wat kan beter?">
            <textarea value={toImprove} onChange={(event) => setToImprove(event.target.value)} />
          </Field>
          <Field label="Volgende stappen">
            <textarea value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} />
          </Field>
          {data.goals.length > 0 && (
            <fieldset className="plain-fieldset">
              <legend>Over doelen</legend>
              <div className="chip-row">
                {data.goals.map((goal) => (
                  <button key={goal.id} type="button" className="chip chip-toggle" aria-pressed={goalIds.includes(goal.id)} onClick={() => setGoalIds((current) => (current.includes(goal.id) ? current.filter((id) => id !== goal.id) : [...current, goal.id]))}>
                    {goal.title}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="submit">Evaluatie opslaan</Button>
          </div>
        </form>
      </Card>
      {data.evaluations.length ? (
        data.evaluations.map((evaluation) => (
          <Card key={evaluation.id} title={`${evaluation.period} vanaf ${formatDate(evaluation.periodStart)}`} action={evaluation.score ? <StatusPill>{evaluation.score}/10</StatusPill> : undefined}>
            {evaluation.wentWell && <p><strong>Ging goed:</strong> {evaluation.wentWell}</p>}
            {evaluation.toImprove && <p><strong>Kan beter:</strong> {evaluation.toImprove}</p>}
            {evaluation.nextSteps && <p><strong>Volgende stappen:</strong> {evaluation.nextSteps}</p>}
            {evaluation.goalIds.length > 0 && <p className="item-subtitle">Doelen: {evaluation.goalIds.map((id) => titleOf(data.goals, id)).join(', ')}</p>}
            <ConfirmAction label="Evaluatie verwijderen" confirmMessage="Deze evaluatie verwijderen? Dit kan niet ongedaan worden gemaakt." onConfirm={() => void run((db) => db.remove('evaluations', evaluation.id))}>
              Verwijderen
            </ConfirmAction>
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState title="Nog geen evaluaties">Je eerste evaluatie verschijnt hier.</EmptyState>
        </Card>
      )}
    </div>
  );
}

// ——— Groeisysteem en 10/10 ———

function SystemPage({ data, run }: { data: Data; run: Run }) {
  const [meaning, setMeaning] = useState(data.settings?.meaning35 ?? '');
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const existing = data.tenTen.find((item) => item.id === month);
  const [income, setIncome] = useState('');
  const [others, setOthers] = useState('');
  const [development, setDevelopment] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    setIncome(existing ? (existing.incomeCents / 100).toFixed(2).replace('.', ',') : '');
    setOthers(existing ? (existing.othersCents / 100).toFixed(2).replace('.', ',') : '');
    setDevelopment(existing ? (existing.developmentCents / 100).toFixed(2).replace('.', ',') : '');
    setNote(existing?.note ?? '');
  }, [existing, month]);

  async function saveMeaning(event: FormEvent) {
    event.preventDefault();
    setSaved('');
    const settings: GrowthSettings = { id: 'ugs', meaning35: meaning, updatedAt: nowIso() };
    validateSettings(settings);
    if (await run((db) => db.put('settings', settings))) setSaved('Betekenis opgeslagen.');
  }

  async function saveMonth(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    try {
      const record: TenTenMonth = { id: month, incomeCents: parseEuros(income), othersCents: parseEuros(others), developmentCents: parseEuros(development), note: note.trim(), updatedAt: nowIso() };
      validateTenTen(record);
      await run((db) => db.put('tenTen', record));
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Ongeldige bedragen.');
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Groei" title="Groeisysteem" description="The Ultimate Growth System en de 10/10-regel." />
      <Card title="The Ultimate Growth System">
        <p className="metric-value">{GROWTH_SYSTEM_LABEL}</p>
        <h3>De vijf stappen</h3>
        <ol>
          {FIVE_STEPS.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <form className="stack" onSubmit={(event) => void saveMeaning(event)}>
          <Field label="Betekenis van 35" hint="Je eigen omschrijving. Er staat bewust geen uitleg vooraf ingevuld.">
            <textarea value={meaning} onChange={(event) => setMeaning(event.target.value)} />
          </Field>
          {saved && <p role="status" className="item-subtitle">{saved}</p>}
          <div className="form-actions">
            <Button type="submit">Betekenis opslaan</Button>
          </div>
        </form>
      </Card>
      <Card title="10/10-regel">
        <p className="item-subtitle">10 % van je inkomen voor anderen helpen, 10 % voor persoonlijke ontwikkeling. Dit staat los van Financiën.</p>
        <form className="stack" noValidate onSubmit={(event) => void saveMonth(event)}>
          <div className="form-grid">
            <Field label="Maand">
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </Field>
            <Field label="Inkomen (€)">
              <input inputMode="decimal" value={income} onChange={(event) => setIncome(event.target.value)} />
            </Field>
            <Field label="Anderen helpen (€)">
              <input inputMode="decimal" value={others} onChange={(event) => setOthers(event.target.value)} />
            </Field>
            <Field label="Ontwikkeling (€)">
              <input inputMode="decimal" value={development} onChange={(event) => setDevelopment(event.target.value)} />
            </Field>
          </div>
          <Field label="Notitie">
            <input value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {formError && <ErrorBanner message={formError} />}
          <div className="form-actions">
            <Button type="submit">Maand opslaan</Button>
          </div>
        </form>
        {data.tenTen.length > 0 && (
          <table className="data-table">
            <caption className="sr-only">10/10 per maand</caption>
            <thead>
              <tr>
                <th scope="col">Maand</th>
                <th scope="col">Inkomen</th>
                <th scope="col">Anderen</th>
                <th scope="col">Ontwikkeling</th>
              </tr>
            </thead>
            <tbody>
              {data.tenTen.map((item) => {
                const result = tenTenResult(item);
                return (
                  <tr key={item.id}>
                    <th scope="row">{item.id}</th>
                    <td>{formatEuros(item.incomeCents)}</td>
                    <td>{formatEuros(item.othersCents)} {result.othersPct !== null && <StatusPill tone={result.othersReached ? 'good' : 'warning'}>{result.othersPct.toLocaleString('nl-NL')}%</StatusPill>}</td>
                    <td>{formatEuros(item.developmentCents)} {result.developmentPct !== null && <StatusPill tone={result.developmentReached ? 'good' : 'warning'}>{result.developmentPct.toLocaleString('nl-NL')}%</StatusPill>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
