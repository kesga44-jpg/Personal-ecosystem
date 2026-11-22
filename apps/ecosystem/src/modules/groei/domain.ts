/**
 * Groei (ADR 0023 § 2–4, ADR 0027 § 4): doelen en subdoelen, vaardigheden, gewoontes, acties, evaluaties,
 * The Ultimate Growth System en de 10/10-regel.
 *
 * Relaties binnen de database `personal-ecosystem-groei` zijn ID-velden (ADR 0024 § 6). Een verwijzing naar
 * een record dat niet meer bestaat, wordt getoond als "Niet meer beschikbaar" en nooit automatisch gewist.
 */
import { toLookupItems, type EcosystemRecordKind, type ImportOrigin, type LookupItem } from '@ecosystem/core';

export const GOAL_STATUSES = ['actief', 'gepauzeerd', 'behaald', 'losgelaten'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const ACTION_STATUSES = ['open', 'bezig', 'klaar'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const HABIT_FREQUENCIES = ['dagelijks', 'wekelijks'] as const;
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number];
export const EVALUATION_PERIODS = ['week', 'maand', 'kwartaal', 'jaar'] as const;
export type EvaluationPeriod = (typeof EVALUATION_PERIODS)[number];

/** Letterlijk uit The Ultimate Growth System; niet vereenvoudigen (ADR 0023 § 4). */
export const GROWTH_SYSTEM_LABEL = '1-1-5-3-1-35-30-5-10-10';
export const FIVE_STEPS = ['Study the material', 'Extract 3 best ideas', 'Act and implement', 'Measure improvement (30 days)', 'Review and adjust'] as const;

interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Alleen bij records uit een import (ADR 0025 § 3). */
  origin?: ImportOrigin;
}

export interface Goal extends Base {
  title: string;
  description: string;
  /** Subdoel van een ander doel, of null. */
  parentId: string | null;
  area: string;
  status: GoalStatus;
  targetDate: string | null;
  /** Hoe je meet dat het doel is bereikt (vrije tekst). */
  measure: string;
  /** Voortgang 0–100 %. */
  progress: number;
}

export interface Skill extends Base {
  title: string;
  description: string;
  /** Huidig niveau 1–10. */
  level: number;
  targetLevel: number;
  goalIds: string[];
}

export interface Habit extends Base {
  title: string;
  frequency: HabitFrequency;
  /** Bij wekelijks: aantal keer per week (1–7). Bij dagelijks altijd 7. */
  weeklyTarget: number;
  goalId: string | null;
  archived: boolean;
}

export interface HabitCheck {
  /** `${habitId}:${date}`: één afvinking per gewoonte per dag. */
  id: string;
  habitId: string;
  date: string;
}

export interface Action extends Base {
  title: string;
  notes: string;
  status: ActionStatus;
  goalId: string | null;
  skillId: string | null;
  dueDate: string | null;
  doneAt: string | null;
  /** Inzicht in Kennis waaruit deze actie is ontstaan (ID-veld, ADR 0024 § 6). Ontbreekt bij oudere records. */
  insightId?: string | null;
}

export interface Evaluation extends Base {
  period: EvaluationPeriod;
  periodStart: string;
  wentWell: string;
  toImprove: string;
  nextSteps: string;
  /** 1–10 of null. */
  score: number | null;
  goalIds: string[];
}

/** 10/10-regel per maand (ADR 0027 § 4). Bedragen in centen. */
export interface TenTenMonth {
  /** `YYYY-MM`. */
  id: string;
  incomeCents: number;
  othersCents: number;
  developmentCents: number;
  note: string;
  updatedAt: string;
}

export interface GrowthSettings {
  id: 'ugs';
  /** Vrij tekstveld "Betekenis" voor het onderdeel 35, zonder vooraf ingevulde uitleg. */
  meaning35: string;
  updatedAt: string;
}

