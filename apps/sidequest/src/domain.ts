export type GoalStatus = 'active' | 'completed' | 'archived';
export type HabitFrequency = 'daily' | 'weekly';

export interface Goal {
  id: string;
  title: string;
  category: string;
  targetDate: string;
  target: number;
  progress: number;
  status: GoalStatus;
  createdAt: string;
}

export interface Habit {
  id: string;
  title: string;
  frequency: HabitFrequency;
  weeklyTarget: number;
  archived: boolean;
  createdAt: string;
}

export interface HabitCheck {
  id: string;
  habitId: string;
  date: string;
}

export interface QuestStep {
  id: string;
  title: string;
  done: boolean;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  /** Aantal stappen. Bij een quest met `steps` altijd gelijk aan het aantal stappen. */
  target: number;
  /** Gezette stappen. Bij een quest met `steps` altijd het aantal afgevinkte stappen. */
  progress: number;
  rewardPoints: number;
  status: 'active' | 'completed';
  completedAt: string | null;
  createdAt: string;
  /** Sinds PR 8; ontbreekt in oudere gegevens en geldt dan als "Overig". */
  category?: string;
  /** JJJJ-MM-DD; sinds PR 8, optioneel. */
  deadline?: string | null;
  /** Benoemde stappen; sinds PR 8, optioneel. Leeg of afwezig = alleen een teller. */
  steps?: QuestStep[];
}

export const QUEST_CATEGORIES = ['Gezondheid', 'Leren', 'Creatief', 'Huis', 'Werk', 'Sociaal', 'Overig'] as const;
export const DEFAULT_QUEST_CATEGORY = 'Overig';
export const MAX_QUEST_STEPS = 30;

export const HABIT_POINTS_PER_CHECK = 5;

/** Punten per dag met minstens één training uit Sport, Kracht of Duur, als de koppeling aan staat (PR 11). */
export const SPORT_POINTS_PER_DAY = 10;

/**
 * Koppeling Sport → SIDEQUEST (I-5, ADR 0020). Standaard uit.
 * `since` is de dag waarop je de koppeling voor het eerst aanzette; uit- en weer aanzetten houdt die datum aan,
 * zodat alleen trainingen vanaf dat moment meetellen en punten reproduceerbaar blijven.
 */
export interface SportLink {
  id: 'sport-link';
  enabled: boolean;
  since: string | null;
}

export const defaultSportLink: SportLink = { id: 'sport-link', enabled: false, since: null };

/** Zet de koppeling aan of uit. De eerste keer aanzetten legt `since` vast; daarna blijft die gelijk. */
export function toggleSportLink(link: SportLink, enabled: boolean, today: string): SportLink {
  return { ...link, enabled, since: link.since ?? (enabled ? today : null) };
}

