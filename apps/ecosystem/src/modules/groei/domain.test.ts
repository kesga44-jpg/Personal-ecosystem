import { describe, expect, it } from 'vitest';
import {
  FIVE_STEPS,
  GROWTH_SYSTEM_LABEL,
  checkId,
  filterGoals,
  findGoalCycle,
  goalOverview,
  groeiLookupItems,
  groeiSummary,
  habitStreak,
  habitWeek,
  parseEuros,
  sortActions,
  tenTenResult,
  validateAction,
  validateGoal,
  validateGroeiBackup,
  validateHabit,
  weekStart,
  withActionStatus,
  type Action,
  type Goal,
  type Habit,
  type HabitCheck
} from './domain';
import { databaseConfig } from './storage';

const T = '2026-11-22T10:00:00.000Z';

function goal(partial: Partial<Goal> = {}): Goal {
  return { id: 'g1', title: 'Marathon lopen', description: '', parentId: null, area: 'Sport', status: 'actief', targetDate: '2027-04-01', measure: 'Finish', progress: 20, createdAt: T, updatedAt: T, ...partial };
}
function action(partial: Partial<Action> = {}): Action {
  return { id: 'a1', title: 'Schema maken', notes: '', status: 'open', goalId: 'g1', skillId: null, dueDate: null, doneAt: null, createdAt: T, updatedAt: T, ...partial };
}
function habit(partial: Partial<Habit> = {}): Habit {
  return { id: 'h1', title: 'Lezen', frequency: 'dagelijks', weeklyTarget: 7, goalId: null, archived: false, createdAt: T, updatedAt: T, ...partial };
}

describe('The Ultimate Growth System staat er letterlijk (ADR 0023 § 4)', () => {
  it('aanduiding en vijf stappen', () => {
    expect(GROWTH_SYSTEM_LABEL).toBe('1-1-5-3-1-35-30-5-10-10');
    expect([...FIVE_STEPS]).toEqual(['Study the material', 'Extract 3 best ideas', 'Act and implement', 'Measure improvement (30 days)', 'Review and adjust']);
  });
});

describe('validatie', () => {
  it('accepteert een geldig doel en weigert fouten', () => {
    expect(() => validateGoal(goal())).not.toThrow();
    expect(() => validateGoal(goal({ title: ' ' }))).toThrow();
    expect(() => validateGoal(goal({ progress: 101 }))).toThrow();
    expect(() => validateGoal(goal({ parentId: 'g1' }))).toThrow();
    expect(() => validateGoal(goal({ status: 'klaar' as never }))).toThrow();
    expect(() => validateGoal(goal({ targetDate: '2026-02-30' }))).toThrow();
  });

  it('een afgeronde actie heeft een datum van afronden', () => {
    expect(() => validateAction(action({ status: 'klaar', doneAt: null }))).toThrow();
    expect(() => validateAction(action({ status: 'klaar', doneAt: '2026-11-22' }))).not.toThrow();
    expect(() => validateAction(action({ status: 'open', doneAt: '2026-11-22' }))).toThrow();
  });

  it('een dagelijkse gewoonte heeft weekdoel 7', () => {
    expect(() => validateHabit(habit({ weeklyTarget: 3 }))).toThrow();
    expect(() => validateHabit(habit({ frequency: 'wekelijks', weeklyTarget: 3 }))).not.toThrow();
  });

  it('vindt een kring in subdoelen', () => {
    expect(findGoalCycle([goal({ id: 'a', parentId: 'b' }), goal({ id: 'b', parentId: 'a' })])).not.toBeNull();
    expect(findGoalCycle([goal({ id: 'a', parentId: null }), goal({ id: 'b', parentId: 'a' })])).toBeNull();
  });

  it('controleert een back-up volledig en weigert een ontbrekende store', () => {
    const stores = { goals: [goal()], skills: [], habits: [habit()], habitChecks: [{ id: 'h1:2026-11-22', habitId: 'h1', date: '2026-11-22' }], actions: [action()], evaluations: [], tenTen: [], settings: [], links: [] };
    expect(() => validateGroeiBackup({ stores })).not.toThrow();
    const { links: _links, ...missing } = stores;
    expect(() => validateGroeiBackup({ stores: missing })).toThrow('links');
    expect(() => validateGroeiBackup({ stores: { ...stores, habitChecks: [{ id: 'x', habitId: 'h1', date: '2026-11-22' }] } })).toThrow();
  });

  it('database en stores van Groei', () => {
    expect(databaseConfig.databaseName).toBe('personal-ecosystem-groei');
    expect([...databaseConfig.stores]).toContain('links');
  });
});

