/**
 * Importeren van GPX, TCX en FIT. Alles gebeurt in de browser; bestanden worden niet geüpload.
 * XML wordt geweigerd als het DTD- of ENTITY-instructies bevat. FIT wordt gelezen met fit-file-parser (MIT),
 * dat pas wordt geladen als je een FIT-bestand kiest.
 */
import type { ParsedActivity, Sport, Source, TrackPoint } from './domain';
import { MAX_FILE_BYTES } from './domain';

export const MAX_POINTS = 200_000;
export const ACCEPT = '.fit,.tcx,.gpx,application/gpx+xml,application/vnd.garmin.tcx+xml';

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Sportnamen uit bestanden (Engels, Garmin/Strava-varianten) naar onze sporten. */
export function sportFrom(raw: unknown): Sport {
  const text = String(raw ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  if (/run|jog|hardlo|trail|treadmill/.test(text)) return 'hardlopen';
  if (/bik|cycl|ride|fiets|mtb|gravel/.test(text)) return 'fietsen';
  if (/walk|hik|wandel/.test(text)) return 'wandelen';
  if (/swim|zwem/.test(text)) return 'zwemmen';
  if (/row|roei|kayak|canoe|paddl/.test(text)) return 'roeien';
  return 'overig';
}

export function sourceFor(fileName: string, bytes: Uint8Array): Exclude<Source, 'handmatig'> | null {
  // FIT: ".FIT" op byte 8–11 van de kop.
  if (bytes.length >= 12 && bytes[8] === 0x2e && bytes[9] === 0x46 && bytes[10] === 0x49 && bytes[11] === 0x54) return 'fit';
  const name = fileName.toLowerCase();
  if (name.endsWith('.tcx')) return 'tcx';
  if (name.endsWith('.gpx')) return 'gpx';
  const head = new TextDecoder().decode(bytes.slice(0, 2000)).toLowerCase();
  if (head.includes('<trainingcenterdatabase')) return 'tcx';
  if (head.includes('<gpx')) return 'gpx';
  return null;
}

function parseXml(text: string, root: string, label: string): Document {
  if (!text.trim() || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error(`Dit ${label}-bestand is leeg of bevat onveilige XML-instructies.`);
  if (typeof DOMParser === 'undefined') throw new Error(`${label}-import is niet beschikbaar in deze browser.`);
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== root) throw new Error(`Dit bestand is geen geldige ${label}.`);
  return document;
}

const child = (element: Element, name: string) => element.getElementsByTagNameNS('*', name)[0] ?? null;
const textOf = (element: Element | null) => element?.textContent?.trim() ?? '';

function num(text: string, min: number, max: number): number | null {
  if (!NUMBER.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Zet absolute tijden om naar seconden sinds de eerste geldige tijd, gesorteerd. */
function finish(sport: Sport, raw: { time: number | null; lat: number | null; lon: number | null; hr: number | null; ele: number | null; d: number | null }[], totals: ParsedActivity['totals'], label: string): ParsedActivity {
  if (raw.length > MAX_POINTS) throw new Error(`${label} bevat te veel punten (maximaal ${MAX_POINTS.toLocaleString('nl-NL')}).`);
  const timed = raw.filter((point) => point.time !== null) as (typeof raw[number] & { time: number })[];
  if (timed.length < 2 && !totals.durationSec) throw new Error(`${label} bevat geen tijden; zo kan de duur niet worden bepaald.`);
  if (!timed.length) throw new Error(`${label} bevat geen bruikbare punten.`);
  timed.sort((a, b) => a.time - b.time);
  const start = timed[0]!.time;
  const points: TrackPoint[] = timed.map((point) => ({ t: Math.round((point.time - start) / 100) / 10, lat: point.lat, lon: point.lon, hr: point.hr, ele: point.ele, d: point.d }));
  return { sport, startedAt: new Date(start).toISOString(), points, totals };
}

function coordinate(text: string | null, limit: number): number | null {
  return text ? num(text.trim(), -limit, limit) : null;
}

export function parseGpx(text: string): ParsedActivity {
  const document = parseXml(text, 'gpx', 'GPX');
  const points = Array.from(document.getElementsByTagNameNS('*', 'trkpt'));
  const fallback = points.length ? points : Array.from(document.getElementsByTagNameNS('*', 'rtept'));
  if (fallback.length < 2) throw new Error('GPX bevat geen route met minimaal twee punten.');
  const raw = fallback.map((point) => {
    const time = Date.parse(textOf(child(point, 'time')));
    const hrElement = Array.from(point.getElementsByTagNameNS('*', '*')).find((element) => /^(hr|heartrate)$/i.test(element.localName));
    return {
      time: Number.isFinite(time) ? time : null,
      lat: coordinate(point.getAttribute('lat'), 90),
      lon: coordinate(point.getAttribute('lon'), 180),
      hr: num(textOf(hrElement ?? null), 20, 250),
      ele: num(textOf(child(point, 'ele')), -500, 9000),
      d: null
    };
  });
  const type = textOf(child(document.documentElement, 'type'));
  return finish(sportFrom(type), raw, {}, 'GPX');
}

export function parseTcx(text: string): ParsedActivity {
  const document = parseXml(text, 'TrainingCenterDatabase', 'TCX');
  const activity = document.getElementsByTagNameNS('*', 'Activity')[0];
  if (!activity) throw new Error('TCX bevat geen activiteit.');
  const laps = Array.from(activity.getElementsByTagNameNS('*', 'Lap'));
  const sum = (name: string, max: number) => {
    const values = laps.map((lap) => num(textOf(Array.from(lap.children).find((element) => element.localName === name) ?? null), 0, max));
    return values.every((value) => value !== null) && values.length ? (values as number[]).reduce((a, b) => a + b, 0) : undefined;
  };
  const raw = Array.from(activity.getElementsByTagNameNS('*', 'Trackpoint')).map((point) => {
    const time = Date.parse(textOf(child(point, 'Time')));
    const position = child(point, 'Position');
    const heart = child(point, 'HeartRateBpm');
    return {
      time: Number.isFinite(time) ? time : null,
      lat: position ? num(textOf(child(position, 'LatitudeDegrees')), -90, 90) : null,
      lon: position ? num(textOf(child(position, 'LongitudeDegrees')), -180, 180) : null,
      hr: heart ? num(textOf(child(heart, 'Value')), 20, 250) : null,
      ele: num(textOf(child(point, 'AltitudeMeters')), -500, 9000),
      d: num(textOf(child(point, 'DistanceMeters')), 0, 2_000_000)
    };
  });
  const totals: ParsedActivity['totals'] = {};
  const duration = sum('TotalTimeSeconds', 7 * 24 * 3600);
  const distance = sum('DistanceMeters', 2_000_000);
  const calories = sum('Calories', 50_000);
  if (duration !== undefined) totals.durationSec = duration;
  if (distance !== undefined) totals.distanceM = distance;
  if (calories !== undefined) totals.calories = calories;
  if (!raw.length) {
    // Alleen rondetotalen (bijv. handmatig ingevoerd op het apparaat).
    const lapStart = Date.parse(laps[0]?.getAttribute('StartTime') ?? textOf(child(activity, 'Id')));
    if (!Number.isFinite(lapStart) || !totals.durationSec) throw new Error('TCX bevat geen punten en geen totalen.');
    return { sport: sportFrom(activity.getAttribute('Sport')), startedAt: new Date(lapStart).toISOString(), points: [], totals };
  }
  return finish(sportFrom(activity.getAttribute('Sport')), raw, totals, 'TCX');
}

interface FitRecord {
  timestamp?: Date | string;
  position_lat?: number;
  position_long?: number;
  heart_rate?: number;
  altitude?: number;
  enhanced_altitude?: number;
  distance?: number;
}

interface FitSession {
  sport?: string;
  sub_sport?: string;
  start_time?: Date | string;
  total_elapsed_time?: number;
  total_timer_time?: number;
  total_distance?: number;
  total_ascent?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  total_calories?: number;
}

const finite = (value: unknown, min: number, max: number): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null);

/** Zet de uitvoer van fit-file-parser (lijstmodus, meters en m/s) om. Los te testen zonder bestand. */
export function fromFitData(data: { records?: FitRecord[]; sessions?: FitSession[] }): ParsedActivity {
  const session = data.sessions?.[0] ?? {};
  const raw = (data.records ?? []).map((record) => {
    const time = record.timestamp ? new Date(record.timestamp).getTime() : NaN;
    return {
      time: Number.isFinite(time) ? time : null,
      lat: finite(record.position_lat, -90, 90),
      lon: finite(record.position_long, -180, 180),
      hr: finite(record.heart_rate, 20, 250),
      ele: finite(record.enhanced_altitude ?? record.altitude, -500, 9000),
      d: finite(record.distance, 0, 2_000_000)
    };
  });
  const totals: ParsedActivity['totals'] = {};
  const set = (key: keyof ParsedActivity['totals'], value: unknown, max: number) => {
    const checked = finite(value, 0, max);
    if (checked !== null) totals[key] = checked;
  };
  set('durationSec', session.total_elapsed_time, 7 * 24 * 3600);
  set('movingSec', session.total_timer_time, 7 * 24 * 3600);
  set('distanceM', session.total_distance, 2_000_000);
  set('ascentM', session.total_ascent, 50_000);
  set('avgHr', session.avg_heart_rate, 250);
  set('maxHr', session.max_heart_rate, 250);
  set('calories', session.total_calories, 50_000);
  const sport = sportFrom(`${session.sport ?? ''} ${session.sub_sport ?? ''}`.trim());
  if (!raw.length) {
    const start = session.start_time ? new Date(session.start_time).getTime() : NaN;
    if (!Number.isFinite(start) || !totals.durationSec) throw new Error('FIT bevat geen meetpunten en geen totalen.');
    return { sport, startedAt: new Date(start).toISOString(), points: [], totals };
  }
  return finish(sport, raw, totals, 'FIT');
}

export async function parseFit(buffer: ArrayBuffer): Promise<ParsedActivity> {
  const { default: FitParser } = await import('fit-file-parser');
  const parser = new FitParser({ force: true, speedUnit: 'm/s', lengthUnit: 'm', mode: 'list' });
  let data: unknown;
  try {
    data = await parser.parseAsync(buffer);
  } catch {
    throw new Error('Dit FIT-bestand kon niet worden gelezen.');
  }
  return fromFitData(data as { records?: FitRecord[]; sessions?: FitSession[] });
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Leest één bestand: soort herkennen, parsen en vingerafdruk berekenen. */
export async function readActivityFile(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<{ parsed: ParsedActivity; source: Exclude<Source, 'handmatig'>; fingerprint: string }> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Dit bestand is groter dan 25 MB.');
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const source = sourceFor(file.name, bytes);
  if (!source) throw new Error('Onbekend bestandstype. Gebruik FIT, TCX of GPX.');
  const fingerprint = await sha256Hex(bytes);
  const parsed = source === 'fit' ? await parseFit(buffer) : source === 'tcx' ? parseTcx(new TextDecoder().decode(bytes)) : parseGpx(new TextDecoder().decode(bytes));
  return { parsed, source, fingerprint };
}
