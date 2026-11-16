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

export interface Quest {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardPoints: number;
  status: 'active' | 'completed';
  completedAt: string | null;
  createdAt: string;
}

export const HABIT_POINTS_PER_CHECK = 5;

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
    const quest = value as Partial<Quest>;
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
    ) {
      throw new Error('SIDEQUEST-back-up bevat ongeldige questgegevens.');
    }
  }
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

export function calculatePoints(checks: HabitCheck[], quests: Quest[]): number {
  const habitPoints = checks.length * HABIT_POINTS_PER_CHECK;
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