/** Dagen die sportpunten opleveren: unieke trainingsdagen vanaf `since`, alleen als de koppeling aan staat. */
export function sportPointDays(link: SportLink | undefined, trainingDays: string[]): string[] {
  if (!link?.enabled || !link.since) return [];
  return [...new Set(trainingDays.filter((day) => validDate(day) && day >= link.since!))].sort();
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateSidequestBackup(input: unknown): void {
  if (!input || typeof input !== 'object' || !('stores' in input) || !input.stores || typeof input.stores !== 'object') {
    throw new Error('SIDEQUEST-back-up heeft geen geldige gegevenssectie.');
  }
  const stores = input.stores as Record<string, unknown>;
  const goals = stores.goals;
  const habits = stores.habits;
  const checks = stores.habitChecks;
  const quests = stores.quests;
  if (!Array.isArray(goals) || !Array.isArray(habits) || !Array.isArray(checks) || !Array.isArray(quests)) {
    throw new Error('SIDEQUEST-back-up mist doelen, gewoontes, checks of quests.');
  }
  // Sinds schema 2 (PR 11); oudere back-ups hebben geen instellingen.
  const settings = stores.settings;
  if (settings !== undefined) {
    if (!Array.isArray(settings) || settings.length > 1) throw new Error('SIDEQUEST-back-up bevat ongeldige instellingen.');
    for (const value of settings) {
      const link = value as Partial<SportLink> | null;
      if (
        !link || typeof link !== 'object' || link.id !== 'sport-link' || typeof link.enabled !== 'boolean' ||
        !(link.since === null || validDate(link.since)) || (link.enabled && link.since === null)
      ) {
        throw new Error('SIDEQUEST-back-up bevat ongeldige instellingen.');
      }
    }
  }

  for (const value of goals) {
    if (!value || typeof value !== 'object') throw new Error('SIDEQUEST-back-up bevat een ongeldig doel.');
    const goal = value as Partial<Goal>;
    if (
      typeof goal.title !== 'string' || !goal.title.trim() || goal.title.length > 100 ||
      typeof goal.category !== 'string' || !goal.category.trim() || goal.category.length > 60 ||
      !validDate(goal.targetDate) ||
      !Number.isInteger(goal.target) || goal.target! <= 0 ||
      !Number.isFinite(goal.progress) || goal.progress! < 0 || goal.progress! > goal.target! ||
      !['active', 'completed', 'archived'].includes(goal.status ?? '') ||
      !validTimestamp(goal.createdAt) ||
      (goal.status === 'completed' && goal.progress !== goal.target) ||
      (goal.status === 'active' && goal.progress === goal.target)
    ) {
      throw new Error('SIDEQUEST-back-up bevat ongeldige doelgegevens.');
    }
  }

  const habitIds = new Set<string>();
  for (const value of habits) {
    if (!value || typeof value !== 'object') throw new Error('SIDEQUEST-back-up bevat een ongeldige gewoonte.');
    const habit = value as Partial<Habit>;
    if (
      typeof habit.id !== 'string' || !habit.id ||
      typeof habit.title !== 'string' || !habit.title.trim() || habit.title.length > 100 ||
      !['daily', 'weekly'].includes(habit.frequency ?? '') ||
      !Number.isInteger(habit.weeklyTarget) || habit.weeklyTarget! < 1 || habit.weeklyTarget! > 7 ||
      typeof habit.archived !== 'boolean' ||
      !validTimestamp(habit.createdAt)
    ) {
      throw new Error('SIDEQUEST-back-up bevat ongeldige gewoontegegevens.');
    }
    habitIds.add(habit.id);
  }

  const checkedDays = new Set<string>();
  for (const value of checks) {
    if (!value || typeof value !== 'object') throw new Error('SIDEQUEST-back-up bevat een ongeldige check.');
    const check = value as Partial<HabitCheck>;
    const key = `${check.habitId}:${check.date}`;
    if (typeof check.habitId !== 'string' || !habitIds.has(check.habitId) || !validDate(check.date) || checkedDays.has(key)) {
      throw new Error('SIDEQUEST-back-up bevat ongeldige of dubbele gewoontechecks.');
    }
    checkedDays.add(key);
  }

  for (const value of quests) {
    if (!value || typeof value !== 'object') throw new Error('SIDEQUEST-back-up bevat een ongeldige quest.');
    if (!isValidQuest(value as Partial<Quest>)) throw new Error('SIDEQUEST-back-up bevat ongeldige questgegevens.');
  }
}

function isValidStep(value: unknown): value is QuestStep {
  if (!value || typeof value !== 'object') return false;
  const step = value as Partial<QuestStep>;
  return typeof step.id === 'string' && !!step.id && step.id.length <= 64 &&
    typeof step.title === 'string' && !!step.title.trim() && step.title.length <= 100 &&
    typeof step.done === 'boolean';
}

function isValidQuest(quest: Partial<Quest>): boolean {
  if (
    typeof quest.title !== 'string' || !quest.title.trim() || quest.title.length > 100 ||
    typeof quest.description !== 'string' || quest.description.length > 500 ||
    !Number.isInteger(quest.target) || quest.target! <= 0 ||
    !Number.isInteger(quest.progress) || quest.progress! < 0 || quest.progress! > quest.target! ||
    !Number.isInteger(quest.rewardPoints) || quest.rewardPoints! < 0 || quest.rewardPoints! > 10_000 ||
    !['active', 'completed'].includes(quest.status ?? '') ||
    !validTimestamp(quest.createdAt) ||
    (quest.status === 'completed' && (quest.progress !== quest.target || !validTimestamp(quest.completedAt))) ||
    (quest.status === 'active' && (quest.progress === quest.target || quest.completedAt !== null))
  ) return false;
  if (quest.category !== undefined && (typeof quest.category !== 'string' || !quest.category.trim() || quest.category.length > 40)) return false;
  if (quest.deadline !== undefined && quest.deadline !== null && !validDate(quest.deadline)) return false;
  if (quest.steps !== undefined) {
    if (!Array.isArray(quest.steps) || quest.steps.length > MAX_QUEST_STEPS || !quest.steps.every(isValidStep)) return false;
    if (new Set(quest.steps.map((step) => step.id)).size !== quest.steps.length) return false;
    if (quest.steps.length > 0) {
      const done = quest.steps.filter((step) => step.done).length;
      if (quest.target !== quest.steps.length || quest.progress !== done) return false;
    }
  }
  return true;
}

/** Gooit een Nederlandse foutmelding als de quest niet consistent is (formulier en opslag). */
export function validateQuest(quest: Quest): void {
  if (!isValidQuest(quest)) {
    throw new Error('Controleer de quest: naam (max. 100 tekens), categorie, geldige deadline, 1–30 stappen met een naam en een beloning van 0 tot 10.000 punten.');
  }
}

/** Vult velden aan die in oudere gegevens ontbreken. */
export function normalizeQuest(quest: Quest): Quest & { category: string; deadline: string | null; steps: QuestStep[] } {
  return {
    ...quest,
    category: quest.category?.trim() || DEFAULT_QUEST_CATEGORY,
    deadline: quest.deadline ?? null,
    steps: quest.steps ?? []
  };
}

function completion(quest: Quest, progress: number, now: string): Quest {
  const completed = progress >= quest.target;
  return { ...quest, progress, status: completed ? 'completed' : 'active', completedAt: completed ? now : null };
}

/** Zet één stap bij een quest zonder benoemde stappen. Voltooide quests veranderen niet. */
export function advanceQuest(quest: Quest, now = new Date().toISOString()): Quest {
  if (quest.status === 'completed' || (quest.steps?.length ?? 0) > 0) return quest;
  return completion(quest, Math.min(quest.target, quest.progress + 1), now);
}

/**
 * Vinkt een benoemde stap aan of uit. Bij de laatste stap is de quest voltooid en telt de beloning;
 * een voltooide quest blijft vast, zodat punten niet kunnen verdwijnen of dubbel tellen.
 */
export function toggleQuestStep(quest: Quest, stepId: string, now = new Date().toISOString()): Quest {
  const steps = quest.steps ?? [];
  if (quest.status === 'completed' || !steps.some((step) => step.id === stepId)) return quest;
  const nextSteps = steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step));
  return completion({ ...quest, steps: nextSteps }, nextSteps.filter((step) => step.done).length, now);
}

