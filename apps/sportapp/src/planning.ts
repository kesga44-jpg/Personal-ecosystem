/**
 * Weekdoel en trainingsplanning voor Sport (roadmap #5, PR 13).
 * Opgeslagen in de Sport-store `planning` (schema 2): één weekdoel en geplande trainingen.
 * Of een geplande training gedaan is, volgt uit vastgelegde trainingen op die dag; er wordt niets dubbel opgeslagen.
 */

/** Een vastgelegde training uit Sport, Kracht of Duur: alleen datum en minuten. */
export interface SessionDay {
  date: string;
  minutes: number;
}

export interface WeekGoal {
  id: 'week-goal';
  kind: 'goal';
  /** Aantal trainingen per week, of null zonder doel. */
  sessions: number | null;
  /** Minuten per week, of null zonder doel. */
  minutes: number | null;
}

export interface PlannedSession {
  id: string;
  kind: 'plan';
  date: string;
  title: string;
  minutes: number;
  trainingId: string | null;
}

export type PlanningRecord = WeekGoal | PlannedSession;

export const emptyWeekGoal: WeekGoal = { id: 'week-goal', kind: 'goal', sessions: null, minutes: null };

export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  return shiftDay(day, -((new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7));
}

function isCount(value: unknown, max: number): boolean {
  return value === null || (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max);
}

export function isWeekGoal(value: unknown): value is WeekGoal {
  if (!value || typeof value !== 'object') return false;
  const goal = value as Partial<WeekGoal>;
  return goal.id === 'week-goal' && goal.kind === 'goal' && isCount(goal.sessions, 21) && isCount(goal.minutes, 3000);
}

export function isPlannedSession(value: unknown): value is PlannedSession {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<PlannedSession>;
  return (
    typeof plan.id === 'string' && !!plan.id && plan.id !== 'week-goal' && plan.id.length <= 64 &&
    plan.kind === 'plan' && isDay(plan.date) &&
    typeof plan.title === 'string' && !!plan.title.trim() && plan.title.length <= 100 &&
    Number.isInteger(plan.minutes) && plan.minutes! >= 1 && plan.minutes! <= 600 &&
    (plan.trainingId === null || (typeof plan.trainingId === 'string' && plan.trainingId.length <= 64))
  );
}

/** Controle van de store `planning` bij herstel. Ontbreekt in back-ups van schema 1. */
export function validatePlanningStore(records: unknown): void {
  if (records === undefined) return;
  if (!Array.isArray(records) || records.length > 2000) throw new Error('Sport-back-up bevat ongeldige planning.');
  let goals = 0;
  for (const record of records) {
    if (isWeekGoal(record)) goals += 1;
    else if (!isPlannedSession(record)) throw new Error('Sport-back-up bevat ongeldige planning.');
  }
  if (goals > 1) throw new Error('Sport-back-up bevat ongeldige planning.');
}

export interface WeekProgress {
  weekStart: string;
  sessions: number;
  minutes: number;
  goal: WeekGoal;
  /** Gehaald als elk ingesteld doel bereikt is; null zonder doel. */
  reached: boolean | null;
}

/** Voortgang deze week (ma–zo) over alle vastgelegde trainingen. */
export function weekProgress(sessions: SessionDay[], goal: WeekGoal, today: string): WeekProgress {
  const weekStart = mondayOf(today);
  const weekEnd = shiftDay(weekStart, 6);
  const week = sessions.filter((session) => session.date >= weekStart && session.date <= weekEnd);
  const minutes = Math.round(week.reduce((sum, session) => sum + session.minutes, 0));
  const checks = [goal.sessions === null ? null : week.length >= goal.sessions, goal.minutes === null ? null : minutes >= goal.minutes].filter((value) => value !== null);
  return { weekStart, sessions: week.length, minutes, goal, reached: checks.length ? checks.every(Boolean) : null };
}

export type PlanStatus = 'gedaan' | 'gemist' | 'gepland';

/** Gedaan als er die dag een training is vastgelegd; gemist als de dag voorbij is; anders gepland. */
export function planStatus(plan: PlannedSession, sessions: SessionDay[], today: string): PlanStatus {
  if (sessions.some((session) => session.date === plan.date)) return 'gedaan';
  return plan.date < today ? 'gemist' : 'gepland';
}

export interface CalendarDay {
  date: string;
  plans: PlannedSession[];
  sessions: number;
  minutes: number;
}

/** Kalender van `weeks` weken vanaf de maandag van deze week. */
export function planningCalendar(plans: PlannedSession[], sessions: SessionDay[], today: string, weeks = 2): CalendarDay[] {
  const start = mondayOf(today);
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = shiftDay(start, index);
    const done = sessions.filter((session) => session.date === date);
    return {
      date,
      plans: plans.filter((plan) => plan.date === date).sort((a, b) => a.title.localeCompare(b.title, 'nl')),
      sessions: done.length,
      minutes: Math.round(done.reduce((sum, session) => sum + session.minutes, 0))
    };
  });
}
