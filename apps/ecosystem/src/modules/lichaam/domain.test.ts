import { describe, expect, it } from 'vitest';
import {
  average,
  bmi,
  bmiCategory,
  change,
  dateRange,
  emptyDay,
  filledToday,
  isDateKey,
  latest,
  measuredSeries,
  parseMeasure,
  sleepSeries,
  validateBodyDay,
  validateBodyProfile,
  validateLichaamBackup,
  type BodyDay
} from './domain';

const day = (date: string, values: Partial<BodyDay> = {}): BodyDay => ({ ...emptyDay(date), updatedAt: '2026-11-16T08:00:00.000Z', ...values });

describe('invoer', () => {
  it('leest getallen met komma of punt en rondt af', () => {
    expect(parseMeasure('weightKg', ' 81,46 ')).toBe(81.5);
    expect(parseMeasure('sleepHours', '7.5')).toBe(7.5);
    expect(parseMeasure('restingHr', '')).toBeNull();
  });

  it('weigert waarden buiten een realistisch bereik', () => {
    expect(() => parseMeasure('weightKg', '4')).toThrow('Gewicht moet tussen 20 en 400 kg liggen.');
    expect(() => parseMeasure('sleepHours', '25')).toThrow('Slaap');
    expect(() => parseMeasure('restingHr', '61.5')).toThrow('heel getal');
    expect(() => parseMeasure('weightKg', 'abc')).toThrow();
  });

  it('controleert datums streng', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('16-11-2026')).toBe(false);
  });
});

describe('validateBodyDay', () => {
  it('accepteert een geldige dag', () => {
    expect(() => validateBodyDay(day('2026-11-16', { weightKg: 80, systolic: 120, diastolic: 80 }), '2026-11-16')).not.toThrow();
  });

  it('weigert een lege dag, toekomst, half ingevulde bloeddruk en onlogische druk', () => {
    expect(() => validateBodyDay(day('2026-11-16'))).toThrow('minstens één');
    expect(() => validateBodyDay(day('2026-11-17', { weightKg: 80 }), '2026-11-16')).toThrow('toekomst');
    expect(() => validateBodyDay(day('2026-11-16', { systolic: 120 }))).toThrow('zowel');
    expect(() => validateBodyDay(day('2026-11-16', { systolic: 80, diastolic: 90 }))).toThrow('lager');
  });

  it('weigert manipulaties in een back-up', () => {
    expect(() => validateBodyDay({ ...day('2026-11-16', { weightKg: 80 }), id: 'iets-anders' })).toThrow('datum');
    expect(() => validateBodyDay({ ...day('2026-11-16', { weightKg: 80 }), waistCm: undefined })).toThrow('Buikomvang');
    expect(() => validateBodyDay(day('2026-11-16', { weightKg: 80, note: 'x'.repeat(501) }))).toThrow('notitie');
  });
});

describe('back-up', () => {
  it('controleert dagen en hooguit één profiel', () => {
    const profile = { id: 'profile', heightCm: 180, goalWeightKg: null };
    expect(() => validateLichaamBackup({ stores: { days: [day('2026-11-16', { sleepHours: 7 })], profile: [profile] } })).not.toThrow();
    expect(() => validateLichaamBackup({ stores: { days: [], profile: [profile, profile] } })).toThrow('profiel');
    expect(() => validateLichaamBackup({ stores: { days: [] } })).toThrow();
    expect(() => validateBodyProfile({ id: 'profile', heightCm: 20, goalWeightKg: null })).toThrow('Lengte');
  });
});

describe('statistiek', () => {
  const days = [
    day('2026-10-10', { weightKg: 84 }),
    day('2026-10-20', { weightKg: 83, sleepHours: 6 }),
    day('2026-11-10', { weightKg: 82.4, sleepHours: 8 }),
    day('2026-11-14', { sleepHours: 7 }),
    day('2026-11-16', { weightKg: 81.6, sleepHours: 6.5 })
  ];

  it('vindt de laatste meting', () => {
    expect(latest(days, 'weightKg')).toEqual({ date: '2026-11-16', value: 81.6 });
    expect(latest(days, 'restingHr')).toBeNull();
  });

  it('berekent een gemiddelde over ingevulde dagen', () => {
    expect(average(days, 'sleepHours', '2026-11-16', 7)).toEqual({ value: 7.2, count: 3 });
    expect(average(days, 'restingHr', '2026-11-16')).toBeNull();
  });

  it('berekent de verandering binnen de periode', () => {
    expect(change(days, 'weightKg', '2026-11-16', 30)).toBe(-1.4);
    expect(change(days, 'weightKg', '2026-11-16', 3)).toBeNull();
  });

  it('maakt reeksen voor grafieken', () => {
    expect(measuredSeries(days, 'weightKg', '2026-11-16', 30).map((point) => point.label)).toEqual(['20-10', '10-11', '16-11']);
    const sleep = sleepSeries(days, '2026-11-16', 3);
    expect(sleep).toEqual([{ label: '14', value: 7 }, { label: '15', value: 0 }, { label: '16', value: 6.5 }]);
    expect(dateRange('2026-03-01', 2)).toEqual(['2026-02-28', '2026-03-01']);
  });

  it('berekent BMI met indeling', () => {
    expect(bmi(81.6, 180)).toBe(25.2);
    expect(bmiCategory(25.2)).toBe('overgewicht');
    expect(bmiCategory(22)).toBe('gezond gewicht');
  });

  it('geeft het dashboard alleen of er vandaag iets is ingevuld', () => {
    expect(filledToday(days, '2026-11-16')).toBe(true);
    expect(filledToday(days, '2026-11-15')).toBe(false);
  });
});
