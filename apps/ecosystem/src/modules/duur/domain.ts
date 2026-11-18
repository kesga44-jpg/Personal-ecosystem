/**
 * Duur (ADR 0020, uitbreiding Sport): duurtrainingen met route, hartslag en tempo.
 * Zuivere functies: geen netwerk, geen opslag. GPS-punten blijven op dit apparaat.
 */

export const SPORTS = ['hardlopen', 'fietsen', 'wandelen', 'zwemmen', 'roeien', 'overig'] as const;
export type Sport = (typeof SPORTS)[number];

export const sportLabels: Record<Sport, string> = {
  hardlopen: 'Hardlopen',
  fietsen: 'Fietsen',
  wandelen: 'Wandelen',
  zwemmen: 'Zwemmen',
  roeien: 'Roeien',
  overig: 'Overig'
};

export const SOURCES = ['fit', 'tcx', 'gpx', 'handmatig'] as const;
export type Source = (typeof SOURCES)[number];

/** Eén meetpunt. `t` = seconden sinds de start, `d` = afgelegde meters (cumulatief). */
export interface TrackPoint {
  t: number;
  lat: number | null;
  lon: number | null;
  hr: number | null;
  ele: number | null;
  d: number | null;
}

/** Resultaat van een parser, vóór opslag. */
export interface ParsedActivity {
  sport: Sport;
  startedAt: string;
  points: TrackPoint[];
  /** Totalen zoals het apparaat ze opgaf (betrouwbaarder dan zelf rekenen), als ze er zijn. */
  totals: Partial<Record<'durationSec' | 'movingSec' | 'distanceM' | 'ascentM' | 'avgHr' | 'maxHr' | 'calories', number>>;
}

export interface Workout {
  id: string;
  title: string;
  sport: Sport;
  startedAt: string;
  /** Lokale datum (JJJJ-MM-DD) van de start. */
  date: string;
  durationSec: number;
  movingSec: number | null;
  distanceM: number | null;
  ascentM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
  source: Source;
  fileName: string | null;
  /** SHA-256 van het bestand, om dubbele import te herkennen. */
  fingerprint: string | null;
  hasTrack: boolean;
  notes: string;
}

/** Compacte route in een aparte store: [t, lat, lon, hr, ele, d]. */
export type CompactPoint = [number, number | null, number | null, number | null, number | null, number | null];

export interface Track {
  id: string;
  points: CompactPoint[];
}

export interface DuurSettings {
  id: 'settings';
  maxHr: number | null;
}

export const MAX_TRACK_POINTS = 3000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isNum = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isNullableNum = (value: unknown, min: number, max: number) => value === null || isNum(value, min, max);
const shortText = (value: unknown, max: number) => typeof value === 'string' && value.length <= max;

export function isSport(value: unknown): value is Sport {
  return typeof value === 'string' && (SPORTS as readonly string[]).includes(value);
}

export function localDateKey(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/* ---------- Afstand en samenvatting ---------- */

const EARTH_RADIUS_M = 6_371_000;

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Vult ontbrekende cumulatieve afstanden aan uit GPS. Gaten zonder GPS tellen niet mee. */
export function withDistances(points: TrackPoint[]): TrackPoint[] {
  if (points.some((point) => point.d !== null)) {
    // Apparaatafstand gebruiken; ontbrekende waarden krijgen de vorige.
    let last = 0;
    return points.map((point) => {
      last = point.d ?? last;
      return { ...point, d: last };
    });
  }
  let total = 0;
  let previous: TrackPoint | null = null;
  return points.map((point) => {
    if (previous && previous.lat !== null && previous.lon !== null && point.lat !== null && point.lon !== null) {
      total += haversine(previous.lat, previous.lon, point.lat, point.lon);
    }
    if (point.lat !== null && point.lon !== null) previous = point;
    return { ...point, d: point.lat !== null ? Math.round(total * 10) / 10 : null };
  });
}

/** Stijging met 3 m drempel tegen GPS-ruis. */
export function ascent(points: TrackPoint[]): number | null {
  const heights = points.map((point) => point.ele).filter((value): value is number => value !== null);
  if (heights.length < 2) return null;
  let gain = 0;
  let reference = heights[0]!;
  for (const height of heights) {
    if (height - reference >= 3) {
      gain += height - reference;
      reference = height;
    } else if (height < reference) {
      reference = height;
    }
  }
  return Math.round(gain);
}

/** Tijd in beweging: stukken met minimaal 0,5 m/s en zonder pauze langer dan 30 s. */
export function movingTime(points: TrackPoint[]): number | null {
  if (points.length < 2 || points.every((point) => point.d === null)) return null;
  let moving = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const dt = current.t - previous.t;
    if (dt <= 0 || dt > 30 || previous.d === null || current.d === null) continue;
    if ((current.d - previous.d) / dt >= 0.5) moving += dt;
  }
  return Math.round(moving);
}

