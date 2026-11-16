import { describe, expect, it } from 'vitest';
import type { Habit, HabitCheck, Quest } from '@ecosystem/sidequest/domain';
import { checkHeatmap, daysSince, greeting, habitsToday, lastDays, pointsPerDay, sportWeek, topStreaks } from './summary';

const habit = (id: string, title: string, frequency: 'daily' | 'weekly' = 'daily', archived = false): Habit =>
  ({ id, title, frequency, weeklyTarget: 3, archived, createdAt: '2026-11-01T08:00:00.000Z' });
const check = (habitId: string, date: string): HabitCheck => ({ id: `${habitId}:${date}`, habitId, date });

describe('lastDays', () => {
  it('geeft oplopende datums tot en met vandaag', () => {
    expect(lastDays('2026-11-16', 3)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(lastDays('2026-03-01', 2)).toEqual(['2026-02-28', '2026-03-01']);
  });
});

describe('sportWeek', () => {
  it('telt minuten per dag en negeert oudere activiteiten', () => {
    const week = sportWeek([
      { startedAt: new Date('2026-11-16T09:00:00').toISOString(), durationMinutes: 30, distanceKm: 5 },
      { startedAt: new Date('2026-11-16T18:00:00').toISOString(), durationMinutes: 15, distanceKm: null },
      { startedAt: new Date('2026-11-12T09:00:00').toISOString(), durationMinutes: 40, distanceKm: 2.25 },
      { startedAt: new Date('2026-11-01T09:00:00').toISOString(), durationMinutes: 99, distanceKm: 10 }
    ], '2026-11-16');
    expect(week.points).toHaveLength(7);
    expect(week.points.at(-1)).toEqual({ label: 'ma', value: 45 });
    expect(week.totalMinutes).toBe(85);
    expect(week.count).toBe(3);
    expect(week.totalKm).toBe(7.3);
  });
});

describe('gewoontes', () => {
  const habits = [habit('a', 'Lezen'), habit('b', 'Water'), habit('c', 'Sporten', 'weekly'), habit('d', 'Oud', 'daily', true)];
  const checks = [check('a', '2026-11-16'), check('a', '2026-11-15'), check('a', '2026-11-14'), check('b', '2026-11-15')];

  it('telt alleen actieve dagelijkse gewoontes voor vandaag', () => {
    expect(habitsToday(habits, checks, '2026-11-16')).toEqual({ done: 1, total: 2, open: ['Water'] });
  });

  it('sorteert streaks van hoog naar laag', () => {
    expect(topStreaks(habits, checks, '2026-11-16')).toEqual([{ title: 'Lezen', streak: 3 }, { title: 'Water', streak: 1 }]);
  });

  it('maakt een heatmap van 28 dagen', () => {
    const days = checkHeatmap(checks, '2026-11-16');
    expect(days).toHaveLength(28);
    expect(days.at(-2)).toEqual({ date: '2026-11-15', value: 2 });
  });
});

describe('pointsPerDay', () => {
  it('telt punten voor checks en voltooide quests', () => {
    const quests: Quest[] = [
      { id: 'q', title: 'x', description: '', target: 1, progress: 1, rewardPoints: 50, status: 'completed', completedAt: new Date('2026-11-16T10:00:00').toISOString(), createdAt: '2026-11-01T00:00:00.000Z' },
      { id: 'r', title: 'y', description: '', target: 2, progress: 1, rewardPoints: 99, status: 'active', completedAt: null, createdAt: '2026-11-01T00:00:00.000Z' }
    ];
    const points = pointsPerDay([check('a', '2026-11-16'), check('b', '2026-11-16')], quests, '2026-11-16');
    expect(points).toHaveLength(14);
    expect(points.at(-1)).toEqual({ label: '16', value: 60 });
  });
});

describe('hulpfuncties', () => {
  it('groet passend bij het tijdstip', () => {
    expect(greeting(new Date('2026-11-16T08:00:00'))).toBe('Goedemorgen');
    expect(greeting(new Date('2026-11-16T20:00:00'))).toBe('Goedenavond');
  });
  it('rekent dagen sinds een datum', () => {
    expect(daysSince('2026-11-10T08:00:00.000Z', new Date('2026-11-16T09:00:00.000Z'))).toBe(6);
    expect(daysSince('geen datum', new Date())).toBeNull();
  });
});
