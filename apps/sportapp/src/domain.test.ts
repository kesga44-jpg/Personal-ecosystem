import { describe, expect, it } from 'vitest';
import { calculateSportStats, parseGpx, validateSportBackup, type Activity } from './domain';

describe('sport domain', () => {
  it('calculates activity count, distance, duration and type distribution from saved records', () => {
    const activities: Activity[] = [
      { id: 'a', startedAt: '2026-11-10', type: 'run', durationMinutes: 30, distanceKm: 5, notes: '' },
      { id: 'b', startedAt: '2026-11-11', type: 'bike', durationMinutes: 60, distanceKm: 12, notes: '' },
      { id: 'c', startedAt: '2026-11-12', type: 'run', durationMinutes: 15, distanceKm: null, notes: '' }
    ];

    expect(calculateSportStats(activities)).toEqual({
      count: 3,
      distanceKm: 17,
      durationMinutes: 105,
      byType: { run: 2, bike: 1 }
    });
  });

  it('parses GPX route totals and rejects invalid or unsafe XML', () => {
    const gpx = `<?xml version="1.0"?><gpx><trk><name>Morning run</name><trkseg>
      <trkpt lat="52.0" lon="5.0"><time>2026-11-15T08:00:00Z</time></trkpt>
      <trkpt lat="52.001" lon="5.0"><time>2026-11-15T08:10:00Z</time></trkpt>
    </trkseg></trk></gpx>`;

    expect(parseGpx(gpx, 'run.gpx')).toMatchObject({
      name: 'Morning run',
      startedAt: '2026-11-15T08:00:00.000Z',
      durationMinutes: 10,
      distanceKm: 0.11
    });
    expect(() => parseGpx('<!DOCTYPE x><gpx/>', 'bad.gpx')).toThrow('onveilige');
    expect(() => parseGpx('<gpx/>', 'empty.gpx')).toThrow('minimaal twee punten');
  });

  it('rejects invalid sport records before a backup can replace existing data', () => {
    expect(() => validateSportBackup({
      stores: {
        activities: [{ id: 'bad', startedAt: 'not-a-date', type: 'run', durationMinutes: 30, distanceKm: 5, notes: '' }],
        trainings: []
      }
    })).toThrow('ongeldige activiteitgegevens');
  });
});