export function heartRateStats(points: TrackPoint[]): { avg: number; max: number } | null {
  const values = points.map((point) => point.hr).filter((value): value is number => value !== null && value > 0);
  if (!values.length) return null;
  return { avg: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), max: Math.max(...values) };
}

export interface Summary {
  durationSec: number;
  movingSec: number | null;
  distanceM: number | null;
  ascentM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  calories: number | null;
}

/** Totalen van het apparaat gaan voor; anders berekend uit de punten. */
export function summarize(activity: ParsedActivity): Summary {
  const points = withDistances(activity.points);
  const last = points.at(-1);
  const hr = heartRateStats(points);
  const distance = activity.totals.distanceM ?? (last?.d ?? null);
  return {
    durationSec: Math.round(activity.totals.durationSec ?? last?.t ?? 0),
    movingSec: activity.totals.movingSec !== undefined ? Math.round(activity.totals.movingSec) : movingTime(points),
    distanceM: distance !== null && distance > 0 ? Math.round(distance) : null,
    ascentM: activity.totals.ascentM !== undefined ? Math.round(activity.totals.ascentM) : ascent(points),
    avgHr: activity.totals.avgHr !== undefined ? Math.round(activity.totals.avgHr) : hr?.avg ?? null,
    maxHr: activity.totals.maxHr !== undefined ? Math.round(activity.totals.maxHr) : hr?.max ?? null,
    calories: activity.totals.calories !== undefined ? Math.round(activity.totals.calories) : null
  };
}

/** Verkleint een lange route tot maximaal `max` punten (gelijkmatig, eerste en laatste blijven). */
export function downsample<T>(points: T[], max = MAX_TRACK_POINTS): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]!);
}

const round = (value: number | null, digits: number) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export function compactTrack(points: TrackPoint[]): CompactPoint[] {
  return downsample(withDistances(points)).map((point) => [Math.round(point.t), round(point.lat, 6), round(point.lon, 6), point.hr, round(point.ele, 1), round(point.d, 1)]);
}

export function expandTrack(track: Track): TrackPoint[] {
  return track.points.map(([t, lat, lon, hr, ele, d]) => ({ t, lat, lon, hr, ele, d }));
}

export function hasRoute(points: TrackPoint[]): boolean {
  return points.filter((point) => point.lat !== null && point.lon !== null).length >= 2;
}

/* ---------- Analyses ---------- */

export interface Split {
  km: number;
  /** Seconden voor deze kilometer (laatste deel naar verhouding). */
  seconds: number;
  /** Afstand van dit deel in meters (1000, behalve het laatste). */
  meters: number;
  avgHr: number | null;
}

/** Tussentijden per kilometer uit cumulatieve afstand en tijd. */
export function kmSplits(points: TrackPoint[]): Split[] {
  const withD = withDistances(points).filter((point) => point.d !== null);
  if (withD.length < 2) return [];
  const splits: Split[] = [];
  let startTime = withD[0]!.t;
  let startDistance = withD[0]!.d!;
  let heartRates: number[] = [];
  for (let index = 1; index < withD.length; index += 1) {
    const previous = withD[index - 1]!;
    const current = withD[index]!;
    if (current.hr) heartRates.push(current.hr);
    const target = startDistance + 1000;
    if (current.d! >= target && current.d! > previous.d!) {
      const fraction = (target - previous.d!) / (current.d! - previous.d!);
      const time = previous.t + fraction * (current.t - previous.t);
      splits.push({ km: splits.length + 1, seconds: Math.round(time - startTime), meters: 1000, avgHr: heartRates.length ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null });
      startTime = time;
      startDistance = target;
      heartRates = [];
    }
  }
  const last = withD.at(-1)!;
  const rest = last.d! - startDistance;
  if (rest >= 50) {
    splits.push({ km: splits.length + 1, seconds: Math.round(last.t - startTime), meters: Math.round(rest), avgHr: heartRates.length ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null });
  }
  return splits;
}

export const ZONE_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;
export const zoneLabels = ['Zone 1 · herstel', 'Zone 2 · rustig', 'Zone 3 · tempo', 'Zone 4 · drempel', 'Zone 5 · maximaal'] as const;

/** Seconden per hartslagzone (percentage van maximale hartslag). Onder 50% telt niet mee. */
export function heartRateZones(points: TrackPoint[], maxHr: number): number[] {
  const zones = [0, 0, 0, 0, 0];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const dt = point.t - points[index - 1]!.t;
    if (!point.hr || dt <= 0 || dt > 30) continue;
    const ratio = point.hr / maxHr;
    let zone = -1;
    for (let z = ZONE_BOUNDS.length - 1; z >= 0; z -= 1) {
      if (ratio >= ZONE_BOUNDS[z]!) {
        zone = z;
        break;
      }
    }
    if (zone >= 0) zones[zone]! += dt;
  }
  return zones.map(Math.round);
}

