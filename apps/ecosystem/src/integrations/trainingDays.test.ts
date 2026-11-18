import { describe, expect, it } from 'vitest';
import { trainingDaysFrom } from './trainingDays';
import { pointsPerDay } from '../dashboard/summary';

describe('trainingsdagen voor de koppeling Sport → SIDEQUEST', () => {
  it('geeft unieke, gesorteerde dagen uit Sport, Kracht en Duur en slaat ongeldige waarden over', () => {
    const start = new Date(2026, 10, 12, 18, 30).toISOString();
    expect(trainingDaysFrom({ activityStarts: [start, 'kapot'], krachtDates: ['2026-11-15', '2026-11-12'], duurDates: ['2026-11-10', 'nooit'] })).toEqual([
      '2026-11-10',
      '2026-11-12',
      '2026-11-15'
    ]);
  });

  it('telt sportpunten mee in de dashboardgrafiek, één keer per dag', () => {
    const points = pointsPerDay([], [], '2026-11-18', 3, ['2026-11-17', '2026-11-17', '2026-11-01']);
    expect(points.map((point) => point.value)).toEqual([0, 10, 0]);
  });
});
