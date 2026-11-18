import { describe, expect, it } from 'vitest';
import { emptyData, type DashboardData } from './data';
import { difference, weekRange, weekReview } from './review';

// Woensdag 18 november 2026: vorige week is ma 9 t/m zo 15 november.
const today = '2026-11-18';
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();

describe('weekreview', () => {
  it('kiest hele weken van maandag t/m zondag', () => {
    expect(weekRange(today, 1)).toEqual({ start: '2026-11-09', end: '2026-11-15' });
    expect(weekRange(today, 2)).toEqual({ start: '2026-11-02', end: '2026-11-08' });
    expect(weekRange('2026-11-16', 1)).toEqual({ start: '2026-11-09', end: '2026-11-15' });
    expect(weekRange('2026-11-15', 1)).toEqual({ start: '2026-11-02', end: '2026-11-08' });
  });

  it('telt alleen de juiste week en vergelijkt met de week ervoor', () => {
    const data: DashboardData = {
      ...emptyData,
      activities: [
        { startedAt: at('2026-11-09'), durationMinutes: 30 },
        { startedAt: at('2026-11-15'), durationMinutes: 45 },
        { startedAt: at('2026-11-16'), durationMinutes: 99 },
        { startedAt: at('2026-11-03'), durationMinutes: 20 }
      ] as DashboardData['activities'],
      krachtDates: [{ date: '2026-11-11' }, { date: '2026-11-04' }],
      duurTotals: [{ date: '2026-11-12', distanceM: 5000, durationSec: 1530 }],
      checks: [
        { id: 'a', habitId: 'h', date: '2026-11-09' },
        { id: 'b', habitId: 'h', date: '2026-11-10' },
        { id: 'c', habitId: 'h', date: '2026-11-02' }
      ],
      quests: [
        { id: 'q', title: 'q', description: '', target: 1, progress: 1, rewardPoints: 40, status: 'completed', completedAt: at('2026-11-14'), createdAt: at('2026-11-01') },
        { id: 'r', title: 'r', description: '', target: 2, progress: 0, rewardPoints: 99, status: 'active', completedAt: null, createdAt: at('2026-11-01') }
      ],
      dagboekDates: [{ date: '2026-11-09' }, { date: '2026-11-09' }, { date: '2026-11-13' }],
      lichaamDates: [{ date: '2026-11-15' }],
      voedingDates: [{ date: '2026-11-08' }]
    };
    const { last, before } = weekReview(data, today, ['2026-11-09', '2026-11-12', '2026-11-04']);
    expect(last).toEqual({
      start: '2026-11-09',
      end: '2026-11-15',
      workouts: 4,
      activeMinutes: 101,
      habitChecks: 2,
      questsCompleted: 1,
      points: 2 * 5 + 40 + 2 * 10,
      journalDays: 2,
      bodyDays: 1,
      foodDays: 0
    });
    expect(before).toMatchObject({ workouts: 2, activeMinutes: 20, habitChecks: 1, points: 15, foodDays: 1 });
  });

  it('beschrijft het verschil kort', () => {
    expect(difference(5, 3)).toBe('+2');
    expect(difference(1, 4)).toBe('−3');
    expect(difference(2, 2)).toBe('gelijk');
  });
});
