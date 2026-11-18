import { describe, expect, it } from 'vitest';
import { otherSessionsFrom, trainingDaysFrom } from './trainingDays';
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

  it('geeft voor het weekdoel van Sport alleen datum en minuten uit Kracht en Duur', () => {
    expect(otherSessionsFrom({
      kracht: [
        { date: '2026-11-16', startedAt: '2026-11-16T18:00:00.000Z', finishedAt: '2026-11-16T18:50:00.000Z' },
        { date: '2026-11-17', startedAt: 'kapot', finishedAt: 'kapot' },
        { date: 'nooit', startedAt: '2026-11-16T18:00:00.000Z', finishedAt: '2026-11-16T18:50:00.000Z' }
      ],
      duur: [{ date: '2026-11-18', durationSec: 1830 }]
    })).toEqual([
      { date: '2026-11-16', minutes: 50 },
      { date: '2026-11-17', minutes: 0 },
      { date: '2026-11-18', minutes: 31 }
    ]);
  });
});

