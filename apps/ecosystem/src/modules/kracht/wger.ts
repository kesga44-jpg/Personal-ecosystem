/**
 * Oefeningen uit wger (https://wger.de), teruggebracht tot naam, licentie en auteur.
 * Gedeeld door de Worker en de app. Zuivere functies, geen netwerk.
 * Elke oefening heeft een eigen Creative Commons-licentie; die tonen we altijd met de auteur.
 */
import { WGER_LICENSES } from './exercises';

export interface WgerExercise {
  /** ID van de oefening in wger (niet van de vertaling). */
  id: number;
  name: string;
  /** Nederlandse naam als die bestaat. */
  nameNl: string | null;
  license: string;
  licenseUrl: string;
  author: string;
}

export interface WgerSearchResponse {
  exercises: WgerExercise[];
}

export const WGER_LANGUAGE = { en: 2, nl: 6 } as const;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Zet vertalingen (Engels en Nederlands) om naar één compacte catalogus. Onbekende licenties vallen weg. */
export function buildCatalog(english: unknown, dutch: unknown): WgerExercise[] {
  const list = (input: unknown) => {
    const results = (input as { results?: unknown[] } | null)?.results;
    return Array.isArray(results) ? (results as Record<string, unknown>[]) : [];
  };
  const dutchNames = new Map<number, string>();
  for (const item of list(dutch)) {
    const name = clean(item.name, 100);
    if (typeof item.exercise === 'number' && name) dutchNames.set(item.exercise, name);
  }
  const seen = new Set<number>();
  const catalog: WgerExercise[] = [];
  for (const item of list(english)) {
    const id = item.exercise;
    const name = clean(item.name, 100);
    const license = typeof item.license === 'number' ? WGER_LICENSES[item.license] : undefined;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || !name || !license || seen.has(id)) continue;
    seen.add(id);
    catalog.push({ id, name, nameNl: dutchNames.get(id) ?? null, license: license.short, licenseUrl: license.url, author: clean(item.license_author, 120) || 'wger.de' });
  }
  return catalog.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('nl-NL').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Zoekt in de catalogus op Engelse en Nederlandse naam; namen die met de zoekterm beginnen eerst. */
export function searchCatalog(catalog: WgerExercise[], query: string, limit = 20): WgerExercise[] {
  const needle = normalize(query.trim());
  if (needle.length < 2) return [];
  const scored = catalog
    .map((exercise) => {
      const names = [exercise.nameNl, exercise.name].filter((name): name is string => Boolean(name)).map(normalize);
      const starts = names.some((name) => name.startsWith(needle));
      const contains = names.some((name) => name.includes(needle));
      return { exercise, score: starts ? 2 : contains ? 1 : 0 };
    })
    .filter((item) => item.score > 0);
  return scored.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name, 'en')).slice(0, limit).map((item) => item.exercise);
}

export function isWgerExercise(value: unknown): value is WgerExercise {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WgerExercise>;
  return (
    Number.isInteger(item.id) &&
    (item.id as number) > 0 &&
    typeof item.name === 'string' &&
    item.name.length > 0 &&
    (item.nameNl === null || typeof item.nameNl === 'string') &&
    typeof item.license === 'string' &&
    typeof item.licenseUrl === 'string' &&
    /^https?:\/\//.test(item.licenseUrl) &&
    typeof item.author === 'string'
  );
}