/**
 * Past een actieve quest aan. Met benoemde stappen volgen doel en voortgang uit de stappen;
 * zijn na het aanpassen alle stappen afgevinkt, dan is de quest voltooid.
 */
export function editQuest(
  quest: Quest,
  changes: { title: string; description: string; category: string; deadline: string | null; rewardPoints: number; steps: QuestStep[]; target?: number },
  now = new Date().toISOString()
): Quest {
  if (quest.status === 'completed') throw new Error('Een voltooide quest kan niet meer worden aangepast.');
  const base: Quest = {
    ...quest,
    title: changes.title.trim(),
    description: changes.description.trim(),
    category: changes.category.trim() || DEFAULT_QUEST_CATEGORY,
    deadline: changes.deadline || null,
    rewardPoints: changes.rewardPoints,
    steps: changes.steps.map((step) => ({ ...step, title: step.title.trim() }))
  };
  const next = changes.steps.length
    ? completion({ ...base, target: changes.steps.length }, changes.steps.filter((step) => step.done).length, now)
    : completion({ ...base, target: changes.target ?? quest.target }, Math.min(quest.progress, changes.target ?? quest.target), now);
  validateQuest(next);
  return next;
}

/** Dagen tot de deadline (negatief = te laat), of null zonder deadline. */
export function daysUntilDeadline(quest: Quest, today: string): number | null {
  if (!quest.deadline || !validDate(quest.deadline) || !validDate(today)) return null;
  return Math.round((utcDate(quest.deadline).getTime() - utcDate(today).getTime()) / 86_400_000);
}

