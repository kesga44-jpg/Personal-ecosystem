import { describe, expect, it } from 'vitest';
import { calculatePoints, type Habit, type HabitCheck, type Quest } from './domain';
import { activityCalendar, badges, levelInfo, levelThreshold, longestDailyStreak, pointsPerWeek, sidequestStats } from './progress';

const habit: Habit = { id: 'h', title: 'Lezen', frequency: 'daily', weeklyTarget: 1, archived: false, createdAt: '2026-10-01T00:00:00.000Z' };
const weekly: Habit = { ...habit, id: 'w', frequency: 'weekly', weeklyTarget: 3 };

function dailyChecks(habitId: string, from: string, count: number): HabitCheck[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${from}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const day = date.toISOString().slice(0, 10);
    return { id: `${habitId}:${day}`, habitId, date: day };
  });
}

function quest(id: string, overrides: Partial<Quest> = {}): Quest {
  return {
    id,
    title: id,
    description: '',
    target: 1,
    progress: 1,
    rewardPoints: 20,
    status: 'completed',
    completedAt: '2026-11-10T12:00:00.000Z',
    createdAt: '2026-11-06T12:00:00.000Z',
    ...overrides
  };
}

describe('levels', () => {
  it('gebruikt oplopende drempels: elk level kost 50 punten meer dan het vorige', () => {
    expect([1, 2, 3, 4, 5, 6].map(levelThreshold)).toEqual([0, 100, 250, 450, 700, 1000]);
    for (let level = 2; level < 30; level += 1) {
      expect(levelThreshold(level + 1) - levelThreshold(level)).toBe(levelThreshold(level) - levelThreshold(level - 1) + 50);
    }
  });

  it('berekent level en voortgang binnen het level', () => {
    expect(levelInfo(0)).toEqual({ level: 1, points: 0, levelStart: 0, nextAt: 100, progress: 0 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toMatchObject({ level: 2, levelStart: 100, nextAt: 250, progress: 0 });
    expect(levelInfo(175).progress).toBeCloseTo(0.5);
    expect(levelInfo(1000).level).toBe(6);
    expect(levelInfo(-5).level).toBe(1);
    expect(levelInfo(Number.NaN).level).toBe(1);
  });
});

describe('badges', () => {
  it('zijn alleen erkenning: ze veranderen de punten niet', () => {
    const checks = dailyChecks('h', '2026-11-01', 8);
    const quests = [quest('a')];
    const before = calculatePoints(checks, quests);
    badges([habit], checks, quests);
    expect(calculatePoints(checks, quests)).toBe(before);
  });

  it('geven de datum waarop een badge behaald werd en anders de voortgang', () => {
    const checks = dailyChecks('h', '2026-11-01', 8);
    const list = badges([habit], checks, [quest('a', { completedAt: '2026-11-05T12:00:00.000Z' })]);
    const byId = Object.fromEntries(list.map((badge) => [badge.id, badge]));
    expect(byId['eerste-check']).toMatchObject({ earnedOn: '2026-11-01', current: 1, target: 1 });
    expect(byId['eerste-quest']).toMatchObject({ earnedOn: '2026-11-05' });
    expect(byId['week-streak']).toMatchObject({ earnedOn: '2026-11-07', current: 7 });
    expect(byId['maand-streak']).toMatchObject({ earnedOn: null, current: 8, target: 30 });
    expect(byId['questjager']).toMatchObject({ earnedOn: null, current: 1, target: 10 });
  });

  it('telt een onderbroken reeks en wekelijkse gewoontes niet mee voor streakbadges', () => {
    const broken = [...dailyChecks('h', '2026-11-01', 4), ...dailyChecks('h', '2026-11-06', 4)];
    expect(badges([habit], broken, []).find((badge) => badge.id === 'week-streak')).toMatchObject({ earnedOn: null, current: 4 });
    expect(longestDailyStreak(dailyChecks('w', '2026-11-01', 10), [weekly])).toBe(0);
  });

  it('telt alleen quests die op of vóór de deadline voltooid zijn als op tijd', () => {
    const quests = [
      ...Array.from({ length: 4 }, (_, index) => quest(`t${index}`, { deadline: '2026-11-10' })),
      quest('laat', { deadline: '2026-11-09' }),
      quest('zonder'),
      quest('t4', { deadline: '2026-11-12', completedAt: '2026-11-12T12:00:00.000Z' })
    ];
    expect(badges([], [], quests).find((badge) => badge.id === 'op-tijd')).toMatchObject({ earnedOn: '2026-11-12', current: 5 });
  });

  it('bepaalt de datum van level 5 en 1000 punten uit het verloop van de punten', () => {
    const quests = [
      quest('a', { rewardPoints: 600, completedAt: '2026-11-01T12:00:00.000Z' }),
      quest('b', { rewardPoints: 100, completedAt: '2026-11-03T12:00:00.000Z' }),
      quest('c', { rewardPoints: 400, completedAt: '2026-11-08T12:00:00.000Z' })
    ];
    const byId = Object.fromEntries(badges([], [], quests).map((badge) => [badge.id, badge]));
    expect(byId['level-5']).toMatchObject({ earnedOn: '2026-11-03', current: 5 });
    expect(byId['duizend-punten']).toMatchObject({ earnedOn: '2026-11-08', current: 1000 });
  });
});

describe('statistieken', () => {
  it('vat quests per categorie, op tijd en doorlooptijd samen', () => {
    const quests = [
      quest('a', { category: 'Huis', deadline: '2026-11-10' }),
      quest('b', { category: 'Huis', deadline: '2026-11-08', rewardPoints: 10 }),
      quest('c', { category: 'Leren', status: 'active', progress: 0, completedAt: null }),
      quest('d')
    ];
    const stats = sidequestStats([habit], dailyChecks('h', '2026-11-01', 3), quests);
    expect(stats).toMatchObject({ totalChecks: 3, completedQuests: 3, activeQuests: 1, onTimeRate: 0.5, averageDaysToComplete: 4, longestStreak: 3 });
    expect(stats.categories).toEqual([
      { category: 'Huis', active: 0, completed: 2, points: 30 },
      { category: 'Overig', active: 0, completed: 1, points: 20 },
      { category: 'Leren', active: 1, completed: 0, points: 0 }
    ]);
  });

  it('geeft geen percentages zonder gegevens', () => {
    expect(sidequestStats([], [], [])).toMatchObject({ onTimeRate: null, averageDaysToComplete: null, longestStreak: 0, categories: [] });
  });

  it('telt punten per week van maandag t/m zondag', () => {
    const checks = [
      { id: '1', habitId: 'h', date: '2026-11-09' },
      { id: '2', habitId: 'h', date: '2026-11-15' },
      { id: '3', habitId: 'h', date: '2026-11-16' }
    ];
    const weeks = pointsPerWeek(checks, [quest('a', { completedAt: '2026-11-17T12:00:00.000Z', rewardPoints: 25 })], '2026-11-18', 3);
    expect(weeks).toEqual([
      { weekStart: '2026-11-02', points: 0 },
      { weekStart: '2026-11-09', points: 10 },
      { weekStart: '2026-11-16', points: 30 }
    ]);
  });

  it('maakt een kalender van hele weken met lege dagen na vandaag', () => {
    const calendar = activityCalendar([{ id: '1', habitId: 'h', date: '2026-11-18' }, { id: '2', habitId: 'w', date: '2026-11-18' }], [quest('a', { completedAt: '2026-11-02T12:00:00.000Z' })], '2026-11-18', 3);
    expect(calendar).toHaveLength(3);
    expect(calendar.every((week) => week.length === 7)).toBe(true);
    expect(calendar[0]![0]!.date).toBe('2026-11-02');
    expect(calendar[0]![0]!.count).toBe(1);
    expect(calendar[2]![2]).toEqual({ date: '2026-11-18', count: 2, inRange: true });
    expect(calendar[2]![3]).toEqual({ date: '2026-11-19', count: 0, inRange: false });
  });
});

describe('sportpunten in voortgang', () => {
  it('tellen mee in level, badges en punten per week, maar niet in de activiteitenkalender', () => {
    const sportDays = Array.from({ length: 70 }, (_, index) => {
      const date = new Date('2026-09-01T00:00:00.000Z');
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    expect(levelInfo(calculatePoints([], [], sportDays)).level).toBe(5);
    const byId = Object.fromEntries(badges([], [], [], sportDays).map((badge) => [badge.id, badge]));
    expect(byId['level-5']).toMatchObject({ earnedOn: '2026-11-09', current: 5 });
    expect(byId['eerste-check']).toMatchObject({ earnedOn: null });
    expect(pointsPerWeek([], [], '2026-11-09', 2, sportDays)).toEqual([
      { weekStart: '2026-11-02', points: 70 },
      { weekStart: '2026-11-09', points: 10 }
    ]);
    expect(activityCalendar([], [], '2026-11-09', 1).flat().every((day) => day.count === 0)).toBe(true);
  });
});

