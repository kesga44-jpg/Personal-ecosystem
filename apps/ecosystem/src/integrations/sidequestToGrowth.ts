import type { LocalDatabase, LocalExport } from '@ecosystem/storage';
import { validateSidequestBackup, type Goal, type Habit, type HabitCheck } from '@ecosystem/sidequest/domain';
import {
  validateGoal,
  validateHabit,
  validateHabitCheck,
  type Goal as GrowthGoal,
  type Habit as GrowthHabit,
  type HabitCheck as GrowthHabitCheck
} from '../modules/groei/domain';

export type SidequestExport = LocalExport & {
  appId: 'sidequest';
  stores: LocalExport['stores'] & {
    goals: unknown[];
    habits: unknown[];
    habitChecks: unknown[];
  };
};

export interface GrowthMigrationPlan {
  goals: GrowthGoal[];
  habits: GrowthHabit[];
  checks: GrowthHabitCheck[];
  skipped: string[];
}

export interface GrowthMigrationResult {
  created: number;
  unchanged: number;
  conflicts: string[];
  skipped: string[];
}

export interface GrowthSidequestData {
  activeGoalCount: number;
  goalAreas: string[];
  habits: Habit[];
  checks: GrowthHabitCheck[];
  migrationStatus: string;
}

function migrationProblemDetails(result: GrowthMigrationResult): string {
  const issues = [...result.conflicts, ...result.skipped];
  if (!issues.length) return '';
  const examples = issues.slice(0, 3).join(' ');
  const more = issues.length > 3 ? ` ${issues.length - 3} overige aandachtspunten.` : '';
  return ` ${examples}${more}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asGrowthGoal(input: unknown): GrowthGoal {
  if (!isRecord(input)) throw new Error('Ongeldig SIDEQUEST-doel.');
  validateSidequestBackup({ stores: { goals: [input], habits: [], habitChecks: [], quests: [] } });
  const goal = input as unknown as Goal;
  if (typeof goal.target !== 'number' || goal.target <= 0 || typeof goal.progress !== 'number') {
    throw new Error('Doelwaarde of voortgang ontbreekt.');
  }
  const mapped: GrowthGoal = {
    id: goal.id,
    title: goal.title,
    description: `Gemigreerd uit SIDEQUEST. Doelwaarde: ${goal.target}; huidige voortgang: ${goal.progress}.`,
    parentId: null,
    area: goal.category,
    status: goal.status === 'active' ? 'actief' : goal.status === 'completed' ? 'behaald' : goal.status === 'archived' ? 'losgelaten' : invalidStatus(),
    targetDate: goal.targetDate,
    measure: `Doelwaarde ${goal.target}; voortgang ${goal.progress}/${goal.target}.`,
    progress: Math.max(0, Math.min(100, Math.round((goal.progress / goal.target) * 100))),
    createdAt: goal.createdAt,
    updatedAt: goal.createdAt
  };
  validateGoal(mapped);
  return mapped;
}

function asGrowthHabit(input: unknown): GrowthHabit {
  if (!isRecord(input)) throw new Error('Ongeldige SIDEQUEST-gewoonte.');
  validateSidequestBackup({ stores: { goals: [], habits: [input], habitChecks: [], quests: [] } });
  const habit = input as unknown as Habit;
  const mapped: GrowthHabit = {
    id: habit.id,
    title: habit.title,
    frequency: habit.frequency === 'daily' ? 'dagelijks' : 'wekelijks',
    weeklyTarget: habit.frequency === 'daily' ? 7 : habit.weeklyTarget,
    goalId: null,
    archived: habit.archived,
    createdAt: habit.createdAt,
    updatedAt: habit.createdAt
  };
  validateHabit(mapped);
  return mapped;
}

function invalidStatus(): never {
  throw new Error('Doelstatus kan niet naar Groei worden vertaald.');
}

function asGrowthCheck(input: unknown): GrowthHabitCheck {
  if (!isRecord(input)) throw new Error('Ongeldige SIDEQUEST-afvinking.');
  const check = input as unknown as HabitCheck;
  const mapped: GrowthHabitCheck = { id: check.id, habitId: check.habitId, date: check.date };
  validateHabitCheck(mapped);
  return mapped;
}

function requireSidequestExport(input: unknown): SidequestExport {
  if (!isRecord(input) || input.format !== 'personal-ecosystem-local-data' || input.appId !== 'sidequest' ||
      ![1, 2].includes(input.schemaVersion as number) || !isRecord(input.stores)) {
    throw new Error('De SIDEQUEST-back-up heeft geen geldig formaat.');
  }
  for (const store of ['goals', 'habits', 'habitChecks'] as const) {
    if (!Array.isArray(input.stores[store])) throw new Error(`De SIDEQUEST-back-up mist de store "${store}".`);
  }
  return input as unknown as SidequestExport;
}

function individually<T>(records: unknown[], type: string, map: (record: unknown) => T): { records: T[]; skipped: string[] } {
  const valid: T[] = [];
  const skipped: string[] = [];
  for (const [index, record] of records.entries()) {
    try {
      valid.push(map(record));
    } catch (cause) {
      const id = isRecord(record) && typeof record.id === 'string' ? record.id : `regel ${index + 1}`;
      const reason = cause instanceof Error ? cause.message : 'ongeldig record';
      skipped.push(`${type} "${id}" niet overgezet: ${reason}`);
    }
  }
  return { records: valid, skipped };
}

export function sidequestToGrowthPlan(input: unknown): GrowthMigrationPlan {
  const backup = requireSidequestExport(input);
  const goals = individually(backup.stores.goals, 'Doel', asGrowthGoal);
  const habits = individually(backup.stores.habits, 'Gewoonte', asGrowthHabit);
  const validHabitIds = new Set(habits.records.map((habit) => habit.id));
  const checks = individually(backup.stores.habitChecks, 'Afvinking', (record) => {
    const check = asGrowthCheck(record);
    if (!validHabitIds.has(check.habitId)) throw new Error('de bijbehorende gewoonte is niet overgezet.');
    return check;
  });
  return {
    goals: goals.records,
    habits: habits.records,
    checks: checks.records,
    skipped: [...goals.skipped, ...habits.skipped, ...checks.skipped]
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function copyStore<T extends { id: string }>(
  database: LocalDatabase,
  store: string,
  records: readonly T[],
  label: string,
  result: GrowthMigrationResult
): Promise<void> {
  for (const record of records) {
    if (await database.putIfAbsent(store, record)) {
      result.created += 1;
      continue;
    }
    const existing = await database.get<T>(store, record.id);
    if (existing && canonical(existing) === canonical(record)) result.unchanged += 1;
    else if (existing) result.conflicts.push(`${label} "${record.id}" bestaat al in Groei en is niet overschreven.`);
    else result.created += 1;
  }
}

async function processSidequest(
  sidequestExport: unknown,
  growthDatabase: LocalDatabase
): Promise<GrowthMigrationResult> {
  const plan = sidequestToGrowthPlan(sidequestExport);
  const result: GrowthMigrationResult = { created: 0, unchanged: 0, conflicts: [], skipped: plan.skipped };
  await copyStore(growthDatabase, 'goals', plan.goals, 'Doel', result);
  await copyStore(growthDatabase, 'habits', plan.habits, 'Gewoonte', result);
  await copyStore(growthDatabase, 'habitChecks', plan.checks, 'Afvinking', result);
  return result;
}

function compareStore<T extends { id: string }>(
  records: readonly T[],
  existingRecords: readonly T[],
  label: string,
  result: GrowthMigrationResult
): void {
  const existingById = new Map(existingRecords.map((record) => [record.id, record]));
  for (const record of records) {
    const existing = existingById.get(record.id);
    if (!existing) result.created += 1;
    else if (canonical(existing) === canonical(record)) result.unchanged += 1;
    else result.conflicts.push(`${label} "${record.id}" bestaat al in Groei en is niet overschreven.`);
  }
}

/** Alleen lezen; maakt de migratiestatus na een herstart opnieuw op uit bron en bestemming. */
export async function inspectSidequestToGrowth(sidequestExport: unknown, growthDatabase: LocalDatabase): Promise<GrowthMigrationResult> {
  const plan = sidequestToGrowthPlan(sidequestExport);
  const [goals, habits, checks] = await Promise.all([
    growthDatabase.list<GrowthGoal>('goals'),
    growthDatabase.list<GrowthHabit>('habits'),
    growthDatabase.list<GrowthHabitCheck>('habitChecks')
  ]);
  const result: GrowthMigrationResult = { created: 0, unchanged: 0, conflicts: [], skipped: plan.skipped };
  compareStore(plan.goals, goals, 'Doel', result);
  compareStore(plan.habits, habits, 'Gewoonte', result);
  compareStore(plan.checks, checks, 'Afvinking', result);
  return result;
}

/** Zet SIDEQUEST-records idempotent over; elke record is afzonderlijk herhaalbaar na een onderbreking. */
export function migrateSidequestToGrowth(sidequestExport: unknown, growthDatabase: LocalDatabase): Promise<GrowthMigrationResult> {
  return processSidequest(sidequestExport, growthDatabase);
}

export async function loadGrowthSidequestData(
  sidequestDatabase: LocalDatabase,
  growthDatabase: LocalDatabase
): Promise<GrowthSidequestData> {
  const [legacyGoals, legacyHabits, legacyChecks, goals, growthHabits, checks] = await Promise.all([
    sidequestDatabase.list<{ id: string }>('goals'),
    sidequestDatabase.list<{ id: string }>('habits'),
    sidequestDatabase.list<{ id: string }>('habitChecks'),
    growthDatabase.list<GrowthGoal>('goals'),
    growthDatabase.list<GrowthHabit>('habits'),
    growthDatabase.list<GrowthHabitCheck>('habitChecks')
  ]);
  const backup: SidequestExport = {
    format: 'personal-ecosystem-local-data',
    appId: 'sidequest',
    schemaVersion: sidequestDatabase.schemaVersion,
    exportedAt: new Date().toISOString(),
    stores: { goals: legacyGoals, habits: legacyHabits, habitChecks: legacyChecks }
  };
  const status = await inspectSidequestToGrowth(backup, growthDatabase);
  const sourceCount = ['goals', 'habits', 'habitChecks'].reduce((sum, store) => sum + backup.stores[store]!.length, 0);
  let migrationStatus: string;
  if (sourceCount === 0) {
    migrationStatus = 'Geen oude SIDEQUEST-doelen, gewoontes of checks gevonden.';
  } else if (status.created === 0 && status.conflicts.length === 0 && status.skipped.length === 0) {
    migrationStatus = 'Overdracht voltooid. De oorspronkelijke SIDEQUEST-records blijven bewaard als herstelbare back-upbron.';
  } else if (status.created === 0) {
    migrationStatus = `Alle migreerbare records staan al in Groei; ${status.conflicts.length} conflict(en) en ${status.skipped.length} niet-overzetbare record(s). De brongegevens zijn behouden.${migrationProblemDetails(status)}`;
  } else {
    migrationStatus = `${status.created} record(s) wachten op overdracht; ${status.conflicts.length} conflict(en) en ${status.skipped.length} niet-overzetbare record(s). De brongegevens zijn behouden.${migrationProblemDetails(status)}`;
  }
  return {
    activeGoalCount: goals.filter((goal) => goal.status === 'actief').length,
    goalAreas: [...new Set(goals.map((goal) => goal.area).filter(Boolean))],
    habits: growthHabits.map((habit) => ({
      id: habit.id,
      title: habit.title,
      frequency: habit.frequency === 'dagelijks' ? 'daily' : 'weekly',
      weeklyTarget: habit.frequency === 'dagelijks' ? 1 : habit.weeklyTarget,
      archived: habit.archived,
      createdAt: habit.createdAt
    })),
    checks,
    migrationStatus
  };
}

export function migrationResultMessage(result: GrowthMigrationResult): string {
  return `${result.created} record(s) overgezet, ${result.unchanged} al gelijk, ${result.conflicts.length} conflict(en) niet overschreven, ${result.skipped.length} record(s) niet overgezet.${migrationProblemDetails(result)}`;
}
