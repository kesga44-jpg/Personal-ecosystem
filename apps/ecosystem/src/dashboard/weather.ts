/**
 * Weer via Open-Meteo (gratis, niet-commercieel, CC BY 4.0; https://open-meteo.com/en/terms).
 * Privacy: we sturen alleen een tot 2 decimalen afgeronde locatie (ca. 1 km) mee, nooit andere gegevens.
 */

export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface WeatherNow {
  temperature: number;
  code: number;
  windKmh: number;
  min: number;
  max: number;
  rainChance: number | null;
}

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const storageKey = 'personal-ecosystem.dashboard.weather-location';

export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function forecastUrl(location: Pick<WeatherLocation, 'latitude' | 'longitude'>): string {
  const params = new URLSearchParams({
    latitude: roundCoordinate(location.latitude).toFixed(2),
    longitude: roundCoordinate(location.longitude).toFixed(2),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '1'
  });
  return `${FORECAST}?${params.toString()}`;
}

export function geocodingUrl(query: string): string {
  const params = new URLSearchParams({ name: query.trim().slice(0, 80), count: '5', language: 'nl', format: 'json' });
  return `${GEOCODING}?${params.toString()}`;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Leest het Open-Meteo-antwoord defensief; ontbrekende waarden geven een fout in plaats van verzonnen getallen. */
export function parseForecast(input: unknown): WeatherNow {
  const data = (input ?? {}) as { current?: Record<string, unknown>; daily?: Record<string, unknown[]> };
  const temperature = finite(data.current?.temperature_2m);
  const code = finite(data.current?.weather_code);
  const wind = finite(data.current?.wind_speed_10m);
  const max = finite(data.daily?.temperature_2m_max?.[0]);
  const min = finite(data.daily?.temperature_2m_min?.[0]);
  if (temperature === null || code === null || wind === null || max === null || min === null) {
    throw new Error('Het weerbericht is onvolledig.');
  }
  return { temperature, code, windKmh: wind, min, max, rainChance: finite(data.daily?.precipitation_probability_max?.[0]) };
}

export function parseGeocoding(input: unknown): WeatherLocation[] {
  const results = (input as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((item) => {
    const place = item as Record<string, unknown>;
    const latitude = finite(place.latitude);
    const longitude = finite(place.longitude);
    if (latitude === null || longitude === null || typeof place.name !== 'string') return [];
    const region = [place.admin1, place.country].filter((part) => typeof part === 'string').join(', ');
    return [{ name: region ? `${place.name}, ${region}` : place.name, latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }];
  });
}

/** WMO-weercodes naar Nederlandse omschrijving en symbool. */
export function describeWeather(code: number): { label: string; icon: string } {
  if (code === 0) return { label: 'Onbewolkt', icon: '☀️' };
  if (code <= 2) return { label: 'Licht bewolkt', icon: '🌤️' };
  if (code === 3) return { label: 'Bewolkt', icon: '☁️' };
  if (code === 45 || code === 48) return { label: 'Mist', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { label: 'Motregen', icon: '🌦️' };
  if (code >= 61 && code <= 67) return { label: 'Regen', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Sneeuw', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { label: 'Buien', icon: '🌦️' };
  if (code >= 85 && code <= 86) return { label: 'Sneeuwbuien', icon: '🌨️' };
  if (code >= 95) return { label: 'Onweer', icon: '⛈️' };
  return { label: 'Onbekend', icon: '•' };
}

/** Eenvoudig sportadvies op basis van het weer (regelgebaseerd, ADR 0008). */
export function trainingAdvice(weather: WeatherNow): string {
  if (weather.code >= 95) return 'Onweer: train vandaag binnen.';
  if ((weather.rainChance ?? 0) >= 70) return 'Grote kans op regen: kies een binnentraining of neem regenkleding mee.';
  if (weather.max >= 28) return 'Warm: train vroeg of laat en drink extra.';
  if (weather.min <= 0) return 'Koud en mogelijk glad: warm goed op en let op de ondergrond.';
  if (weather.windKmh >= 40) return 'Harde wind: plan je route met wind mee op de terugweg.';
  return 'Prima weer om buiten te trainen.';
}

export function readLocation(): WeatherLocation | null {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<WeatherLocation> | null;
    if (!raw || typeof raw.name !== 'string' || finite(raw.latitude) === null || finite(raw.longitude) === null) return null;
    return { name: raw.name.slice(0, 120), latitude: roundCoordinate(raw.latitude!), longitude: roundCoordinate(raw.longitude!) };
  } catch {
    return null;
  }
}

export function writeLocation(location: WeatherLocation | null): void {
  try {
    if (location) localStorage.setItem(storageKey, JSON.stringify(location));
    else localStorage.removeItem(storageKey);
  } catch {
    // Alleen een voorkeur.
  }
}
