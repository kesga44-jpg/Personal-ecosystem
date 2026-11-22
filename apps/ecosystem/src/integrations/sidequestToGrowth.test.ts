import { afterEach, describe, expect, it } from 'vitest';
import { openLocalDatabase, type LocalDatabase } from '@ecosystem/storage';
import { databaseConfig as sidequestConfig } from '@ecosystem/sidequest/App';
import type { Goal, Habit, HabitCheck } from '@ecosystem/sidequest/domain';
import { databaseConfig as growthConfig } from '../modules/groei/storage';
import type { Goal as GrowthGoal, Habit as GrowthHabit, HabitCheck as GrowthCheck } from '../modules/groei/domain';
import {
  loadGrowthSidequestData,
  migrateSidequestToGrowth,
  sidequestToGrowthPlan
} from './sidequestToGrowth';

const opened: LocalDatabase[] = [];
let sequence = 0;
const timestamp = '2026-11-01T10:00:00.000Z';

function uniqueConfig(config: typeof sidequestConfig | typeof growthConfig) {
  return { ...config, databaseName: `${config.databaseName}-a7-test-${++sequence}` };
}

async function openPair() {
  const sidequest = await openLocalDatabase(uniqueConfig(sidequestConfig));
  const growth = await openLocalDatabase(uniqueConfig(growthConfig));
  opened.push(sidequest, growth);
  return { sidequest, growth };
}

function legacyGoal(partial: Partial<Goal> = {}): Goal {
  return { id: 'g1', title: 'Meer lezen', category: 'Leren', targetDate: '2026-12-01', target: 10, progress: 4, status: 'active', createdAt: timestamp, ...partial };
}

function legacyHabit(partial: Partial<Habit> = {}): Habit {
  return { id: 'h1', title: 'Lezen', frequency: 'daily', weeklyTarget: 1, archived: false, createdAt: timestamp, ...partial };
}

function legacyCheck(habitId = 'h1', date = '2026-11-21'): HabitCheck {
  return { id: `${habitId}:${date}`, habitId, date };
}

async function seedSource(database: LocalDatabase, goal = legacyGoal(), habit = legacyHabit()) {
  await database.put('goals', goal);
  await database.put('habits', habit);
  await database.put('habitChecks', legacyCheck(habit.id));
}

afterEach(() => {
  for (const database of opened.splice(0)) database.close();
});

