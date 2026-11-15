export type SportType = 'run' | 'walk' | 'bike' | 'swim' | 'strength' | 'other';

export interface Activity {
  id: string;
  startedAt: string;
  type: SportType;
  durationMinutes: number;
  distanceKm: number | null;
  notes: string;
  sourceFingerprint?: string;
  trainingId?: string;
}

export interface Training {
  id: string;
  title: string;
  category: string;
  goal: string;
  targetMinutes: number;
  archived: boolean;
}

export interface SportStats {
  count: number;
  distanceKm: number;
  durationMinutes: number;
  byType: Partial<Record<SportType, number>>;
}

export interface GpxPreview {
  name: string;
  startedAt: string;
  durationMinutes: number;
  distanceKm: number;
}

export const sportLabels: Record<SportType, string> = {
  run: 'Hardlopen',
  walk: 'Wandelen',
  bike: 'Fietsen',
  swim: 'Zwemmen',
  strength: 'Krachttraining',
  other: 'Overig'
};

export function validateSportActivity(value: unknown): asserts value is Activity {
  if (!value || typeof value !== 'object') {
    throw new Error('Sportapp bevat een ongeldige activiteit.');
  }
  const activity = value as Partial<Activity>;
  if (
    typeof activity.id !== 'string' ||
    !activity.id.trim() ||
    activity.id.length > 200 ||
    typeof activity.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(activity.startedAt)) ||
    typeof activity.type !== 'string' ||
    !Object.hasOwn(sportLabels, activity.type) ||
    !Number.isInteger(activity.durationMinutes) ||
    activity.durationMinutes! < 1 ||
    !(activity.distanceKm === null || (typeof activity.distanceKm === 'number' && Number.isFinite(activity.distanceKm) && activity.distanceKm > 0)) ||
    typeof activity.notes !== 'string' ||
    activity.notes.length > 1000 ||
    (activity.sourceFingerprint !== undefined && !/^[a-f0-9]{64}$/.test(activity.sourceFingerprint)) ||
    (activity.trainingId !== undefined && (typeof activity.trainingId !== 'string' || !activity.trainingId.trim()))
  ) {
    throw new Error('Sportapp-back-up bevat ongeldige activiteitgegevens.');
  }
}

export function validateSportBackup(input: unknown): void {
  if (!input || typeof input !== 'object' || !('stores' in input) || !input.stores || typeof input.stores !== 'object') {
    throw new Error('Sportapp-back-up heeft geen geldige gegevenssectie.');
  }
  const stores = input.stores as Record<string, unknown>;
  const activities = stores.activities;
  const trainings = stores.trainings;
  if (!Array.isArray(activities) || !Array.isArray(trainings)) {
    throw new Error('Sportapp-back-up mist activiteiten of trainingen.');
  }

  const fingerprints = new Set<string>();
  for (const value of activities) {
    validateSportActivity(value);
    const activity = value as Activity;
    if (activity.sourceFingerprint) {
      if (fingerprints.has(activity.sourceFingerprint)) throw new Error('Sportapp-back-up bevat dubbele GPX-importen.');
      fingerprints.add(activity.sourceFingerprint);
    }
  }

  for (const value of trainings) {
    if (!value || typeof value !== 'object') throw new Error('Sportapp-back-up bevat een ongeldige training.');
    const training = value as Partial<Training>;
    if (
      typeof training.title !== 'string' ||
      !training.title.trim() ||
      training.title.length > 100 ||
      typeof training.category !== 'string' ||
      !training.category.trim() ||
      training.category.length > 60 ||
      typeof training.goal !== 'string' ||
      training.goal.length > 500 ||
      !Number.isInteger(training.targetMinutes) ||
      training.targetMinutes! < 1 ||
      typeof training.archived !== 'boolean'
    ) {
      throw new Error('Sportapp-back-up bevat ongeldige trainingsgegevens.');
    }
  }
}

