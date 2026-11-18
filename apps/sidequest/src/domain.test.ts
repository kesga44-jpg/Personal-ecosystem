import { describe, expect, it } from 'vitest';
import {
  advanceQuest,
  calculateHabitStreak,
  daysUntilDeadline,
  editQuest,
  normalizeQuest,
  sortActiveQuests,
  toggleQuestStep,
  validateQuest,
  calculatePoints,
  currentPeriodChecks,
  validateSidequestBackup,
  validateProgress,
  type Habit,
  type HabitCheck,
  type Quest
} from './domain';

describe('SIDEQUEST rules', () => {
  const daily: Habit = {
    id: 'walk',
    title: 'Wandelen',
    frequency: 'daily',
    weeklyTarget: 1,
    archived: false,
    createdAt: '2026-11-01'
  };
  const checks: HabitCheck[] = [
    { id: '1', habitId: 'walk', date: '2026-11-13' },
    { id: '2', habitId: 'walk', date: '2026-11-14' }
  ];

  it('calculates daily streaks without penalizing an uncompleted current day', () => {
    expect(calculateHabitStreak(daily, checks, '2026-11-15')).toBe(2);
    expect(calculateHabitStreak(daily, checks, '2026-11-17')).toBe(0);
  });

  it('counts this week against the configured weekly habit target', () => {
    const weekly: Habit = { ...daily, frequency: 'weekly', weeklyTarget: 2 };
    const weeklyChecks: HabitCheck[] = [
      { id: 'a', habitId: 'walk', date: '2026-11-09' },
      { id: 'b', habitId: 'walk', date: '2026-11-11' },
      { id: 'c', habitId: 'walk', date: '2026-11-14' }
    ];
    expect(currentPeriodChecks(weekly, weeklyChecks, '2026-11-15')).toBe(3);
    expect(calculateHabitStreak(weekly, weeklyChecks, '2026-11-15')).toBe(1);
  });

  it('does not count a weekly streak when that week misses the configured target', () => {
    const weekly: Habit = { ...daily, frequency: 'weekly', weeklyTarget: 3 };
    const weeklyChecks: HabitCheck[] = [
      { id: 'a', habitId: 'walk', date: '2026-11-02' },
      { id: 'b', habitId: 'walk', date: '2026-11-04' },
      { id: 'c', habitId: 'walk', date: '2026-11-09' }
    ];
    expect(calculateHabitStreak(weekly, weeklyChecks, '2026-11-15')).toBe(0);
  });

  it('awards only recorded habit checks and completed quest rewards', () => {
    const quests: Quest[] = [
      {
        id: 'q1',
        title: 'Eerste stap',
        description: '',
        target: 1,
        progress: 1,
        rewardPoints: 25,
        status: 'completed',
        completedAt: '2026-11-14',
        createdAt: '2026-11-10'
      },
      {
        id: 'q2',
        title: 'Nog bezig',
        description: '',
        target: 3,
        progress: 1,
        rewardPoints: 40,
        status: 'active',
        completedAt: null,
        createdAt: '2026-11-12'
      }
    ];
    expect(calculatePoints(checks, quests)).toBe(35);
  });

  it('rejects invalid goal and quest progress', () => {
    expect(() => validateProgress(2, 5)).not.toThrow();
    expect(() => validateProgress(6, 5)).toThrow('tussen nul');
    expect(() => validateProgress(1, 0)).toThrow('tussen nul');
  });

  it('rejects inconsistent quest records before restoring SIDEQUEST data', () => {
    expect(() => validateSidequestBackup({
      stores: {
        goals: [],
        habits: [],
        habitChecks: [],
        quests: [{
          id: 'q1',
          title: 'Impossible state',
          description: '',
          target: 2,
          progress: 2,
          rewardPoints: 10,
          status: 'active',
          completedAt: null,
          createdAt: '2026-11-15T00:00:00Z'
        }]
      }
    })).toThrow('ongeldige questgegevens');
  });

  it('accepts an empty app-scoped backup', () => {
    expect(() => validateSidequestBackup({
      stores: { goals: [], habits: [], habitChecks: [], quests: [] }
    })).not.toThrow();
  });
});

