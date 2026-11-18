/**
 * Koppeling Sport → SIDEQUEST (I-5, PR 11): alleen de datums waarop een training is vastgelegd.
 * Weekdoel van Sport (PR 13): alleen datum en minuten van trainingen in Kracht en Duur.
 * Geen sporttype, duur, afstand, route of hartslag (DATA_OWNERSHIP.md). Leest alleen; schrijft nergens.
 */
import { openLocalDatabase } from '@ecosystem/storage';
import { databaseConfig as sportConfig } from '@ecosystem/sportapp/App';
import type { Activity } from '@ecosystem/sportapp/domain';
import { databaseConfig as krachtConfig } from '../modules/kracht/storage';
import type { Session as StrengthSession } from '../modules/kracht/domain';
import { databaseConfig as duurConfig } from '../modules/duur/storage';
import type { Workout as EnduranceWorkout } from '../modules/duur/domain';
import { localDateKey } from '../dashboard/summary';

/**
 * Trainingen uit Kracht en Duur voor het weekdoel van Sport (PR 13): alleen datum en minuten.
 * Kracht: tijd tussen start en einde (0 als die ontbreekt); Duur: de duur van de training.
 */
export function otherSessionsFrom(input: { kracht: { date: string; startedAt: string; finishedAt: string }[]; duur: { date: string; durationSec: number }[] }): { date: string; minutes: number }[] {
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);
  return [
    ...input.kracht.filter((session) => valid(session.date)).map((session) => {
      const minutes = (Date.parse(session.finishedAt) - Date.parse(session.startedAt)) / 60_000;
      return { date: session.date, minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0 };
    }),
    ...input.duur.filter((workout) => valid(workout.date)).map((workout) => ({ date: workout.date, minutes: Math.round(Math.max(0, workout.durationSec) / 60) }))
  ];
}

export async function loadOtherSessions(): Promise<{ date: string; minutes: number }[]> {
  const [kracht, duur] = await Promise.all([openLocalDatabase(krachtConfig), openLocalDatabase(duurConfig)]);
  try {
    const [sessions, workouts] = await Promise.all([kracht.list<StrengthSession>('sessions'), duur.list<EnduranceWorkout>('workouts')]);
    return otherSessionsFrom({ kracht: sessions, duur: workouts });
  } finally {
    kracht.close();
    duur.close();
  }
}

/** Unieke, gesorteerde trainingsdagen uit Sport (starttijd, lokale datum), Kracht en Duur (datum). */
export function trainingDaysFrom(input: { activityStarts: string[]; krachtDates: string[]; duurDates: string[] }): string[] {
  const days = new Set<string>();
  for (const start of input.activityStarts) {
    const time = new Date(start);
    if (Number.isFinite(time.getTime())) days.add(localDateKey(time));
  }
  for (const day of [...input.krachtDates, ...input.duurDates]) if (/^\d{4}-\d{2}-\d{2}$/.test(day)) days.add(day);
  return [...days].sort();
}

export async function loadTrainingDays(): Promise<string[]> {
  const [sport, kracht, duur] = await Promise.all([openLocalDatabase(sportConfig), openLocalDatabase(krachtConfig), openLocalDatabase(duurConfig)]);
  try {
    const [activities, sessions, workouts] = await Promise.all([
      sport.list<Activity>('activities'),
      kracht.list<StrengthSession>('sessions'),
      duur.list<EnduranceWorkout>('workouts')
    ]);
    return trainingDaysFrom({
      activityStarts: activities.map((activity) => activity.startedAt),
      krachtDates: sessions.map((session) => session.date),
      duurDates: workouts.map((workout) => workout.date)
    });
  } finally {
    sport.close();
    kracht.close();
    duur.close();
  }
}
