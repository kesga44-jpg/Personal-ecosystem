import { describe, expect, it } from 'vitest';
import { fit, gpx, tcx } from './fixtures';
import { fromFitData, parseFit, parseGpx, parseTcx, readActivityFile, sourceFor, sportFrom } from './parsers';

const file = (name: string, content: string | Uint8Array) => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer };
};

describe('sport en bestandstype herkennen', () => {
  it('vertaalt sportnamen uit verschillende apparaten', () => {
    expect(sportFrom('running')).toBe('hardlopen');
    expect(sportFrom('Biking')).toBe('fietsen');
    expect(sportFrom('cycling road')).toBe('fietsen');
    expect(sportFrom('hiking')).toBe('wandelen');
    expect(sportFrom('lap_swimming')).toBe('zwemmen');
    expect(sportFrom('rowing')).toBe('roeien');
    expect(sportFrom('yoga')).toBe('overig');
    expect(sportFrom(undefined)).toBe('overig');
  });

  it('herkent FIT aan de kop en XML aan naam of inhoud', () => {
    expect(sourceFor('activiteit.bin', fit())).toBe('fit');
    expect(sourceFor('x.gpx', new Uint8Array([60]))).toBe('gpx');
    expect(sourceFor('export', new TextEncoder().encode(tcx()))).toBe('tcx');
    expect(sourceFor('export', new TextEncoder().encode(gpx()))).toBe('gpx');
    expect(sourceFor('foto.jpg', new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('GPX', () => {
  it('leest route, tijden, hoogte en hartslag uit Garmin-extensies', () => {
    const parsed = parseGpx(gpx());
    expect(parsed.sport).toBe('hardlopen');
    expect(parsed.startedAt).toBe('2026-11-16T07:00:00.000Z');
    expect(parsed.points).toHaveLength(11);
    expect(parsed.points[10]).toMatchObject({ t: 300, lat: 52.009, lon: 5, hr: 150, ele: 20, d: null });
  });

  it('weigert onveilige of ongeldige XML en routes zonder tijden', () => {
    expect(() => parseGpx('<!DOCTYPE x><gpx/>')).toThrow('onveilige');
    expect(() => parseGpx('<kml/>')).toThrow('geen geldige GPX');
    expect(() => parseGpx('<gpx><trk><trkseg><trkpt lat="52" lon="5"/><trkpt lat="52.1" lon="5"/></trkseg></trk></gpx>')).toThrow('geen tijden');
  });
});

describe('TCX', () => {
  it('leest punten en rondetotalen', () => {
    const parsed = parseTcx(tcx());
    expect(parsed.sport).toBe('fietsen');
    expect(parsed.totals).toEqual({ durationSec: 300, distanceM: 1001, calories: 80 });
    expect(parsed.points[5]).toMatchObject({ t: 150, d: 500, hr: 140 });
  });

  it('weigert DTD en bestanden zonder activiteit', () => {
    expect(() => parseTcx('<!ENTITY x "y"><TrainingCenterDatabase/>')).toThrow('onveilige');
    expect(() => parseTcx('<TrainingCenterDatabase xmlns="x"></TrainingCenterDatabase>')).toThrow('geen activiteit');
  });
});

describe('FIT', () => {
  it('leest een echt FIT-bestand (gemaakt met de encoder van fit-file-parser)', async () => {
    const bytes = fit();
    const parsed = await parseFit(bytes.slice().buffer as ArrayBuffer);
    expect(parsed.sport).toBe('hardlopen');
    expect(parsed.startedAt).toBe('2026-11-16T07:00:00.000Z');
    expect(parsed.points).toHaveLength(11);
    expect(parsed.points[10]!.t).toBe(300);
    expect(parsed.points[10]!.lat).toBeCloseTo(52.009, 5);
    expect(parsed.points[10]).toMatchObject({ hr: 150, ele: 20, d: 1000 });
    expect(parsed.totals).toEqual({ durationSec: 300, movingSec: 290, distanceM: 1000, avgHr: 140, maxHr: 150 });
  });

  it('accepteert alleen totalen als er geen punten zijn, en weigert lege bestanden', () => {
    expect(fromFitData({ sessions: [{ sport: 'cycling', start_time: '2026-11-16T07:00:00Z', total_elapsed_time: 3600, total_distance: 30000 }] })).toMatchObject({ sport: 'fietsen', points: [], totals: { durationSec: 3600, distanceM: 30000 } });
    expect(() => fromFitData({})).toThrow('geen meetpunten');
    expect(fromFitData({ records: [{ timestamp: '2026-11-16T07:00:00Z', heart_rate: 999, position_lat: 200 }, { timestamp: '2026-11-16T07:00:10Z' }] }).points[0]).toMatchObject({ hr: null, lat: null });
  });

  it('meldt een kapot FIT-bestand in gewone taal', async () => {
    const broken = fit().slice(0, 40);
    await expect(parseFit(broken.buffer as ArrayBuffer)).rejects.toThrow();
  });
});

describe('bestand inlezen', () => {
  it('geeft bron en SHA-256-vingerafdruk terug', async () => {
    const result = await readActivityFile(file('rit.tcx', tcx()));
    expect(result.source).toBe('tcx');
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect((await readActivityFile(file('rit.tcx', tcx()))).fingerprint).toBe(result.fingerprint);
    expect((await readActivityFile(file('loop.fit', fit()))).source).toBe('fit');
  });

  it('weigert te grote en onbekende bestanden', async () => {
    await expect(readActivityFile({ name: 'groot.fit', size: 26 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) })).rejects.toThrow('25 MB');
    await expect(readActivityFile(file('foto.jpg', new Uint8Array([1, 2, 3])))).rejects.toThrow('Onbekend bestandstype');
  });
});