describe('gewoontes', () => {
  const checks: HabitCheck[] = ['2026-11-20', '2026-11-21', '2026-11-22'].map((date) => ({ id: checkId('h1', date), habitId: 'h1', date }));
  it('week begint op maandag', () => {
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
  });
  it('telt de week en de reeks', () => {
    expect(habitWeek(habit(), checks, '2026-11-22')).toEqual({ done: 3, target: 7, reached: false });
    expect(habitStreak('h1', checks, '2026-11-22')).toBe(3);
    expect(habitStreak('h1', checks, '2026-11-23')).toBe(3);
    expect(habitStreak('h1', checks, '2026-11-24')).toBe(0);
  });
});

describe('doelen en acties', () => {
  it('zoekt, filtert en sorteert', () => {
    const goals = [goal({ id: 'a', title: 'Boek schrijven', area: 'Werk', progress: 50 }), goal({ id: 'b', title: 'Marathon', progress: 80 }), goal({ id: 'c', title: 'Spaans', status: 'behaald' })];
    expect(filterGoals(goals, { query: 'boek' }).map((g) => g.id)).toEqual(['a']);
    expect(filterGoals(goals, { status: 'actief', sort: 'voortgang' }).map((g) => g.id)).toEqual(['b', 'a']);
    expect(filterGoals(goals, { area: 'Werk' }).map((g) => g.id)).toEqual(['a']);
  });

  it('overzicht met subdoelen en acties', () => {
    const goals = [goal({ id: 'p' }), goal({ id: 'c1', parentId: 'p', progress: 40 }), goal({ id: 'c2', parentId: 'p', progress: 60 })];
    const overview = goalOverview(goals, [action({ goalId: 'p' }), action({ id: 'a2', goalId: 'p', status: 'klaar', doneAt: '2026-11-20' })]);
    expect(overview.find((item) => item.goal.id === 'p')).toMatchObject({ subgoals: 2, childProgress: 50, actionsOpen: 1, actionsDone: 1 });
  });

  it('acties: te laat eerst, afgerond onderaan; status houdt datum consistent', () => {
    const list = sortActions([action({ id: 'klaar', status: 'klaar', doneAt: '2026-11-01' }), action({ id: 'later', dueDate: '2026-12-01' }), action({ id: 'telaat', dueDate: '2026-11-01' })], '2026-11-22');
    expect(list.map((a) => a.id)).toEqual(['telaat', 'later', 'klaar']);
    const done = withActionStatus(action(), 'klaar', '2026-11-22');
    expect(done.doneAt).toBe('2026-11-22');
    expect(withActionStatus(done, 'open', '2026-11-23').doneAt).toBeNull();
  });
});

describe('10/10-regel (ADR 0027 § 4)', () => {
  it('berekent percentages tegen 10 %', () => {
    expect(tenTenResult({ incomeCents: 300000, othersCents: 30000, developmentCents: 15000 })).toMatchObject({ othersPct: 10, developmentPct: 5, othersReached: true, developmentReached: false, othersTargetCents: 30000 });
    expect(tenTenResult({ incomeCents: 0, othersCents: 100, developmentCents: 0 }).othersPct).toBeNull();
  });
  it('leest bedragen in euro', () => {
    expect(parseEuros('1.250,50')).toBe(125050);
    expect(parseEuros('12.5')).toBe(1250);
    expect(parseEuros('')).toBe(0);
    expect(() => parseEuros('abc')).toThrow();
  });
});

describe('leescontracten', () => {
  it('Lookup geeft alleen id, titel en soort; gewoonte zonder soort', () => {
    const items = groeiLookupItems(['g1', 'h1', 'a1', 'onbekend'], { goals: [goal({ description: 'privé' })], skills: [], actions: [action()], habits: [habit()] });
    expect(items).toEqual([
      { id: 'g1', title: 'Marathon lopen', kind: 'doel' },
      { id: 'a1', title: 'Schema maken', kind: 'actie' },
      { id: 'h1', title: 'Lezen' }
    ]);
    expect(JSON.stringify(items)).not.toContain('privé');
  });

  it('dashboard ziet alleen tellers', () => {
    const summary = groeiSummary({ goals: [goal(), goal({ id: 'x', status: 'behaald' })], actions: [action({ dueDate: '2026-11-01' })], habits: [habit()], checks: [] }, '2026-11-22');
    expect(summary).toEqual({ activeGoals: 1, openActions: 1, overdueActions: 1, habitsOpenToday: 1 });
  });
});