/** Tempo of snelheid per punt voor een grafiek, gladgestreken over ~30 s. */
export function speedSeries(points: TrackPoint[], maxPoints = 120): { t: number; mps: number }[] {
  const withD = withDistances(points).filter((point) => point.d !== null);
  if (withD.length < 2) return [];
  const series: { t: number; mps: number }[] = [];
  let back = 0;
  for (let index = 1; index < withD.length; index += 1) {
    const current = withD[index]!;
    while (back < index && current.t - withD[back]!.t > 30) back += 1;
    const from = withD[Math.max(0, Math.min(back, index - 1))]!;
    const dt = current.t - from.t;
    if (dt > 0) series.push({ t: current.t, mps: (current.d! - from.d!) / dt });
  }
  return downsample(series, maxPoints);
}

/* ---------- Opmaak ---------- */

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDistance(meters: number | null): string {
  if (meters === null) return '—';
  return meters >= 1000 ? `${(meters / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} km` : `${Math.round(meters)} m`;
}

/** Hardlopen en wandelen in min/km, zwemmen in min/100 m, fietsen en roeien in km/u. */
export function formatPace(sport: Sport, meters: number | null, seconds: number | null): string {
  if (!meters || !seconds || meters <= 0 || seconds <= 0) return '—';
  if (sport === 'zwemmen') return `${formatDuration((seconds / meters) * 100)} /100 m`;
  if (sport === 'fietsen' || sport === 'roeien' || sport === 'overig') return `${((meters / seconds) * 3.6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km/u`;
  return `${formatDuration((seconds / meters) * 1000)} /km`;
}

/* ---------- Validatie ---------- */

export function validateWorkout(value: unknown, today?: string): asserts value is Workout {
  if (!value || typeof value !== 'object') throw new Error('Ongeldige training.');
  const workout = value as Partial<Workout>;
  if (typeof workout.id !== 'string' || !workout.id || workout.id.length > 120) throw new Error('Training heeft een ongeldig ID.');
  if (typeof workout.title !== 'string' || !workout.title.trim() || workout.title.length > 100) throw new Error('Geef de training een naam (maximaal 100 tekens).');
  if (!isSport(workout.sport)) throw new Error('Kies een sport.');
  if (typeof workout.startedAt !== 'string' || !Number.isFinite(Date.parse(workout.startedAt))) throw new Error('Training heeft een ongeldige starttijd.');
  if (typeof workout.date !== 'string' || !DATE_PATTERN.test(workout.date)) throw new Error('Training heeft een ongeldige datum.');
  if (today && workout.date > today) throw new Error('Een training kan niet in de toekomst liggen.');
  if (!isNum(workout.durationSec, 1, 7 * 24 * 3600)) throw new Error('Duur moet tussen 1 seconde en 7 dagen liggen.');
  if (!isNullableNum(workout.movingSec, 0, 7 * 24 * 3600)) throw new Error('Tijd in beweging is ongeldig.');
  if (!isNullableNum(workout.distanceM, 0, 2_000_000)) throw new Error('Afstand moet tussen 0 en 2000 km liggen.');
  if (!isNullableNum(workout.ascentM, 0, 50_000)) throw new Error('Hoogtemeters zijn ongeldig.');
  if (!isNullableNum(workout.avgHr, 20, 250) || !isNullableNum(workout.maxHr, 20, 250)) throw new Error('Hartslag moet tussen 20 en 250 liggen.');
  if (!isNullableNum(workout.calories, 0, 50_000)) throw new Error('Calorieën zijn ongeldig.');
  if (!(SOURCES as readonly string[]).includes(workout.source as string)) throw new Error('Onbekende bron.');
  if (!(workout.fileName === null || shortText(workout.fileName, 200))) throw new Error('Bestandsnaam is te lang.');
  if (!(workout.fingerprint === null || (typeof workout.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(workout.fingerprint)))) throw new Error('Ongeldige vingerafdruk.');
  if (typeof workout.hasTrack !== 'boolean') throw new Error('Ongeldige routegegevens.');
  if (!shortText(workout.notes, 2000)) throw new Error('Notities mogen maximaal 2000 tekens hebben.');
}

