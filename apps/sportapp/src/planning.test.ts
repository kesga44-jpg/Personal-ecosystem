import { describe, expect, it } from 'vitest';
import { validateSportBackup } from './domain';
import { emptyWeekGoal, isPlannedSession, isWeekGoal, mondayOf, planningCalendar, planStatus, validatePlanningStore, weekProgress, type PlannedSession } from './planning';

// Woensdag 18 november 2026.
const today = '2026-11-18';
const plan = (id: string, date: string, title = 'Hardlopen'): PlannedSession => ({ id, kind: 'plan', date, title, minutes: 45, trainingId: null });

describe('weekdoel', () => {
  it('rekent deze week van maandag t/m zondag over alle trainingen', () => {
    const sessions = [
      { date: '2026-11-15', minutes: 60 },
      { date: '2026-11-16', minutes: 30 },
      { date: '2026-11-18', minutes: 45 },
      { date: '2026-11-22', minutes: 20 },
      { date: '2026-11-23', minutes: 90 }
    ];
    expect(mondayOf(today)).toBe('2026-11-16');
    expect(weekProgress(sessions, emptyWeekGoal, today)).toEqual({ weekStart: '2026-11-16', sessions: 3, minutes: 95, goal: emptyWeekGoal, reached: null });
    expect(weekProgress(sessions, { ...emptyWeekGoal, sessions: 3 }, today).reached).toBe(true);
    expect(weekProgress(sessions, { ...emptyWeekGoal, sessions: 3, minutes: 120 }, today).reached).toBe(false);
    expect(weekProgress(sessions, { ...emptyWeekGoal, minutes: 95 }, today).reached).toBe(true);
  });

  it('accepteert alleen redelijke doelen', () => {
    expect(isWeekGoal(emptyWeekGoal)).toBe(true);
    expect(isWeekGoal({ ...emptyWeekGoal, sessions: 3, minutes: 150 })).toBe(true);
    for (const bad of [{ ...emptyWeekGoal, sessions: 0 }, { ...emptyWeekGoal, sessions: 22 }, { ...emptyWeekGoal, minutes: 2.5 }, { ...emptyWeekGoal, id: 'x' }]) {
      expect(isWeekGoal(bad)).toBe(false);
    }
  });
});

describe('planning', () => {
  it('bepaalt de status uit vastgelegde trainingen op die dag', () => {
    const sessions = [{ date: '2026-11-17', minutes: 30 }];
    expect(planStatus(plan('a', '2026-11-17'), sessions, today)).toBe('gedaan');
    expect(planStatus(plan('b', '2026-11-16'), sessions, today)).toBe('gemist');
    expect(planStatus(plan('c', today), sessions, today)).toBe('gepland');
    expect(planStatus(plan('d', '2026-11-20'), sessions, today)).toBe('gepland');
  });

  it('maakt een kalender van twee weken vanaf maandag met plannen en trainingen per dag', () => {
    const calendar = planningCalendar([plan('b', '2026-11-25', 'Zwemmen'), plan('a', '2026-11-25', 'Fietsen'), plan('c', '2026-12-01')], [{ date: '2026-11-17', minutes: 30 }, { date: '2026-11-17', minutes: 15 }], today);
    expect(calendar).toHaveLength(14);
    expect(calendar[0]!.date).toBe('2026-11-16');
    expect(calendar[13]!.date).toBe('2026-11-29');
    expect(calendar[1]).toMatchObject({ date: '2026-11-17', sessions: 2, minutes: 45 });
    expect(calendar[9]!.plans.map((item) => item.title)).toEqual(['Fietsen', 'Zwemmen']);
    expect(calendar.flatMap((day) => day.plans).some((item) => item.id === 'c')).toBe(false);
  });

  it('controleert geplande trainingen en de planning bij herstel', () => {
    expect(isPlannedSession(plan('a', today))).toBe(true);
    for (const bad of [plan('a', '2026-02-30'), { ...plan('a', today), title: ' ' }, { ...plan('a', today), minutes: 0 }, { ...plan('week-goal', today) }]) {
      expect(isPlannedSession(bad)).toBe(false);
    }
    expect(() => validatePlanningStore(undefined)).not.toThrow();
    expect(() => validatePlanningStore([emptyWeekGoal, plan('a', today)])).not.toThrow();
    expect(() => validatePlanningStore([emptyWeekGoal, emptyWeekGoal])).toThrow('ongeldige planning');
    expect(() => validatePlanningStore([{ id: 'x' }])).toThrow('ongeldige planning');
    expect(() => validatePlanningStore('kapot')).toThrow('ongeldige planning');
  });

  it('accepteert Sport-back-ups met en zonder planning', () => {
    const base = { activities: [], trainings: [] };
    expect(() => validateSportBackup({ stores: base })).not.toThrow();
    expect(() => validateSportBackup({ stores: { ...base, planning: [plan('a', today)] } })).not.toThrow();
    expect(() => validateSportBackup({ stores: { ...base, planning: [{ id: 'x', kind: 'plan' }] } })).toThrow('ongeldige planning');
  });
});
