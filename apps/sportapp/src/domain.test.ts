import { describe, expect, it } from 'vitest';
import { calculateSportStats, parseGpx, validateSportActivity, validateSportBackup, type Activity } from './domain';

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

  it('parses a timestamped GPX route and rejects unsafe or untimed files', () => {
    const gpx = `<?xml version="1.0"?><gpx><trk><name>Morning run</name><trkseg>
      <trkpt lat="52.0" lon="5.0"><time>2026-11-15T08:00:00Z</time></trkpt>
      <trkpt lat="52.001" lon="5.0"><time>2026-11-15T08:10:00Z</time></trkpt>
    </trkseg></trk></gpx>`;

    expect(parseGpx(gpx, 'run.gpx')).toMatchObject({
      name: 'Morning run',
      startedAt: '2026-11-15T08:00:00.000Z',
      durationMinutes: 10
    });
    expect(parseGpx(gpx, 'run.gpx').distanceKm).toBeCloseTo(0.1112, 4);
    expect(() => parseGpx('<!DOCTYPE x><gpx/>', 'bad.gpx')).toThrow('onveilige');
    expect(() => parseGpx('<gpx/>', 'empty.gpx')).toThrow('minimaal twee punten');
    expect(() => parseGpx(
      '<gpx><trkseg><trkpt lat="52" lon="5"/><trkpt lat="52.001" lon="5"/></trkseg></gpx>',
      'untimed.gpx'
    )).toThrow('tijdstempels');
    expect(() => parseGpx(
      '<gpx><trkseg><trkpt lat="52" lon="5"><time>2026-11-15T08:00:00Z</time></trkpt><trkpt lat="52.001" lon="5"/></trkseg></gpx>',
      'single-time.gpx'
    )).toThrow('tijdstempels');
  });

  it('rejects missing, empty and out-of-range GPX coordinates', () => {
    for (const [coordinates, message] of [
      ['lon="5"', 'latitude'],
      ['lat="52"', 'latitude'],
      ['lat="" lon="5"', 'latitude'],
      ['lat="52" lon=""', 'latitude'],
      ['lat="91" lon="5"', 'ongeldige GPS'],
      ['lat="52" lon="181"', 'ongeldige GPS'],
      ['lat="0x1" lon="5"', 'ongeldige GPS']
    ]) {
      const gpx = `<gpx><trkseg><trkpt ${coordinates}><time>2026-11-15T08:00:00Z</time></trkpt><trkpt lat="52.001" lon="5"><time>2026-11-15T08:10:00Z</time></trkpt></trkseg></gpx>`;
      expect(() => parseGpx(gpx, 'invalid-coordinate.gpx')).toThrow(message);
    }
  });

  it('adds distances across multiple tracks and segments without bridging them', () => {
    const gpx = `<gpx>
      <trk>
      <trkseg>
        <trkpt lat="52" lon="5"><time>2026-11-15T08:00:00Z</time></trkpt>
        <trkpt lat="52.001" lon="5"><time>2026-11-15T08:10:00Z</time></trkpt>
      </trkseg>
      <trkseg>
        <trkpt lat="53" lon="6"><time>2026-11-15T08:20:00Z</time></trkpt>
        <trkpt lat="53.001" lon="6"><time>2026-11-15T08:30:00Z</time></trkpt>
      </trkseg>
      </trk>
      <trk><trkseg>
        <trkpt lat="54" lon="7"><time>2026-11-15T08:40:00Z</time></trkpt>
        <trkpt lat="54.001" lon="7"><time>2026-11-15T08:50:00Z</time></trkpt>
      </trkseg></trk>
    </gpx>`;
    expect(parseGpx(gpx, 'segments.gpx')).toMatchObject({
      startedAt: '2026-11-15T08:00:00.000Z',
      durationMinutes: 50
    });
    expect(parseGpx(gpx, 'segments.gpx').distanceKm).toBeCloseTo(0.3336, 4);
  });

  it('keeps short positive GPX distances valid for backup export', () => {
    const preview = parseGpx(
      '<gpx><trkseg><trkpt lat="52" lon="5"><time>2026-11-15T08:00:00Z</time></trkpt><trkpt lat="52.000000001" lon="5"><time>2026-11-15T08:01:00Z</time></trkpt></trkseg></gpx>',
      'short.gpx'
    );
    const activity: Activity = {
      id: 'b'.repeat(64),
      startedAt: preview.startedAt,
      type: 'run',
      durationMinutes: preview.durationMinutes,
      distanceKm: preview.distanceKm,
      notes: `GPX-import: ${preview.name}`,
      sourceFingerprint: 'b'.repeat(64)
    };

    expect(preview.distanceKm).toBeGreaterThan(0);
    expect(() => validateSportBackup({
      stores: { activities: [activity], trainings: [] }
    })).not.toThrow();
  });

  it('rejects invalid and backwards GPX timestamps', () => {
    const gpx = `<gpx><trkseg>
      <trkpt lat="52" lon="5"><time>2026-11-15T08:10:00Z</time></trkpt>
      <trkpt lat="52.001" lon="5"><time>2026-11-15T08:00:00Z</time></trkpt>
    </trkseg></gpx>`;
    expect(() => parseGpx(gpx, 'backwards.gpx')).toThrow('oplopende volgorde');
    expect(() => parseGpx(
      '<gpx><trkseg><trkpt lat="52" lon="5"><time>not-a-date</time></trkpt><trkpt lat="52.001" lon="5"><time>2026-11-15T08:10:00Z</time></trkpt></trkseg></gpx>',
      'invalid-time.gpx'
    )).toThrow('ongeldige datum');
    expect(() => parseGpx(
      '<gpx><trkseg><trkpt lat="52" lon="5"><time>2026-02-30T08:00:00Z</time></trkpt><trkpt lat="52.001" lon="5"><time>2026-11-15T08:10:00Z</time></trkpt></trkseg></gpx>',
      'invalid-calendar-date.gpx'
    )).toThrow('ongeldige datum');
    expect(() => parseGpx(
      '<gpx><trkseg><trkpt lat="52" lon="5"><time>2026-11-15T08:00:00Z</time></trkpt><trkpt lat="52.001" lon="5"><time>2026-11-15T08:00:00Z</time></trkpt></trkseg></gpx>',
      'zero-duration.gpx'
    )).toThrow('positieve tijdsduur');
  });

  it('applies the same validation to manually created and imported activities', () => {
    const valid: Activity = {
      id: 'gpx-id',
      startedAt: '2026-11-15T08:00:00.000Z',
      type: 'run',
      durationMinutes: 10,
      distanceKm: 1.2,
      notes: 'GPX-import'
    };
    expect(() => validateSportActivity(valid)).not.toThrow();
    expect(() => validateSportBackup({
      stores: {
        activities: [{ ...valid, sourceFingerprint: 'a'.repeat(64) }],
        trainings: []
      }
    })).not.toThrow();
    expect(() => validateSportActivity({ ...valid, durationMinutes: 0 })).toThrow('ongeldige activiteitgegevens');
    expect(() => validateSportBackup({
      stores: { activities: [{ ...valid, durationMinutes: 0 }], trainings: [] }
    })).toThrow('ongeldige activiteitgegevens');
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
