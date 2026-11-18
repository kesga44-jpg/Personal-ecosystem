import { describe, expect, it } from 'vitest';
import {
  ascent,
  compactTrack,
  downsample,
  expandTrack,
  formatDistance,
  formatDuration,
  formatPace,
  haversine,
  heartRateZones,
  kmSplits,
  movingTime,
  speedSeries,
  summarize,
  validateDuurBackup,
  validateSettings,
  validateTrack,
  validateWorkout,
  weekTotals,
  weeklyVolume,
  withDistances,
  workoutFromParsed,
  type TrackPoint,
  type Workout
} from './domain';
import { gpx } from './fixtures';
import { parseGpx } from './parsers';

const point = (t: number, d: number | null, extra: Partial<TrackPoint> = {}): TrackPoint => ({ t, lat: null, lon: null, hr: null, ele: null, d, ...extra });

const workout: Workout = {
  id: 'w1',
  title: 'Ochtendloop',
  sport: 'hardlopen',
  startedAt: '2026-11-16T07:00:00.000Z',
  date: '2026-11-16',
  durationSec: 1800,
  movingSec: 1750,
  distanceM: 5000,
  ascentM: 20,
  avgHr: 145,
  maxHr: 170,
  calories: null,
  source: 'gpx',
  fileName: 'loop.gpx',
  fingerprint: 'a'.repeat(64),
  hasTrack: true,
  notes: ''
};

describe('afstand en samenvatting', () => {
  it('rekent afstand tussen GPS-punten (haversine)', () => {
    expect(haversine(52, 5, 52.0009, 5)).toBeCloseTo(100.1, 0);
    const points = withDistances([point(0, null, { lat: 52, lon: 5 }), point(10, null), point(20, null, { lat: 52.0009, lon: 5 })]);
    expect(points.map((item) => item.d)).toEqual([0, null, 100.1]);
  });

  it('gebruikt apparaatafstand als die er is en vult gaten aan', () => {
    expect(withDistances([point(0, 0), point(1, null), point(2, 20)]).map((item) => item.d)).toEqual([0, 0, 20]);
  });

  it('telt stijging met 3 m drempel en tijd in beweging zonder pauzes', () => {
    expect(ascent([10, 11, 12, 11, 14, 13, 20].map((ele, t) => point(t, null, { ele })))).toBe(11);
    expect(ascent([point(0, null)])).toBeNull();
    // 10 s lopen, 20 s stilstaan, 50 s gat (telt niet), 10 s lopen.
    expect(movingTime([point(0, 0), point(10, 30), point(30, 30), point(80, 60), point(90, 90)])).toBe(20);
  });

  it('geeft apparaattotalen voorrang en rekent anders zelf', () => {
    const parsed = parseGpx(gpx());
    const summary = summarize(parsed);
    expect(summary).toMatchObject({ durationSec: 300, movingSec: 300, ascentM: 9, avgHr: 140, maxHr: 150, calories: null });
    expect(summary.distanceM).toBeGreaterThan(990);
    expect(summary.distanceM).toBeLessThan(1010);
    expect(summarize({ ...parsed, totals: { distanceM: 1234, durationSec: 400 } })).toMatchObject({ distanceM: 1234, durationSec: 400 });
  });
});

describe('analyses', () => {
  it('maakt tussentijden per kilometer met restafstand', () => {
    const points = Array.from({ length: 26 }, (_, index) => point(index * 12, index * 100, { hr: 140 + index }));
    const splits = kmSplits(points);
    expect(splits.map((split) => [split.km, split.seconds, split.meters])).toEqual([[1, 120, 1000], [2, 120, 1000], [3, 60, 500]]);
    expect(splits[0]!.avgHr).toBe(146);
    expect(kmSplits([point(0, null)])).toEqual([]);
  });

  it('verdeelt tijd over hartslagzones volgens % van maximale hartslag', () => {
    const points = [point(0, null, { hr: 100 }), point(10, null, { hr: 110 }), point(20, null, { hr: 150 }), point(30, null, { hr: 190 }), point(100, null, { hr: 190 })];
    // max 200: 110 → zone 1 (55%), 150 → zone 3 (75%), 190 → zone 5 (95%); gat van 70 s telt niet.
    expect(heartRateZones(points, 200)).toEqual([10, 0, 10, 0, 10]);
  });

  it('strijkt snelheid glad en beperkt het aantal punten', () => {
    const series = speedSeries(Array.from({ length: 400 }, (_, index) => point(index * 5, index * 15)));
    expect(series.length).toBeLessThanOrEqual(120);
    expect(series.at(-1)!.mps).toBeCloseTo(3, 5);
  });

  it('verkleint en comprimeert een route', () => {
    expect(downsample([1, 2, 3, 4, 5], 3)).toEqual([1, 3, 5]);
    const track = { id: 'w1', points: compactTrack([point(0, null, { lat: 52.1234567, lon: 5.7654321, hr: 120, ele: 3.456 }), point(1.4, null, { lat: 52.1234667, lon: 5.7654321 })]) };
    expect(track.points[0]).toEqual([0, 52.123457, 5.765432, 120, 3.5, 0]);
    expect(expandTrack(track)[1]).toMatchObject({ t: 1, lat: 52.123467 });
    expect(compactTrack(Array.from({ length: 5000 }, (_, t) => point(t, t)))).toHaveLength(3000);
  });
});

