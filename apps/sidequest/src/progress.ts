/**
 * Levels, badges en statistieken voor SIDEQUEST (PR 9).
 * Alles wordt afgeleid uit gewoontechecks en quests; er wordt niets extra opgeslagen.
 * Badges zijn alleen erkenning en geven geen punten (besluit eigenaar, PR 9).
 */
import { DEFAULT_QUEST_CATEGORY, HABIT_POINTS_PER_CHECK, SPORT_POINTS_PER_DAY, type Habit, type HabitCheck, type Quest } from './domain';

/* ---------- Datums ---------- */

/** Lokale datum JJJJ-MM-DD van een tijdstip. */
export function localDay(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function mondayOf(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  return shiftDay(day, -((date.getUTCDay() + 6) % 7));
}

/* ---------- Levels ---------- */

/**
 * Punten nodig om level `level` te bereiken. Level 1 = 0; daarna kost elk level 50 punten meer
 * dan het vorige: level 2 bij 100, 3 bij 250, 4 bij 450, 5 bij 700, 6 bij 1000 …
 */
export function levelThreshold(level: number): number {
  if (!Number.isInteger(level) || level <= 1) return 0;
  const steps = level - 1;
  return 50 * steps + 25 * steps * (steps + 1);
}

export interface LevelInfo {
  level: number;
  points: number;
  /** Drempel van het huidige level. */
  levelStart: number;
  /** Drempel van het volgende level. */
  nextAt: number;
  /** 0–1 binnen het huidige level. */
  progress: number;
}

export function levelInfo(points: number): LevelInfo {
  const safe = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;
  let level = 1;
  while (levelThreshold(level + 1) <= safe) level += 1;
  const levelStart = levelThreshold(level);
  const nextAt = levelThreshold(level + 1);
  return { level, points: safe, levelStart, nextAt, progress: (safe - levelStart) / (nextAt - levelStart) };
}

/* ---------- Punten per dag ---------- */

export interface PointEvent {
  day: string;
  points: number;
  kind: 'check' | 'quest' | 'sport';
}

/** Alle puntgebeurtenissen op datum, oudste eerst. Zelfde regels als `calculatePoints`; `sportDays` komt uit `sportPointDays`. */
export function pointEvents(checks: HabitCheck[], quests: Quest[], sportDays: string[] = []): PointEvent[] {
  const events: PointEvent[] = checks.map((check) => ({ day: check.date, points: HABIT_POINTS_PER_CHECK, kind: 'check' }));
  for (const day of new Set(sportDays)) events.push({ day, points: SPORT_POINTS_PER_DAY, kind: 'sport' });
  for (const quest of quests) {
    if (quest.status === 'completed' && quest.completedAt) events.push({ day: localDay(quest.completedAt), points: quest.rewardPoints, kind: 'quest' });
  }
  return events.sort((a, b) => a.day.localeCompare(b.day));
}

/** Eerste dag waarop het cumulatieve aantal punten `target` bereikte, of null. */
function dayPointsReached(events: PointEvent[], target: number): string | null {
  let total = 0;
  for (const event of events) {
    total += event.points;
    if (total >= target) return event.day;
  }
  return null;
}

/* ---------- Streaks ---------- */

/** Dag waarop een dagelijkse gewoonte voor het eerst `length` dagen achter elkaar is afgevinkt, of null. */
function dayStreakReached(checks: HabitCheck[], habits: Habit[], length: number): string | null {
  let first: string | null = null;
  for (const habit of habits.filter((item) => item.frequency === 'daily')) {
    const days = [...new Set(checks.filter((check) => check.habitId === habit.id).map((check) => check.date))].sort();
    let run = 0;
    let previous = '';
    for (const day of days) {
      run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
      previous = day;
      if (run >= length) {
        if (!first || day < first) first = day;
        break;
      }
    }
  }
  return first;
}

/** Langste reeks opeenvolgende dagen van een dagelijkse gewoonte (ooit). */
export function longestDailyStreak(checks: HabitCheck[], habits: Habit[]): number {
  let best = 0;
  for (const habit of habits.filter((item) => item.frequency === 'daily')) {
    const days = [...new Set(checks.filter((check) => check.habitId === habit.id).map((check) => check.date))].sort();
    let run = 0;
    let previous = '';
    for (const day of days) {
      run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
      previous = day;
      best = Math.max(best, run);
    }
  }
  return best;
}

/* ---------- Badges ---------- */

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Lokale datum waarop de badge is behaald, of null. */
  earnedOn: string | null;
  /** Voortgang richting de badge, bijv. 4 van 10. */
  current: number;
  target: number;
}

function nth<T>(list: T[], n: number): T | undefined {
  return list[n - 1];
}

/** Quests die op of vóór hun deadline zijn voltooid. */
function onTimeQuests(quests: Quest[]): Quest[] {
  return quests.filter((quest) => quest.status === 'completed' && quest.completedAt && quest.deadline && localDay(quest.completedAt) <= quest.deadline);
}

