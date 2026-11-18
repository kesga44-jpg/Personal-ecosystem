/**
 * Koppeling Sport → SIDEQUEST (I-5, PR 11): alleen de datums waarop een training is vastgelegd.
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