export const TITLE_MAX = 200;
export const TEXT_MAX = 5000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function fail(message: string): never {
  throw new Error(message);
}

function obj(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Ongeldig ${what}.`);
  return value as Record<string, unknown>;
}

function title(value: unknown, what: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > TITLE_MAX) fail(`${what}: geef een titel van maximaal ${TITLE_MAX} tekens.`);
}

function text(value: unknown, what: string): void {
  if (typeof value !== 'string' || value.length > TEXT_MAX) fail(`${what}: tekst is te lang (maximaal ${TEXT_MAX} tekens).`);
}

function oneOf<T extends string>(value: unknown, list: readonly T[], what: string): void {
  if (typeof value !== 'string' || !(list as readonly string[]).includes(value)) fail(`${what}: ongeldige waarde.`);
}

function optionalId(value: unknown, what: string): void {
  if (!(value === null || (typeof value === 'string' && value.length > 0))) fail(`${what}: ongeldige verwijzing.`);
}

function idList(value: unknown, what: string): void {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.length > 0) || new Set(value).size !== value.length) {
    fail(`${what}: ongeldige lijst met verwijzingen.`);
  }
}

function base(record: Record<string, unknown>, what: string): void {
  if (typeof record.id !== 'string' || !record.id) fail(`${what}: ontbrekende ID.`);
  for (const key of ['createdAt', 'updatedAt'] as const) {
    if (typeof record[key] !== 'string' || !Number.isFinite(Date.parse(record[key] as string))) fail(`${what}: ongeldig tijdstip.`);
  }
  if (record.origin !== undefined) obj(record.origin, `${what}: herkomst`);
}

function intIn(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function optionalDate(value: unknown, what: string): void {
  if (!(value === null || isDateKey(value))) fail(`${what}: ongeldige datum.`);
}

export function validateGoal(value: unknown): asserts value is Goal {
  const r = obj(value, 'doel');
  base(r, 'Doel');
  title(r.title, 'Doel');
  text(r.description, 'Doel');
  text(r.measure, 'Doel');
  if (typeof r.area !== 'string' || r.area.length > TITLE_MAX) fail('Doel: ongeldig levensgebied.');
  optionalId(r.parentId, 'Doel');
  if (r.parentId === r.id) fail('Doel: een doel kan geen subdoel van zichzelf zijn.');
  oneOf(r.status, GOAL_STATUSES, 'Doel');
  optionalDate(r.targetDate, 'Doel');
  if (!intIn(r.progress, 0, 100)) fail('Doel: voortgang is een geheel getal van 0 tot 100.');
}

export function validateSkill(value: unknown): asserts value is Skill {
  const r = obj(value, 'vaardigheid');
  base(r, 'Vaardigheid');
  title(r.title, 'Vaardigheid');
  text(r.description, 'Vaardigheid');
  if (!intIn(r.level, 1, 10) || !intIn(r.targetLevel, 1, 10)) fail('Vaardigheid: niveau is een geheel getal van 1 tot 10.');
  idList(r.goalIds, 'Vaardigheid');
}

export function validateHabit(value: unknown): asserts value is Habit {
  const r = obj(value, 'gewoonte');
  base(r, 'Gewoonte');
  title(r.title, 'Gewoonte');
  oneOf(r.frequency, HABIT_FREQUENCIES, 'Gewoonte');
  if (!intIn(r.weeklyTarget, 1, 7) || (r.frequency === 'dagelijks' && r.weeklyTarget !== 7)) fail('Gewoonte: ongeldig weekdoel.');
  optionalId(r.goalId, 'Gewoonte');
  if (typeof r.archived !== 'boolean') fail('Gewoonte: ongeldige archiefstatus.');
}

export function validateHabitCheck(value: unknown): asserts value is HabitCheck {
  const r = obj(value, 'afvinking');
  if (typeof r.habitId !== 'string' || !r.habitId || !isDateKey(r.date) || r.id !== `${r.habitId}:${r.date}`) fail('Ongeldige afvinking van een gewoonte.');
}

export function validateAction(value: unknown): asserts value is Action {
  const r = obj(value, 'actie');
  base(r, 'Actie');
  title(r.title, 'Actie');
  text(r.notes, 'Actie');
  oneOf(r.status, ACTION_STATUSES, 'Actie');
  optionalId(r.goalId, 'Actie');
  optionalId(r.skillId, 'Actie');
  optionalDate(r.dueDate, 'Actie');
  optionalDate(r.doneAt, 'Actie');
  if (r.insightId !== undefined) optionalId(r.insightId, 'Actie');
  if ((r.status === 'klaar') !== (r.doneAt !== null)) fail('Actie: een afgeronde actie heeft een datum van afronden, een open actie niet.');
}

export function validateEvaluation(value: unknown): asserts value is Evaluation {
  const r = obj(value, 'evaluatie');
  base(r, 'Evaluatie');
  oneOf(r.period, EVALUATION_PERIODS, 'Evaluatie');
  if (!isDateKey(r.periodStart)) fail('Evaluatie: ongeldige startdatum.');
  text(r.wentWell, 'Evaluatie');
  text(r.toImprove, 'Evaluatie');
  text(r.nextSteps, 'Evaluatie');
  if (!(r.score === null || intIn(r.score, 1, 10))) fail('Evaluatie: score is een geheel getal van 1 tot 10.');
  idList(r.goalIds, 'Evaluatie');
}

export function validateTenTen(value: unknown): asserts value is TenTenMonth {
  const r = obj(value, '10/10-maand');
  if (typeof r.id !== 'string' || !MONTH.test(r.id)) fail('10/10: ongeldige maand.');
  for (const key of ['incomeCents', 'othersCents', 'developmentCents'] as const) {
    if (!(typeof r[key] === 'number' && Number.isSafeInteger(r[key]) && (r[key] as number) >= 0)) fail('10/10: bedragen zijn hele centen, niet negatief.');
  }
  text(r.note, '10/10');
  if (typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.updatedAt))) fail('10/10: ongeldig tijdstip.');
}

export function validateSettings(value: unknown): asserts value is GrowthSettings {
  const r = obj(value, 'instelling');
  if (r.id !== 'ugs') fail('Groei: onbekende instelling.');
  text(r.meaning35, 'Betekenis van 35');
  if (typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.updatedAt))) fail('Groei: ongeldig tijdstip.');
}

/** Controleert de subdoelen: geen kringen (A is subdoel van B en B van A). */
export function findGoalCycle(goals: readonly Pick<Goal, 'id' | 'parentId'>[]): string | null {
  const parent = new Map(goals.map((goal) => [goal.id, goal.parentId]));
  for (const goal of goals) {
    const seen = new Set<string>([goal.id]);
    let next = goal.parentId;
    while (next) {
      if (seen.has(next)) return goal.id;
      seen.add(next);
      next = parent.get(next) ?? null;
    }
  }
  return null;
}

export const GROEI_STORES = ['goals', 'skills', 'habits', 'habitChecks', 'actions', 'evaluations', 'tenTen', 'settings', 'links'] as const;

/**
 * Volledige controle van een back-up van de database `personal-ecosystem-groei` vóór herstel (ADR 0020 § 3).
 * Schema 1 bevat alleen Groei; vanaf schema 2 ook Kennis (`kennisValidator`). Een onbekend schema wordt geweigerd.
 */
export function validateGroeiBackup(input: unknown, kennisValidator?: (stores: Record<string, unknown>) => void): void {
  const backup = obj(input, 'back-up van Groei');
  const version = backup.schemaVersion ?? 1;
  if (version !== 1 && version !== 2) fail('Back-up van Groei heeft een onbekende schemaversie.');
  const stores = obj(backup.stores, 'gegevenssectie van Groei') as Record<string, unknown>;
  for (const store of GROEI_STORES) if (!Array.isArray(stores[store])) fail(`Back-up van Groei mist "${store}".`);
  const list = (store: string) => stores[store] as unknown[];
  list('goals').forEach(validateGoal);
  list('skills').forEach(validateSkill);
  list('habits').forEach(validateHabit);
  list('habitChecks').forEach(validateHabitCheck);
  list('actions').forEach(validateAction);
  list('evaluations').forEach(validateEvaluation);
  list('tenTen').forEach(validateTenTen);
  list('settings').forEach(validateSettings);
  // Koppelrecords (store `links`) worden in de module die ze schrijft gecontroleerd; een onbekende categorie blijft bewaard.
  if (findGoalCycle(list('goals') as Goal[])) fail('Back-up van Groei bevat subdoelen die naar elkaar verwijzen.');
  if (version === 2) {
    if (!kennisValidator) fail('Back-up van Groei bevat Kennis, maar die kan hier niet worden gecontroleerd.');
    kennisValidator(stores);
  }
}

// ——— Berekeningen ———

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Maandag van de week waarin `date` valt. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}

export function checkId(habitId: string, date: string): string {
  return `${habitId}:${date}`;
}

/** Aantal afvinkingen van een gewoonte in de week van `today`, tegen het weekdoel. */
export function habitWeek(habit: Habit, checks: readonly HabitCheck[], today: string): { done: number; target: number; reached: boolean } {
  const from = weekStart(today);
  const to = shiftDate(from, 6);
  const done = checks.filter((check) => check.habitId === habit.id && check.date >= from && check.date <= to).length;
  return { done, target: habit.weeklyTarget, reached: done >= habit.weeklyTarget };
}

/** Dagen achter elkaar afgevinkt tot en met vandaag (of gisteren als vandaag nog open is). */
export function habitStreak(habitId: string, checks: readonly HabitCheck[], today: string): number {
  const dates = new Set(checks.filter((check) => check.habitId === habitId).map((check) => check.date));
  let day = dates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (dates.has(day)) {
    streak += 1;
    day = shiftDate(day, -1);
  }
  return streak;
}

/** Voortgang van een doel met subdoelen: eigen voortgang, plus het gemiddelde van de directe subdoelen. */
export function goalOverview(goals: readonly Goal[], actions: readonly Action[]) {
  return goals.map((goal) => {
    const children = goals.filter((child) => child.parentId === goal.id);
    const own = actions.filter((action) => action.goalId === goal.id);
    const childProgress = children.length ? Math.round(children.reduce((sum, child) => sum + child.progress, 0) / children.length) : null;
    return {
      goal,
      subgoals: children.length,
      actionsOpen: own.filter((action) => action.status !== 'klaar').length,
      actionsDone: own.filter((action) => action.status === 'klaar').length,
      childProgress
    };
  });
}

export type SortKey = 'titel' | 'streefdatum' | 'voortgang' | 'gewijzigd';

/** Zoeken, filteren en sorteren van doelen. */
export function filterGoals(goals: readonly Goal[], options: { query?: string; status?: GoalStatus | ''; area?: string; sort?: SortKey }): Goal[] {
  const needle = (options.query ?? '').trim().toLocaleLowerCase('nl-NL');
  const result = goals.filter((goal) => {
    if (options.status && goal.status !== options.status) return false;
    if (options.area && goal.area !== options.area) return false;
    if (!needle) return true;
    return [goal.title, goal.description, goal.measure, goal.area].some((part) => part.toLocaleLowerCase('nl-NL').includes(needle));
  });
  const sort = options.sort ?? 'gewijzigd';
  return result.sort((a, b) => {
    if (sort === 'titel') return a.title.localeCompare(b.title, 'nl-NL');
    if (sort === 'voortgang') return b.progress - a.progress || a.title.localeCompare(b.title, 'nl-NL');
    if (sort === 'streefdatum') return (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || a.title.localeCompare(b.title, 'nl-NL');
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

/** Acties: open eerst (te laat bovenaan), dan op streefdatum. */
export function sortActions(actions: readonly Action[], today: string): Action[] {
  const rank = (action: Action) => (action.status === 'klaar' ? 2 : action.dueDate && action.dueDate < today ? 0 : 1);
  return [...actions].sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title, 'nl-NL'));
}

export function isOverdue(action: Action, today: string): boolean {
  return action.status !== 'klaar' && action.dueDate !== null && action.dueDate < today;
}

/** Zet een actie op een nieuwe status; houdt de datum van afronden consistent. */
export function withActionStatus(action: Action, status: ActionStatus, today: string, now = new Date()): Action {
  return { ...action, status, doneAt: status === 'klaar' ? action.doneAt ?? today : null, updatedAt: now.toISOString() };
}

/** 10/10-regel: percentage van het inkomen, tegen 10 %. Zonder inkomen geen percentage. */
export function tenTenResult(month: Pick<TenTenMonth, 'incomeCents' | 'othersCents' | 'developmentCents'>) {
  const pct = (part: number) => (month.incomeCents > 0 ? Math.round((part / month.incomeCents) * 1000) / 10 : null);
  const others = pct(month.othersCents);
  const development = pct(month.developmentCents);
  return {
    othersPct: others,
    developmentPct: development,
    othersReached: others !== null && others >= 10,
    developmentReached: development !== null && development >= 10,
    othersTargetCents: Math.round(month.incomeCents / 10),
    developmentTargetCents: Math.round(month.incomeCents / 10)
  };
}

/** "12,34" of "12.34" of "1.234,50" naar centen. Gooit bij ongeldige invoer. */
export function parseEuros(input: string): number {
  const cleaned = input.replace(/[€\s]/g, '');
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Vul een bedrag in, bijvoorbeeld 1250,00.');
  return Math.round(Number(normalized) * 100);
}

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

// ——— Leescontracten (ADR 0023 § 6, ADR 0024 § 3) ———

/**
 * Lookup van Groei: alleen `{ id, title, kind? }`. Doelen, vaardigheden en acties hebben een soort;
 * gewoontes en evaluaties vallen buiten de vijf soorten en hebben er geen (ADR 0024 § 3a).
 */
export function groeiLookupItems(
  ids: readonly string[],
  data: { goals: readonly Goal[]; skills: readonly Skill[]; actions: readonly Action[]; habits: readonly Habit[] }
): LookupItem[] {
  const wanted = new Set(ids);
  const records: { id: string; title: string; kind?: EcosystemRecordKind }[] = [
    ...data.goals.map((goal) => ({ id: goal.id, title: goal.title, kind: 'doel' as const })),
    ...data.skills.map((skill) => ({ id: skill.id, title: skill.title, kind: 'vaardigheid' as const })),
    ...data.actions.map((action) => ({ id: action.id, title: action.title, kind: 'actie' as const })),
    ...data.habits.map((habit) => ({ id: habit.id, title: habit.title }))
  ];
  return toLookupItems(records.filter((record) => wanted.has(record.id)));
}

/** Dashboard: alleen tellers en status, geen titels of inhoud. */
export function groeiSummary(data: { goals: readonly Goal[]; actions: readonly Action[]; habits: readonly Habit[]; checks: readonly HabitCheck[] }, today: string) {
  const activeHabits = data.habits.filter((habit) => !habit.archived);
  const dailyOpen = activeHabits.filter((habit) => habit.frequency === 'dagelijks' && !data.checks.some((check) => check.id === checkId(habit.id, today))).length;
  return {
    activeGoals: data.goals.filter((goal) => goal.status === 'actief').length,
    openActions: data.actions.filter((action) => action.status !== 'klaar').length,
    overdueActions: data.actions.filter((action) => isOverdue(action, today)).length,
    habitsOpenToday: dailyOpen
  };
}