describe('SIDEQUEST → Groei', () => {
  it('migreert doelen, gewoontes en checks zonder brondata te verwijderen', async () => {
    const { sidequest, growth } = await openPair();
    await seedSource(sidequest);

    await expect(migrateSidequestToGrowth(await sidequest.exportData(), growth)).resolves.toMatchObject({
      created: 3, unchanged: 0, conflicts: [], skipped: []
    });
    expect(await growth.get<GrowthGoal>('goals', 'g1')).toMatchObject({ id: 'g1', status: 'actief', progress: 40 });
    expect(await growth.get<GrowthHabit>('habits', 'h1')).toMatchObject({ id: 'h1', frequency: 'dagelijks', weeklyTarget: 7 });
    expect(await growth.get<GrowthCheck>('habitChecks', 'h1:2026-11-21')).toEqual(legacyCheck());
    expect(await sidequest.get('goals', 'g1')).toEqual(legacyGoal());
    expect(await sidequest.get('habits', 'h1')).toEqual(legacyHabit());
    expect(await sidequest.get('habitChecks', 'h1:2026-11-21')).toEqual(legacyCheck());
  });

  it('is na herstart opnieuw te beoordelen en herhaald uitvoeren maakt geen duplicaten', async () => {
    const pair = await openPair();
    await seedSource(pair.sidequest);
    const backup = await pair.sidequest.exportData();
    await migrateSidequestToGrowth(backup, pair.growth);
    pair.sidequest.close();
    pair.growth.close();

    const sidequest = await openLocalDatabase({ ...sidequestConfig, databaseName: 'a7-restart-sidequest' });
    const growth = await openLocalDatabase({ ...growthConfig, databaseName: 'a7-restart-growth' });
    opened.push(sidequest, growth);
    await seedSource(sidequest);
    await migrateSidequestToGrowth(await sidequest.exportData(), growth);
    const status = await loadGrowthSidequestData(sidequest, growth);

    expect(status.migrationStatus).toContain('Overdracht voltooid');
    expect(status.habits).toHaveLength(1);
    expect(status.checks).toHaveLength(1);
    expect(await growth.list('goals')).toHaveLength(1);
    expect(await growth.list('habits')).toHaveLength(1);
    expect(await growth.list('habitChecks')).toHaveLength(1);
    expect(await migrateSidequestToGrowth(backup, growth)).toMatchObject({ created: 0, unchanged: 3, conflicts: [], skipped: [] });
  });

  it('kan doorgaan na een gedeeltelijke schrijffout zonder de al geschreven records te verdubbelen', async () => {
    const { sidequest, growth } = await openPair();
    await seedSource(sidequest);
    const backup = await sidequest.exportData();
    const failing = Object.create(growth) as LocalDatabase;
    const originalPutIfAbsent = growth.putIfAbsent.bind(growth);
    let injected = false;
    failing.putIfAbsent = async <T extends { id: string }>(store: string, value: T) => {
      if (store === 'habits' && !injected) {
        injected = true;
        throw new Error('testopslagfout');
      }
      return originalPutIfAbsent(store, value);
    };

    await expect(migrateSidequestToGrowth(backup, failing)).rejects.toThrow('testopslagfout');
    expect(await growth.list('goals')).toHaveLength(1);
    const resumed = await migrateSidequestToGrowth(backup, growth);

    expect(resumed).toMatchObject({ created: 2, unchanged: 1, conflicts: [], skipped: [] });
    expect(await growth.list('goals')).toHaveLength(1);
    expect(await growth.list('habits')).toHaveLength(1);
    expect(await growth.list('habitChecks')).toHaveLength(1);
  });

  it('meldt conflicten en overschrijft het bestaande Groei-record nooit', async () => {
    const { sidequest, growth } = await openPair();
    await seedSource(sidequest);
    const different: GrowthGoal = {
      id: 'g1', title: 'Eigen doel', description: '', parentId: null, area: 'Werk',
      status: 'actief', targetDate: null, measure: '', progress: 0, createdAt: timestamp, updatedAt: timestamp
    };
    await growth.put('goals', different);

    const result = await migrateSidequestToGrowth(await sidequest.exportData(), growth);
    expect(result.conflicts).toEqual(['Doel "g1" bestaat al in Groei en is niet overschreven.']);
    expect(await growth.get('goals', 'g1')).toEqual(different);
    expect(result.created).toBe(2);
    await migrateSidequestToGrowth(await sidequest.exportData(), growth);
    await expect(loadGrowthSidequestData(sidequest, growth)).resolves.toMatchObject({
      migrationStatus: expect.stringContaining('Alle migreerbare records staan al in Groei')
    });
  });

  it('herstelt eerst een SIDEQUEST-back-up en migreert daarna zonder de herstelbron te wissen', async () => {
    const source = await openLocalDatabase(uniqueConfig(sidequestConfig));
    const recovered = await openLocalDatabase(uniqueConfig(sidequestConfig));
    const growth = await openLocalDatabase(uniqueConfig(growthConfig));
    opened.push(source, recovered, growth);
    await seedSource(source);
    const backup = await source.exportData();

    await recovered.restore(backup);
    const result = await migrateSidequestToGrowth(await recovered.exportData(), growth);

    expect(result.created).toBe(3);
    expect(await recovered.get('goals', 'g1')).toEqual(legacyGoal());
    expect(await growth.get('habitChecks', 'h1:2026-11-21')).toEqual(legacyCheck());
  });

  it('laat niet-migreerbare oude records zichtbaar staan en gaat verder met geldige records', async () => {
    const { sidequest, growth } = await openPair();
    await seedSource(sidequest);
    await sidequest.put('goals', legacyGoal({ id: 'bad', status: 'mystery' as Goal['status'] }));
    await sidequest.put('habitChecks', { id: 'missing:2026-11-21', habitId: 'missing', date: '2026-11-21' });

    const result = await migrateSidequestToGrowth(await sidequest.exportData(), growth);

    expect(result.created).toBe(3);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.join(' ')).toContain('ongeldige doelgegevens');
    expect(result.skipped.join(' ')).toContain('bijbehorende gewoonte is niet overgezet');
    expect(await sidequest.get('goals', 'bad')).toBeDefined();
    expect(await sidequest.get('habitChecks', 'missing:2026-11-21')).toBeDefined();
  });

  it('leest Groei als enige runtimebron en laat bewerken aan Groei over', async () => {
    const { sidequest, growth } = await openPair();
    await seedSource(sidequest);
    await migrateSidequestToGrowth(await sidequest.exportData(), growth);
    const view = await loadGrowthSidequestData(sidequest, growth);
    expect(view).toMatchObject({
      activeGoalCount: 1,
      goalAreas: ['Leren'],
      habits: [{ id: 'h1', title: 'Lezen', frequency: 'daily' }],
      checks: [legacyCheck()]
    });

    expect(await sidequest.get<Habit>('habits', 'h1')).toEqual(legacyHabit());
    expect(await sidequest.get('habitChecks', 'h1:2026-11-22')).toBeUndefined();
    expect(await growth.get<GrowthHabit>('habits', 'h1')).toMatchObject({ title: 'Lezen' });
    expect(await growth.get<GrowthCheck>('habitChecks', 'h1:2026-11-21')).toEqual(legacyCheck());
  });

  it('maakt daily-frequentie van een Groei-gewoonte niet afhankelijk van oude SIDEQUEST-gegevens', () => {
    const plan = sidequestToGrowthPlan({
      format: 'personal-ecosystem-local-data',
      appId: 'sidequest',
      schemaVersion: 2,
      exportedAt: timestamp,
      stores: {
        goals: [],
        habits: [legacyHabit()],
        habitChecks: [legacyCheck()],
        quests: [],
        settings: []
      }
    });
    expect(plan.habits[0]).toMatchObject({ frequency: 'dagelijks', weeklyTarget: 7 });
    expect(plan.checks).toEqual([legacyCheck()]);
  });
});