export function calculateSportStats(activities: Activity[]): SportStats {
  return activities.reduce<SportStats>(
    (stats, activity) => {
      stats.count += 1;
      stats.distanceKm += activity.distanceKm ?? 0;
      stats.durationMinutes += activity.durationMinutes;
      stats.byType[activity.type] = (stats.byType[activity.type] ?? 0) + 1;
      return stats;
    },
    { count: 0, distanceKm: 0, durationMinutes: 0, byType: {} }
  );
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371.0088;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function parseGpxTimestamp(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return Number.NaN;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, zoneHourText, zoneMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  const zoneHour = Number(zoneHourText ?? 0);
  const zoneMinute = Number(zoneMinuteText ?? 0);
  if (
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    (zone !== 'Z' && (zoneHour > 23 || zoneMinute > 59))
  ) {
    return Number.NaN;
  }
  return Date.parse(value);
}

export function parseGpx(content: string, fileName: string): GpxPreview {
  if (!content.trim() || /<!DOCTYPE|<!ENTITY/i.test(content)) {
    throw new Error('Dit GPX-bestand is leeg of bevat onveilige XML-instructies.');
  }
  if (typeof DOMParser === 'undefined') {
    throw new Error('GPX-import is niet beschikbaar in deze browser.');
  }

  const document = new DOMParser().parseFromString(content, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'gpx') {
    throw new Error('Dit bestand is geen geldige GPX.');
  }

  const segments = Array.from(document.getElementsByTagNameNS('*', 'trkseg'));
  const pointGroups = segments.length
    ? segments.map((segment) => Array.from(segment.getElementsByTagNameNS('*', 'trkpt')))
    : [Array.from(document.getElementsByTagNameNS('*', 'trkpt'))];
  if (pointGroups.reduce((count, group) => count + group.length, 0) < 2) {
    throw new Error('GPX bevat geen bruikbare route met minimaal twee punten.');
  }

  const times: number[] = [];
  let distanceKm = 0;
  for (const group of pointGroups) {
    let previous: { lat: number; lon: number } | null = null;
    for (const point of group) {
      const latText = point.getAttribute('lat');
      const lonText = point.getAttribute('lon');
      if (!latText?.trim() || !lonText?.trim()) {
        throw new Error('GPX bevat een routepunt zonder latitude of longitude.');
      }
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(latText.trim()) ||
          !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(lonText.trim())) {
        throw new Error('GPX bevat ongeldige GPS-coördinaten.');
      }
      const lat = Number(latText);
      const lon = Number(lonText);
      if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
        throw new Error('GPX bevat ongeldige GPS-coördinaten.');
      }
      const timeText = point.getElementsByTagNameNS('*', 'time')[0]?.textContent?.trim();
      if (timeText) {
        const time = parseGpxTimestamp(timeText);
        if (!Number.isFinite(time)) throw new Error('GPX bevat een ongeldige datum.');
        if (times.length && time < times[times.length - 1]!) {
          throw new Error('GPX-tijdstempels staan niet in oplopende volgorde.');
        }
        times.push(time);
      }
      if (previous) distanceKm += haversineDistanceKm(previous.lat, previous.lon, lat, lon);
      previous = { lat, lon };
    }
  }
  if (distanceKm <= 0) throw new Error('GPX-route heeft geen meetbare afstand.');
  if (times.length < 2) {
    throw new Error('GPX bevat onvoldoende bruikbare tijdstempels om een geldige duur te bepalen.');
  }

  const elapsed = times[times.length - 1]! - times[0]!;
  if (elapsed <= 0) throw new Error('GPX bevat geen geldige, positieve tijdsduur.');
  const durationMinutes = Math.max(1, Math.round(elapsed / 60_000));
  const firstTime = new Date(times[0]!).toISOString();
  const name = document.getElementsByTagNameNS('*', 'name')[0]?.textContent?.trim() || fileName.replace(/\.gpx$/i, '');

  return {
    name: name.slice(0, 100),
    startedAt: firstTime,
    durationMinutes,
    distanceKm: Math.round(distanceKm * 10_000) / 10_000
  };
}

export async function fingerprintFile(content: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Bestandscontrole vereist een beveiligde browserverbinding.');
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