export function validateTrack(value: unknown): asserts value is Track {
  if (!value || typeof value !== 'object') throw new Error('Ongeldige route.');
  const track = value as Partial<Track>;
  if (typeof track.id !== 'string' || !track.id) throw new Error('Route heeft een ongeldig ID.');
  if (!Array.isArray(track.points) || track.points.length > MAX_TRACK_POINTS) throw new Error(`Een route heeft maximaal ${MAX_TRACK_POINTS} punten.`);
  for (const point of track.points) {
    if (!Array.isArray(point) || point.length !== 6) throw new Error('Route bevat een ongeldig punt.');
    const [t, lat, lon, hr, ele, d] = point;
    if (!isNum(t, 0, 7 * 24 * 3600) || !isNullableNum(lat, -90, 90) || !isNullableNum(lon, -180, 180) || !isNullableNum(hr, 0, 255) || !isNullableNum(ele, -500, 9000) || !isNullableNum(d, 0, 2_000_000)) {
      throw new Error('Route bevat een ongeldig punt.');
    }
  }
}

export function validateSettings(value: unknown): asserts value is DuurSettings {
  const settings = value as Partial<DuurSettings> | null;
  if (!settings || settings.id !== 'settings' || !isNullableNum(settings.maxHr, 120, 230)) throw new Error('Maximale hartslag moet tussen 120 en 230 liggen.');
}

export function validateDuurBackup(input: unknown): void {
  if (!input || typeof input !== 'object' || !('stores' in input) || !input.stores || typeof input.stores !== 'object') {
    throw new Error('Back-up van Duur heeft geen geldige gegevenssectie.');
  }
  const stores = input.stores as Record<string, unknown>;
  if (!Array.isArray(stores.workouts) || !Array.isArray(stores.tracks) || !Array.isArray(stores.settings)) throw new Error('Back-up van Duur mist trainingen, routes of instellingen.');
  for (const workout of stores.workouts) validateWorkout(workout);
  for (const track of stores.tracks) validateTrack(track);
  for (const settings of stores.settings) validateSettings(settings);
}

/** Maakt een op te slaan training uit een geïmporteerde activiteit. */
export function workoutFromParsed(parsed: ParsedActivity, meta: { id: string; fileName: string; fingerprint: string; source: Source }): { workout: Workout; track: Track | null } {
  const summary = summarize(parsed);
  const hasTrack = parsed.points.length >= 2;
  const date = localDateKey(parsed.startedAt);
  return {
    workout: {
      id: meta.id,
      title: `${sportLabels[parsed.sport]} ${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(new Date(parsed.startedAt))}`,
      sport: parsed.sport,
      startedAt: new Date(parsed.startedAt).toISOString(),
      date,
      durationSec: Math.max(1, summary.durationSec),
      movingSec: summary.movingSec,
      distanceM: summary.distanceM,
      ascentM: summary.ascentM,
      avgHr: summary.avgHr,
      maxHr: summary.maxHr,
      calories: summary.calories,
      source: meta.source,
      fileName: meta.fileName.slice(0, 200),
      fingerprint: meta.fingerprint,
      hasTrack,
      notes: ''
    },
    track: hasTrack ? { id: meta.id, points: compactTrack(parsed.points) } : null
  };
}

/* ---------- Overzichten ---------- */

function mondayOf(date: string): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Kilometers en minuten per week (maandag–zondag), laatste `count` weken. */
export function weeklyVolume(workouts: Pick<Workout, 'date' | 'distanceM' | 'durationSec'>[], today: string, count = 8): { week: string; label: string; km: number; minutes: number; sessions: number }[] {
  const thisWeek = mondayOf(today);
  return Array.from({ length: count }, (_, index) => {
    const week = shiftDate(thisWeek, -7 * (count - 1 - index));
    const end = shiftDate(week, 6);
    const inWeek = workouts.filter((workout) => workout.date >= week && workout.date <= end);
    return {
      week,
      label: `${week.slice(8, 10)}-${week.slice(5, 7)}`,
      km: Math.round(inWeek.reduce((sum, workout) => sum + (workout.distanceM ?? 0), 0) / 100) / 10,
      minutes: Math.round(inWeek.reduce((sum, workout) => sum + workout.durationSec, 0) / 60),
      sessions: inWeek.length
    };
  });
}

/** Leescontract voor het dashboard (DATA_OWNERSHIP.md): alleen totalen van deze week, geen routes of hartslag. */
export function weekTotals(workouts: Pick<Workout, 'date' | 'distanceM' | 'durationSec'>[], today: string): { sessions: number; km: number; minutes: number } {
  const start = mondayOf(today);
  const inWeek = workouts.filter((workout) => workout.date >= start && workout.date <= today);
  return {
    sessions: inWeek.length,
    km: Math.round(inWeek.reduce((sum, workout) => sum + (workout.distanceM ?? 0), 0) / 100) / 10,
    minutes: Math.round(inWeek.reduce((sum, workout) => sum + workout.durationSec, 0) / 60)
  };
}
