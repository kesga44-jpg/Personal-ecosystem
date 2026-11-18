/** Gegevens voor het dashboard en de herinneringen: alleen samenvattingen (ADR 0020 § 2). */
import { openLocalDatabase } from '@ecosystem/storage';
import { databaseConfig as hubConfig } from '@ecosystem/hub/App';
import { databaseConfig as sportConfig } from '@ecosystem/sportapp/App';
import { databaseConfig as questConfig } from '@ecosystem/sidequest/App';
import type { Shortcut } from '@ecosystem/hub/domain';
import type { Activity } from '@ecosystem/sportapp/domain';
import type { Habit, HabitCheck, Quest, SportLink } from '@ecosystem/sidequest/domain';
import { databaseConfig as lichaamConfig } from '../modules/lichaam/storage';
import type { BodyDay } from '../modules/lichaam/domain';
import { databaseConfig as dagboekConfig } from '../modules/dagboek/storage';
import type { JournalEntry } from '../modules/dagboek/domain';
import { databaseConfig as voedingConfig } from '../modules/voeding/storage';
import type { FoodEntry } from '../modules/voeding/domain';
import { databaseConfig as krachtConfig } from '../modules/kracht/storage';
import type { Session as StrengthSession } from '../modules/kracht/domain';
import { databaseConfig as duurConfig } from '../modules/duur/storage';
import type { Workout as EnduranceWorkout } from '../modules/duur/domain';

export interface DashboardData {
  activities: Activity[];
  habits: Habit[];
  checks: HabitCheck[];
  quests: Quest[];
  /** Instelling van de koppeling Sport → SIDEQUEST (aan/uit en vanaf welke dag), voor dezelfde punten als in SIDEQUEST. */
  sportLink: SportLink | undefined;
  shortcuts: Shortcut[];
  /** Alleen datums van Lichaam-registraties; geen waarden (ADR 0020 § 2). */
  lichaamDates: { date: string }[];
  /** Alleen datums van Dagboek-notities; geen stemming of tekst. */
  dagboekDates: { date: string }[];
  /** Alleen datums van Voeding-registraties; geen producten of hoeveelheden. */
  voedingDates: { date: string }[];
  /** Alleen datums van Kracht-trainingen; geen oefeningen of gewichten. */
  krachtDates: { date: string }[];
  /** Alleen datum, afstand en duur van Duur-trainingen; geen routes of hartslag. */
  duurTotals: { date: string; distanceM: number | null; durationSec: number }[];
}

export const emptyData: DashboardData = { activities: [], habits: [], checks: [], quests: [], sportLink: undefined, shortcuts: [], lichaamDates: [], dagboekDates: [], voedingDates: [], krachtDates: [], duurTotals: [] };

export function lastBackup(): string {
  try {
    return localStorage.getItem('personal-ecosystem.backup.last-export') ?? '';
  } catch {
    return '';
  }
}

/** Leest alleen samenvattingen uit de modules (ADR 0020 § 2); het dashboard schrijft nooit in andere modules. */
export async function loadData(): Promise<DashboardData> {
  const [hub, sport, quest, lichaam, dagboek, voeding, kracht, duur] = await Promise.all([
    openLocalDatabase(hubConfig),
    openLocalDatabase(sportConfig),
    openLocalDatabase(questConfig),
    openLocalDatabase(lichaamConfig),
    openLocalDatabase(dagboekConfig),
    openLocalDatabase(voedingConfig),
    openLocalDatabase(krachtConfig),
    openLocalDatabase(duurConfig)
  ]);
  try {
    const [shortcuts, activities, habits, checks, quests, sportLink, bodyDays, journal, food, strength, endurance] = await Promise.all([
      hub.list<Shortcut>('shortcuts'),
      sport.list<Activity>('activities'),
      quest.list<Habit>('habits'),
      quest.list<HabitCheck>('habitChecks'),
      quest.list<Quest>('quests'),
      quest.get<SportLink>('settings', 'sport-link'),
      lichaam.list<BodyDay>('days'),
      dagboek.list<JournalEntry>('entries'),
      voeding.list<FoodEntry>('entries'),
      kracht.list<StrengthSession>('sessions'),
      duur.list<EnduranceWorkout>('workouts')
    ]);
    return { activities, habits, checks, quests, sportLink, shortcuts, lichaamDates: bodyDays.map((day) => ({ date: day.date })), dagboekDates: journal.map((entry) => ({ date: entry.date })), voedingDates: food.map((entry) => ({ date: entry.date })), krachtDates: strength.map((session) => ({ date: session.date })), duurTotals: endurance.map((workout) => ({ date: workout.date, distanceM: workout.distanceM, durationSec: workout.durationSec })) };
  } finally {
    hub.close();
    sport.close();
    quest.close();
    lichaam.close();
    dagboek.close();
    voeding.close();
    kracht.close();
    duur.close();
  }
}