/** Actieve quests: eerst met deadline (vroegste eerst), daarna zonder, nieuwste eerst. */
export function sortActiveQuests(quests: Quest[]): Quest[] {
  return [...quests].sort((a, b) => {
    const da = a.deadline ?? null;
    const db = b.deadline ?? null;
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mondayOf(date: Date): Date {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - offset);
  return monday;
}

export function currentPeriodChecks(
  habit: Habit,
  checks: HabitCheck[],
  today = dateKey(new Date())
): number {
  const currentDate = utcDate(today);
  if (habit.frequency === 'daily') {
    return checks.some((check) => check.habitId === habit.id && check.date === today) ? 1 : 0;
  }
  const weekStart = dateKey(mondayOf(currentDate));
  const nextWeek = new Date(`${weekStart}T00:00:00.000Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const weekEnd = dateKey(nextWeek);
  return checks.filter(
    (check) => check.habitId === habit.id && check.date >= weekStart && check.date < weekEnd
  ).length;
}

export function calculateHabitStreak(
  habit: Habit,
  checks: HabitCheck[],
  today = dateKey(new Date())
): number {
  const completionDates = new Set(
    checks.filter((check) => check.habitId === habit.id).map((check) => check.date)
  );
  const todayDate = utcDate(today);

  if (habit.frequency === 'daily') {
    let cursor = todayDate;
    if (!completionDates.has(dateKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let streak = 0;
    while (completionDates.has(dateKey(cursor))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
  }

  const completedWeeks = new Set<string>();
  const countsPerWeek = new Map<string, number>();
  for (const date of completionDates) {
    const week = dateKey(mondayOf(utcDate(date)));
    countsPerWeek.set(week, (countsPerWeek.get(week) ?? 0) + 1);
  }
  for (const [week, count] of countsPerWeek) {
    if (count >= habit.weeklyTarget) completedWeeks.add(week);
  }
  let cursor = mondayOf(todayDate);
  const currentWeekCount = checks.filter(
    (check) =>
      check.habitId === habit.id &&
      check.date >= dateKey(cursor) &&
      check.date < dateKey(new Date(cursor.getTime() + 7 * 86_400_000))
  ).length;
  if (currentWeekCount < habit.weeklyTarget) cursor.setUTCDate(cursor.getUTCDate() - 7);

  let streak = 0;
  while (completedWeeks.has(dateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

/** Punten: gewoontechecks, voltooide quests en (alleen met de koppeling aan) trainingsdagen uit `sportPointDays`. */
export function calculatePoints(checks: HabitCheck[], quests: Quest[], sportDays: string[] = []): number {
  const habitPoints = checks.length * HABIT_POINTS_PER_CHECK + new Set(sportDays).size * SPORT_POINTS_PER_DAY;
  const questPoints = quests.reduce(
    (sum, quest) => sum + (quest.status === 'completed' ? quest.rewardPoints : 0),
    0
  );
  return habitPoints + questPoints;
}

export function validateProgress(progress: number, target: number): void {
  if (!Number.isFinite(progress) || !Number.isFinite(target) || target <= 0 || progress < 0 || progress > target) {
    throw new Error('Voortgang moet tussen nul en het doel blijven.');
  }
}
