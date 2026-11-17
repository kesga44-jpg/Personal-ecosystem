/**
 * Oefeningen uit wger (https://wger.de), teruggebracht tot naam, licentie en auteur.
 * Gedeeld door de Worker en de app. Zuivere functies, geen netwerk.
 * Elke oefening heeft een eigen licentie (meestal Creative Commons); die tonen en bewaren we altijd met de auteur.
 * De namenlijst (exercise-translation) bevat geen licentie; die komt per oefening uit exerciseinfo.
 */
import { WGER_LICENSES } from './exercises';

/** Zoekresultaat: alleen namen. De licentie staat in wger per oefening en wordt pas bij kiezen opgehaald. */
export interface WgerSearchItem {
  /** ID van de oefening in wger (niet van de vertaling). */
  id: number;
  name: string;
  /** Nederlandse naam als die bestaat. */
  nameNl: string | null;
}

/** Een gekozen oefening met bronvermelding, zoals die wordt overgenomen. */
export interface WgerExercise extends WgerSearchItem {
  license: string;
  licenseUrl: string;
  author: string;
}

export interface WgerSearchResponse {
  exercises: WgerSearchItem[];
}

export type WgerDetailResponse = { found: true; exercise: WgerExercise } | { found: false };

export const WGER_LANGUAGE = { en: 2, nl: 6 } as const;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function results(input: unknown): Record<string, unknown>[] {
  const list = (input as { results?: unknown[] } | null)?.results;
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : [];
}

function byName(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

/**
 * Leest alleen naam en oefening-ID uit de ruwe JSON van exercise-translation, zonder het hele antwoord
 * (~0,9 MB, vooral beschrijvingen) te parsen: dat past niet binnen de CPU-limiet van de gratis Worker.
 * Werkt op de veldvolgorde van wger ("name", direct gevolgd door "exercise"); vindt het niets, dan valt het
 * terug op gewoon parsen, zodat een gewijzigde volgorde alleen trager is, niet fout.
 */
export function translationsFromText(text: string): { results: { exercise: number; name: string }[] } {
  const results: { exercise: number; name: string }[] = [];
  const pattern = /"name":("(?:[^"\\]|\\.)*"),"exercise":(\d+)/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    try {
      results.push({ exercise: Number(match[2]), name: JSON.parse(match[1]!) as string });
    } catch {
      // Onleesbare naam overslaan.
    }
  }
  if (results.length) return { results };
  try {
    return { results: (JSON.parse(text) as { results?: { exercise: number; name: string }[] }).results ?? [] };
  } catch {
    return { results: [] };
  }
}

/** Zet vertalingen (Engels en Nederlands) om naar één compacte namenlijst. */
export function buildCatalog(english: unknown, dutch: unknown): WgerSearchItem[] {
  const dutchNames = new Map<number, string>();
  for (const item of results(dutch)) {
    const name = clean(item.name, 100);
    if (isId(item.exercise) && name) dutchNames.set(item.exercise, name);
  }
  const seen = new Set<number>();
  const catalog: WgerSearchItem[] = [];
  for (const item of results(english)) {
    const id = item.exercise;
    const name = clean(item.name, 100);
    if (!isId(id) || !name || seen.has(id)) continue;
    seen.add(id);
    catalog.push({ id, name, nameNl: dutchNames.get(id) ?? null });
  }
  // Niet sorteren: dat kost in de Worker te veel rekentijd (CPU-limiet); zoekresultaten worden wel gesorteerd.
  return catalog;
}

/**
 * Leest licentie en auteurs uit `exerciseinfo` van één oefening. Alleen bekende licenties (WGER_LICENSES).
 * Auteurs: van de oefening en van de Engelse en Nederlandse naam, zonder dubbelen.
 */
export function parseExerciseInfo(input: unknown): WgerExercise | null {
  if (!input || typeof input !== 'object') return null;
  const info = input as Record<string, unknown>;
  const licenseId = (info.license as { id?: unknown } | null)?.id ?? info.license;
  const license = typeof licenseId === 'number' ? WGER_LICENSES[licenseId] : undefined;
  if (!isId(info.id) || !license) return null;
  const translations = Array.isArray(info.translations) ? (info.translations as Record<string, unknown>[]) : [];
  const english = translations.find((item) => item.language === WGER_LANGUAGE.en);
  const dutch = translations.find((item) => item.language === WGER_LANGUAGE.nl);
  const name = clean(english?.name, 100);
  if (!name) return null;
  const authors = [...new Set([info.license_author, english?.license_author, dutch?.license_author].map((value) => clean(value, 60)).filter(Boolean))];
  return { id: info.id, name, nameNl: clean(dutch?.name, 100) || null, license: license.short, licenseUrl: license.url, author: authors.join(', ').slice(0, 120) || 'wger.de' };
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('nl-NL').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Zoekt in de catalogus op Engelse en Nederlandse naam; namen die met de zoekterm beginnen eerst. */
export function searchCatalog(catalog: WgerSearchItem[], query: string, limit = 20): WgerSearchItem[] {
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
  return scored.sort((a, b) => b.score - a.score || byName(a.exercise.name, b.exercise.name)).slice(0, limit).map((item) => item.exercise);
}

export function isWgerSearchItem(value: unknown): value is WgerSearchItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WgerSearchItem>;
  return isId(item.id) && typeof item.name === 'string' && item.name.length > 0 && (item.nameNl === null || typeof item.nameNl === 'string');
}

export function isWgerExercise(value: unknown): value is WgerExercise {
  if (!isWgerSearchItem(value)) return false;
  const item = value as Partial<WgerExercise>;
  return typeof item.license === 'string' && typeof item.licenseUrl === 'string' && /^https?:\/\//.test(item.licenseUrl) && typeof item.author === 'string';
}