describe('opmaak', () => {
  it('toont duur, afstand en tempo per sport', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDistance(5432)).toBe('5,43 km');
    expect(formatDistance(800)).toBe('800 m');
    expect(formatDistance(null)).toBe('—');
    expect(formatPace('hardlopen', 5000, 1500)).toBe('5:00 /km');
    expect(formatPace('fietsen', 30000, 3600)).toBe('30 km/u');
    expect(formatPace('zwemmen', 1000, 1200)).toBe('2:00 /100 m');
    expect(formatPace('hardlopen', null, 100)).toBe('—');
  });
});

describe('validatie en opslag', () => {
  it('accepteert een geldige training en weigert onzin', () => {
    expect(() => validateWorkout(workout, '2026-11-17')).not.toThrow();
    expect(() => validateWorkout({ ...workout, date: '2026-11-18' }, '2026-11-17')).toThrow('toekomst');
    expect(() => validateWorkout({ ...workout, sport: 'schaken' })).toThrow('sport');
    expect(() => validateWorkout({ ...workout, durationSec: 0 })).toThrow('Duur');
    expect(() => validateWorkout({ ...workout, avgHr: 300 })).toThrow('Hartslag');
    expect(() => validateWorkout({ ...workout, fingerprint: 'x' })).toThrow('vingerafdruk');
  });

  it('controleert routes, instellingen en back-up', () => {
    expect(() => validateTrack({ id: 'w1', points: [[0, 52, 5, 140, 3, 0]] })).not.toThrow();
    expect(() => validateTrack({ id: 'w1', points: [[0, 95, 5, 140, 3, 0]] })).toThrow('ongeldig punt');
    expect(() => validateSettings({ id: 'settings', maxHr: 190 })).not.toThrow();
    expect(() => validateSettings({ id: 'settings', maxHr: 300 })).toThrow('120 en 230');
    expect(() => validateDuurBackup({ stores: { workouts: [workout], tracks: [], settings: [] } })).not.toThrow();
    expect(() => validateDuurBackup({ stores: { workouts: [] } })).toThrow('mist');
  });

  it('maakt een training met route uit een import', () => {
    const { workout: made, track } = workoutFromParsed(parseGpx(gpx()), { id: 'x', fileName: 'loop.gpx', fingerprint: 'b'.repeat(64), source: 'gpx' });
    expect(made).toMatchObject({ id: 'x', sport: 'hardlopen', source: 'gpx', hasTrack: true, durationSec: 300, notes: '' });
    expect(() => validateWorkout(made)).not.toThrow();
    expect(track!.points).toHaveLength(11);
    expect(() => validateTrack(track)).not.toThrow();
  });
});

describe('overzichten', () => {
  it('telt per week vanaf maandag en geeft het dashboard alleen totalen', () => {
    const list = [workout, { ...workout, date: '2026-11-17', distanceM: 2500, durationSec: 900 }, { ...workout, date: '2026-11-09' }];
    expect(weekTotals(list, '2026-11-17')).toEqual({ sessions: 2, km: 7.5, minutes: 45 });
    expect(weeklyVolume(list, '2026-11-17', 2).map((week) => [week.week, week.km, week.sessions])).toEqual([['2026-11-09', 5, 1], ['2026-11-16', 7.5, 2]]);
  });
});
