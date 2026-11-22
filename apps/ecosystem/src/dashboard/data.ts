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
import { databaseConfig as groeiConfig } from '../modules/groei/storage';
import { groeiSummary, type Action, type Goal, type Habit as GrowthHabit, type HabitCheck as GrowthCheck } from '../modules/groei/domain';
import { insightsThisWeek, kennisSummary, type Insight, type LearningLog, type Source } from '../modules/kennis/domain';
import { databaseConfig as financienConfig } from '../modules/financien/storage';
import { financienSummary, type Budget, type Category, type InvestmentPlan, type Transaction } from '../modules/financien/domain';
import type { NutritionPlan, PlannedMeal } from '../modules/voeding/planner';
import { plannedTodaySummary } from '../modules/voeding/mealplan';

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
  /** Groei: alleen tellers (A16, DATA_OWNERSHIP.md). */
  groei: ReturnType<typeof groeiSummary> | null;
  /** Kennis: alleen tellers. */
  kennis: (ReturnType<typeof kennisSummary> & { insightsThisWeek: number }) | null;
  /** Financiën: alleen maandtotalen en tellers, geen omschrijvingen of tegenpartijen. */
  financien: ReturnType<typeof financienSummary> | null;
  /** Voeding-planning: alleen tellers voor vandaag. */
  maaltijden: ReturnType<typeof plannedTodaySummary> | null;
}

function todayKey(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export const emptyData: DashboardData = { activities: [], habits: [], checks: [], quests: [], sportLink: undefined, shortcuts: [], lichaamDates: [], dagboekDates: [], voedingDates: [], krachtDates: [], duurTotals: [], groei: null, kennis: null, financien: null, maaltijden: null };

export function lastBackup(): string {
  try {
    return localStorage.getItem('personal-ecosystem.backup.last-export') ?? '';
  } catch {
    return '';
  }
}

/** Leest alleen samenvattingen uit de modules (ADR 0020 § 2); het dashboard schrijft nooit in andere modules. */
export async function loadData(): Promise<DashboardData> {
  const [hub, sport, quest, lichaam, dagboek, voeding, kracht, duur, groei, financien] = await Promise.all([
    openLocalDatabase(hubConfig),
    openLocalDatabase(sportConfig),
    openLocalDatabase(questConfig),
    openLocalDatabase(lichaamConfig),
    openLocalDatabase(dagboekConfig),
    openLocalDatabase(voedingConfig),
    openLocalDatabase(krachtConfig),
    openLocalDatabase(duurConfig),
    openLocalDatabase(groeiConfig),
    openLocalDatabase(financienConfig)
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
    const today = todayKey();
    const [goals, actions, growthHabits, growthChecks, sources, insights, learningLog] = await Promise.all([
      groei.list<Goal>('goals'),
      groei.list<Action>('actions'),
      groei.list<GrowthHabit>('habits'),
      groei.list<GrowthCheck>('habitChecks'),
      groei.list<Source>('sources'),
      groei.list<Insight>('insights'),
      groei.list<LearningLog>('learningLog')
    ]);
    const [transactions, budgets, categories, investmentPlans, nutritionPlans, plannedMeals] = await Promise.all([
      financien.list<Transaction>('transactions'),
      financien.list<Budget>('budgets'),
      financien.list<Category>('categories'),
      financien.list<InvestmentPlan>('investmentPlans'),
      voeding.list<NutritionPlan>('nutritionPlans'),
      voeding.list<PlannedMeal>('plannedMeals')
    ]);
    const summaries = {
      groei: groeiSummary({ goals, actions, habits: growthHabits, checks: growthChecks }, today),
      kennis: { ...kennisSummary({ sources, insights, log: learningLog }, today), insightsThisWeek: insightsThisWeek(insights, today) },
      financien: financienSummary({ transactions, budgets, categories, plans: investmentPlans }, today),
      maaltijden: plannedTodaySummary(nutritionPlans, plannedMeals, food as { plannedMealId?: string }[], today)
    };
    return { activities, habits, checks, quests, sportLink, shortcuts, lichaamDates: bodyDays.map((day) => ({ date: day.date })), dagboekDates: journal.map((entry) => ({ date: entry.date })), voedingDates: food.map((entry) => ({ date: entry.date })), krachtDates: strength.map((session) => ({ date: session.date })), duurTotals: endurance.map((workout) => ({ date: workout.date, distanceM: workout.distanceM, durationSec: workout.durationSec })), ...summaries };
  } finally {
    hub.close();
    sport.close();
    quest.close();
    lichaam.close();
    dagboek.close();
    voeding.close();
    kracht.close();
    duur.close();
    groei.close();
    financien.close();
  }
}