describe('SIDEQUEST quest-stappen, categorieën en deadlines', () => {
  const now = '2026-11-18T10:00:00.000Z';
  const base: Quest = {
    id: 'q',
    title: 'Fiets opknappen',
    description: '',
    target: 3,
    progress: 0,
    rewardPoints: 30,
    status: 'active',
    completedAt: null,
    createdAt: '2026-11-18T09:00:00.000Z',
    category: 'Huis',
    deadline: '2026-11-25',
    steps: [
      { id: 's1', title: 'Banden plakken', done: false },
      { id: 's2', title: 'Ketting smeren', done: false },
      { id: 's3', title: 'Remmen afstellen', done: false }
    ]
  };

  it('vult ontbrekende velden van oude quests aan zonder iets anders te veranderen', () => {
    const old: Quest = { id: 'o', title: 'Oud', description: '', target: 2, progress: 1, rewardPoints: 5, status: 'active', completedAt: null, createdAt: now };
    expect(normalizeQuest(old)).toEqual({ ...old, category: 'Overig', deadline: null, steps: [] });
    expect(() => validateQuest(old)).not.toThrow();
  });

  it('telt afgevinkte stappen als voortgang en voltooit de quest bij de laatste stap', () => {
    let quest = toggleQuestStep(base, 's1', now);
    expect(quest).toMatchObject({ progress: 1, status: 'active', completedAt: null });
    quest = toggleQuestStep(quest, 's1', now);
    expect(quest.progress).toBe(0);
    quest = toggleQuestStep(toggleQuestStep(toggleQuestStep(quest, 's1', now), 's2', now), 's3', now);
    expect(quest).toMatchObject({ progress: 3, target: 3, status: 'completed', completedAt: now });
    expect(calculatePoints([], [quest])).toBe(30);
  });

  it('houdt een voltooide quest vast, zodat punten niet verdwijnen of dubbel tellen', () => {
    const done = { ...base, steps: base.steps!.map((step) => ({ ...step, done: true })), progress: 3, status: 'completed' as const, completedAt: now };
    expect(toggleQuestStep(done, 's1', '2026-11-19T00:00:00.000Z')).toBe(done);
    expect(advanceQuest(done)).toBe(done);
    expect(() => editQuest(done, { title: 'x', description: '', category: 'Huis', deadline: null, rewardPoints: 1, steps: [] })).toThrow('voltooide quest');
  });

  it('negeert de teller bij een quest met benoemde stappen en een onbekende stap', () => {
    expect(advanceQuest(base)).toBe(base);
    expect(toggleQuestStep(base, 'bestaat-niet')).toBe(base);
  });

  it('zet bij een tellerquest één stap tegelijk en voltooit bij het doel', () => {
    const counter: Quest = { ...base, steps: [], target: 2 };
    const once = advanceQuest(counter, now);
    expect(once).toMatchObject({ progress: 1, status: 'active' });
    expect(advanceQuest(once, now)).toMatchObject({ progress: 2, status: 'completed', completedAt: now });
  });

  it('laat doel en voortgang bij bewerken volgen uit de stappen', () => {
    const started = toggleQuestStep(base, 's1', now);
    const edited = editQuest(started, {
      title: ' Fiets klaar ',
      description: '',
      category: '',
      deadline: '',
      rewardPoints: 40,
      steps: [...started.steps!.filter((step) => step.id !== 's3'), { id: 's4', title: 'Lamp vervangen', done: false }, { id: 's5', title: 'Proefrit', done: false }]
    }, now);
    expect(edited).toMatchObject({ title: 'Fiets klaar', category: 'Overig', deadline: null, target: 4, progress: 1, rewardPoints: 40, status: 'active' });
  });

  it('voltooit de quest als na bewerken alle overgebleven stappen gedaan zijn', () => {
    const started = toggleQuestStep(base, 's1', now);
    const edited = editQuest(started, { title: 'Kort', description: '', category: 'Huis', deadline: null, rewardPoints: 10, steps: [started.steps![0]!] }, now);
    expect(edited).toMatchObject({ target: 1, progress: 1, status: 'completed', completedAt: now });
  });

  it('weigert ongeldige stappen, categorieën en deadlines', () => {
    expect(() => validateQuest(base)).not.toThrow();
    expect(() => validateQuest({ ...base, steps: [{ id: 's1', title: '  ', done: false }], target: 1 })).toThrow('Controleer de quest');
    expect(() => validateQuest({ ...base, progress: 2 })).toThrow();
    expect(() => validateQuest({ ...base, target: 4 })).toThrow();
    expect(() => validateQuest({ ...base, category: ' ' })).toThrow();
    expect(() => validateQuest({ ...base, deadline: '2026-02-30' })).toThrow();
    expect(() => validateQuest({ ...base, steps: [base.steps![0]!, base.steps![0]!], target: 2 })).toThrow();
    const many = Array.from({ length: 31 }, (_, index) => ({ id: `s${index}`, title: `Stap ${index}`, done: false }));
    expect(() => validateQuest({ ...base, steps: many, target: 31 })).toThrow();
  });

  it('valideert nieuwe velden ook bij herstel uit een back-up', () => {
    const stores = (quest: unknown) => ({ stores: { goals: [], habits: [], habitChecks: [], quests: [quest] } });
    expect(() => validateSidequestBackup(stores(base))).not.toThrow();
    expect(() => validateSidequestBackup(stores({ ...base, steps: 'kapot' }))).toThrow('ongeldige questgegevens');
    expect(() => validateSidequestBackup(stores({ ...base, deadline: 'morgen' }))).toThrow('ongeldige questgegevens');
  });

  it('rekent dagen tot de deadline en sorteert op de eerstvolgende deadline', () => {
    expect(daysUntilDeadline(base, '2026-11-18')).toBe(7);
    expect(daysUntilDeadline(base, '2026-11-25')).toBe(0);
    expect(daysUntilDeadline(base, '2026-11-27')).toBe(-2);
    expect(daysUntilDeadline({ ...base, deadline: null }, '2026-11-18')).toBeNull();
    const late = { ...base, id: 'late', deadline: '2026-12-31' };
    const none = { ...base, id: 'none', deadline: null, createdAt: '2026-11-19T00:00:00.000Z' };
    const { deadline: _unused, ...withoutDeadline } = base;
    const older: Quest = { ...withoutDeadline, id: 'older', createdAt: '2026-11-01T00:00:00.000Z' };
    expect(sortActiveQuests([none, late, older, base]).map((quest) => quest.id)).toEqual(['q', 'late', 'none', 'older']);
  });
});