export function badges(habits: Habit[], checks: HabitCheck[], quests: Quest[], sportDays: string[] = []): Badge[] {
  const checkDays = checks.map((check) => check.date).sort();
  const completedDays = quests
    .filter((quest) => quest.status === 'completed' && quest.completedAt)
    .map((quest) => localDay(quest.completedAt!))
    .sort();
  const onTimeDays = onTimeQuests(quests).map((quest) => localDay(quest.completedAt!)).sort();
  const events = pointEvents(checks, quests, sportDays);
  const points = events.reduce((sum, event) => sum + event.points, 0);
  const longest = longestDailyStreak(checks, habits);
  const level = levelInfo(points).level;

  const count = (id: string, title: string, description: string, icon: string, days: string[], target: number): Badge => ({
    id, title, description, icon, target, current: Math.min(days.length, target), earnedOn: nth(days, target) ?? null
  });

  return [
    count('eerste-check', 'Eerste vinkje', 'Je eerste gewoonte afgevinkt.', '✓', checkDays, 1),
    count('eerste-quest', 'Eerste quest', 'Je eerste quest voltooid.', '✦', completedDays, 1),
    { id: 'week-streak', title: 'Week vol', description: '7 dagen achter elkaar een dagelijkse gewoonte gedaan.', icon: '7', target: 7, current: Math.min(longest, 7), earnedOn: dayStreakReached(checks, habits, 7) },
    count('op-tijd', 'Op tijd', '5 quests op of vóór de deadline voltooid.', '⏱', onTimeDays, 5),
    count('questjager', 'Questjager', '10 quests voltooid.', '⚑', completedDays, 10),
    { id: 'maand-streak', title: 'Maand vol', description: '30 dagen achter elkaar een dagelijkse gewoonte gedaan.', icon: '30', target: 30, current: Math.min(longest, 30), earnedOn: dayStreakReached(checks, habits, 30) },
    count('honderd-checks', 'Honderd vinkjes', '100 gewoontechecks geregistreerd.', '100', checkDays, 100),
    { id: 'level-5', title: 'Level 5', description: `Level 5 bereikt (${levelThreshold(5)} punten).`, icon: '★', target: 5, current: Math.min(level, 5), earnedOn: dayPointsReached(events, levelThreshold(5)) },
    { id: 'duizend-punten', title: 'Duizend punten', description: '1000 punten verzameld.', icon: '◆', target: 1000, current: Math.min(points, 1000), earnedOn: dayPointsReached(events, 1000) }
  ];
}

/* ---------- Statistieken ---------- */

export interface CategoryStat {
  category: string;
  active: number;
  completed: number;
  points: number;
}

export interface SidequestStats {
  totalChecks: number;
  completedQuests: number;
  activeQuests: number;
  /** Aandeel van de voltooide quests met deadline dat op tijd was; null zonder zulke quests. */
  onTimeRate: number | null;
  /** Gemiddelde doorlooptijd in dagen van aanmaken tot voltooien; null zonder voltooide quests. */
  averageDaysToComplete: number | null;
  longestStreak: number;
  categories: CategoryStat[];
}

export function sidequestStats(habits: Habit[], checks: HabitCheck[], quests: Quest[]): SidequestStats {
  const completed = quests.filter((quest) => quest.status === 'completed' && quest.completedAt);
  const withDeadline = completed.filter((quest) => quest.deadline);
  const durations = completed
    .map((quest) => (Date.parse(quest.completedAt!) - Date.parse(quest.createdAt)) / 86_400_000)
    .filter((days) => Number.isFinite(days) && days >= 0);
  const perCategory = new Map<string, CategoryStat>();
  for (const quest of quests) {
    const category = quest.category?.trim() || DEFAULT_QUEST_CATEGORY;
    const stat = perCategory.get(category) ?? { category, active: 0, completed: 0, points: 0 };
    if (quest.status === 'completed') {
      stat.completed += 1;
      stat.points += quest.rewardPoints;
    } else {
      stat.active += 1;
    }
    perCategory.set(category, stat);
  }
  return {
    totalChecks: checks.length,
    completedQuests: completed.length,
    activeQuests: quests.filter((quest) => quest.status === 'active').length,
    onTimeRate: withDeadline.length ? onTimeQuests(quests).length / withDeadline.length : null,
    averageDaysToComplete: durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null,
    longestStreak: longestDailyStreak(checks, habits),
    categories: [...perCategory.values()].sort((a, b) => b.completed - a.completed || b.active - a.active || a.category.localeCompare(b.category, 'nl'))
  };
}

/** Punten per week (maandag–zondag), oudste eerst, `weeks` weken t/m de week van `today`. */
export function pointsPerWeek(checks: HabitCheck[], quests: Quest[], today: string, weeks = 8, sportDays: string[] = []): { weekStart: string; points: number }[] {
  const current = mondayOf(today);
  const starts = Array.from({ length: weeks }, (_, index) => shiftDay(current, -7 * (weeks - 1 - index)));
  const totals = new Map(starts.map((start) => [start, 0]));
  for (const event of pointEvents(checks, quests, sportDays)) {
    const start = mondayOf(event.day);
    if (totals.has(start)) totals.set(start, totals.get(start)! + event.points);
  }
  return starts.map((weekStart) => ({ weekStart, points: totals.get(weekStart)! }));
}

export interface CalendarDay {
  date: string;
  /** Aantal gewoontechecks en voltooide quests die dag (trainingsdagen tellen hier niet mee). */
  count: number;
  /** false voor dagen na vandaag in de laatste week (worden leeg getoond). */
  inRange: boolean;
}

/**
 * Kalender voor een heatmap: `weeks` hele weken (maandag–zondag), oudste week eerst,
 * met per dag het aantal activiteiten (gewoontechecks + voltooide quests).
 */
export function activityCalendar(checks: HabitCheck[], quests: Quest[], today: string, weeks = 16): CalendarDay[][] {
  const counts = new Map<string, number>();
  for (const event of pointEvents(checks, quests)) counts.set(event.day, (counts.get(event.day) ?? 0) + 1);
  const firstMonday = shiftDay(mondayOf(today), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = shiftDay(firstMonday, week * 7 + weekday);
      return { date, count: date <= today ? counts.get(date) ?? 0 : 0, inRange: date <= today };
    })
  );
}
