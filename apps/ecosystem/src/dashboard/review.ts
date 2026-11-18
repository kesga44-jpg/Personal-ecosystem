/**
 * Weekreview op het dashboard (roadmap #2): terugblik op de vorige week (maandag t/m zondag),
 * vergeleken met de week daarvoor. Alleen tellers en totalen uit de leescontracten (ADR 0020 § 2).
 */
import { HABIT_POINTS_PER_CHECK, SPORT_POINTS_PER_DAY } from '@ecosystem/sidequest/domain';
import type { DashboardData } from './data';
import { localDateKey } from './summary';

export interface WeekRange {
  start: string;
  end: string;
}

export interface WeekStats extends WeekRange {
  workouts: number;
  activeMinutes: number;
  habitChecks: number;
  questsCompleted: number;
  points: number;
  journalDays: number;
  bodyDays: number;
  foodDays: number;
}

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Week (ma–zo) die `weeksBack` weken vóór de huidige week ligt; 1 = vorige week. */
export function weekRange(today: string, weeksBack: number): WeekRange {
  const weekday = (new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const start = shiftDay(today, -weekday - 7 * weeksBack);
  return { start, end: shiftDay(start, 6) };
}

const inRange = (day: string, range: WeekRange) => day >= range.start && day <= range.end;

function distinctDays(items: { date: string }[], range: WeekRange): number {
  return new Set(items.map((item) => item.date).filter((day) => inRange(day, range))).size;
}

/** Totalen van één week. `sportDays` zijn de dagen met sportpunten (leeg als de koppeling uit staat). */
export function weekStats(data: DashboardData, range: WeekRange, sportDays: string[] = []): WeekStats {
  const activities = data.activities.filter((activity) => inRange(localDateKey(new Date(activity.startedAt)), range));
  const strength = data.krachtDates.filter((item) => inRange(item.date, range));
  const endurance = data.duurTotals.filter((item) => inRange(item.date, range));
  const checks = data.checks.filter((check) => inRange(check.date, range));
  const quests = data.quests.filter((quest) => quest.status === 'completed' && quest.completedAt && inRange(localDateKey(new Date(quest.completedAt)), range));
  const sport = new Set(sportDays.filter((day) => inRange(day, range)));
  return {
    ...range,
    workouts: activities.length + strength.length + endurance.length,
    activeMinutes: Math.round(activities.reduce((sum, activity) => sum + activity.durationMinutes, 0) + endurance.reduce((sum, item) => sum + item.durationSec / 60, 0)),
    habitChecks: checks.length,
    questsCompleted: quests.length,
    points: checks.length * HABIT_POINTS_PER_CHECK + quests.reduce((sum, quest) => sum + quest.rewardPoints, 0) + sport.size * SPORT_POINTS_PER_DAY,
    journalDays: distinctDays(data.dagboekDates, range),
    bodyDays: distinctDays(data.lichaamDates, range),
    foodDays: distinctDays(data.voedingDates, range)
  };
}

/** Vorige week en de week daarvoor. */
export function weekReview(data: DashboardData, today: string, sportDays: string[] = []): { last: WeekStats; before: WeekStats } {
  return { last: weekStats(data, weekRange(today, 1), sportDays), before: weekStats(data, weekRange(today, 2), sportDays) };
}

/** Verschil als korte tekst: "+2", "−1" of "gelijk". */
export function difference(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return 'gelijk';
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}
