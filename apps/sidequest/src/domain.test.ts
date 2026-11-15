import { describe, expect, it } from 'vitest';
import {
  calculateHabitStreak,
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
