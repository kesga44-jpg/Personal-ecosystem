import type { ChartPoint } from '@ecosystem/ui';
import type { Activity } from '@ecosystem/sportapp/domain';
import { HABIT_POINTS_PER_CHECK, calculateHabitStreak, currentPeriodChecks, type Habit, type HabitCheck, type Quest } from '@ecosystem/sidequest/domain';

/** Lichaam: alleen óf er vandaag iets is ingevuld, nooit de waarden zelf (DATA_OWNERSHIP.md). */
export { filledToday as lichaamFilledToday } from '../modules/lichaam/domain';

/** Dagboek: alleen óf er vandaag geschreven is, nooit stemming of tekst (DATA_OWNERSHIP.md). */
export { writtenToday as dagboekWrittenToday } from '../modules/dagboek/domain';

/**
 * Leescontracten voor het dashboard (ADR 0020 § 2, DATA_OWNERSHIP.md).
 * Alleen samenvattingen: aantallen, totalen en streaks. Geen notities of andere inhoud.
 */

const weekdayLabels = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

/** Lokale datum als JJJJ-MM-DD (zelfde conventie als SIDEQUEST). */
export function localDateKey(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function lastDays(today: string, count: number): string[] {
  const end = new Date(`${today}T12:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setDate(end.getDate() - (count - 1 - index));
    return localDateKey(day);
  });
}

function weekdayLabel(key: string): string {
  return weekdayLabels[new Date(`${key}T12:00:00`).getDay()]!;
}

export interface SportWeek {
  points: ChartPoint[];
  totalMinutes: number;
  totalKm: number;
  count: number;
}

/** Beweegminuten per dag over de laatste 7 dagen. */
export function sportWeek(activities: Pick<Activity, 'startedAt' | 'durationMinutes' | 'distanceKm'>[], today: string): SportWeek {
  const days = lastDays(today, 7);
  const minutes = new Map(days.map((day) => [day, 0]));
  let totalKm = 0;
  let count = 0;
  for (const activity of activities) {
    const day = localDateKey(new Date(activity.startedAt));
    if (!minutes.has(day)) continue;
    minutes.set(day, minutes.get(day)! + activity.durationMinutes);
    totalKm += activity.distanceKm ?? 0;
    count += 1;
  }
  const points = days.map((day) => ({ label: weekdayLabel(day), value: minutes.get(day)! }));
  return { points, totalMinutes: points.reduce((sum, point) => sum + point.value, 0), totalKm: Math.round(totalKm * 10) / 10, count };
}

export interface HabitsToday {
  done: number;
  total: number;
  open: string[];
}

/** Dagelijkse gewoontes van vandaag: hoeveel zijn afgevinkt, en welke staan nog open. */
export function habitsToday(habits: Habit[], checks: HabitCheck[], today: string): HabitsToday {
  const daily = habits.filter((habit) => !habit.archived && habit.frequency === 'daily');
  const open = daily.filter((habit) => currentPeriodChecks(habit, checks, today) === 0).map((habit) => habit.title);
  return { done: daily.length - open.length, total: daily.length, open };
}

export function topStreaks(habits: Habit[], checks: HabitCheck[], today: string, limit = 3): { title: string; streak: number }[] {
  return habits
    .filter((habit) => !habit.archived)
    .map((habit) => ({ title: habit.title, streak: calculateHabitStreak(habit, checks, today) }))
    .filter((item) => item.streak > 0)
    .sort((a, b) => b.streak - a.streak || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Verdiende punten per dag (gewoontechecks + voltooide quests), voor een trendlijn. */
export function pointsPerDay(checks: HabitCheck[], quests: Quest[], today: string, count = 14): ChartPoint[] {
  const days = lastDays(today, count);
  const points = new Map(days.map((day) => [day, 0]));
  for (const check of checks) if (points.has(check.date)) points.set(check.date, points.get(check.date)! + HABIT_POINTS_PER_CHECK);
  for (const quest of quests) {
    if (quest.status !== 'completed' || !quest.completedAt) continue;
    const day = localDateKey(new Date(quest.completedAt));
    if (points.has(day)) points.set(day, points.get(day)! + quest.rewardPoints);
  }
  return days.map((day) => ({ label: day.slice(8, 10), value: points.get(day)! }));
}

/** Aantal gewoontechecks per dag voor de heatmap (laatste 28 dagen). */
export function checkHeatmap(checks: HabitCheck[], today: string, count = 28): { date: string; value: number }[] {
  const days = lastDays(today, count);
  const perDay = new Map(days.map((day) => [day, 0]));
  for (const check of checks) if (perDay.has(check.date)) perDay.set(check.date, perDay.get(check.date)! + 1);
  return days.map((day) => ({ date: day, value: perDay.get(day)! }));
}

export function daysSince(isoDate: string, now: Date): number | null {
  const time = Date.parse(isoDate);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now.getTime() - time) / 86_400_000));
}

export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 6) return 'Goedenacht';
  if (hour < 12) return 'Goedemorgen';
  if (hour < 18) return 'Goedemiddag';
  return 'Goedenavond';
}
