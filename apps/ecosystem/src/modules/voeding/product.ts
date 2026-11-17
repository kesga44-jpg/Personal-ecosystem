/**
 * Productgegevens uit Open Food Facts (ODbL), teruggebracht tot wat Voeding nodig heeft.
 * Gedeeld door de doorgeefserver (worker) en de app. Zuivere functies, geen netwerk.
 */

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface OffProduct {
  code: string;
  name: string;
  brand: string;
  /** Per 100 g of 100 ml. */
  per100: Nutrients;
  /** Portiegrootte in gram als Open Food Facts die kent. */
  servingGrams: number | null;
}

export const BARCODE_PATTERN = /^\d{8,14}$/;
export const QUERY_MIN = 2;
export const QUERY_MAX = 60;

export function isBarcode(value: string): boolean {
  return BARCODE_PATTERN.test(value);
}

/** Zoekterm opschonen: spaties samenvoegen, lengte begrenzen. Geeft null als de term te kort is. */
export function cleanQuery(value: string): string | null {
  const query = value.replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX);
  return query.length >= QUERY_MIN ? query : null;
}

function num(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * Zet een Open Food Facts-product om. Geeft null als naam of energie ontbreekt:
 * dan liever handmatig invoeren dan verzonnen waarden tonen.
 */
export function parseOffProduct(input: unknown): OffProduct | null {
  if (!input || typeof input !== 'object') return null;
  const product = input as Record<string, unknown>;
  const code = text(product.code, 14);
  const name = text(product.product_name_nl, 120) || text(product.product_name, 120);
  const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;
  const kcalDirect = num(nutriments['energy-kcal_100g']);
  const kj = num(nutriments['energy-kj_100g']) ?? num(nutriments.energy_100g);
  const kcal = kcalDirect ?? (kj !== null ? kj / 4.184 : null);
  if (!isBarcode(code) || !name || kcal === null || kcal > 900) return null;
  const macro = (key: string) => Math.min(100, round1(num(nutriments[`${key}_100g`]) ?? 0));
  const serving = num(product.serving_quantity);
  return {
    code,
    name,
    // Productpagina's geven merken als tekst ("A, B"), de zoekdienst als lijst (["A", "B"]).
    brand: (Array.isArray(product.brands) ? text(product.brands[0], 80) : text(product.brands, 80).split(',')[0]!).trim(),
    per100: { kcal: Math.round(kcal), protein: macro('proteins'), carbs: macro('carbohydrates'), fat: macro('fat') },
    servingGrams: serving !== null && serving > 0 && serving <= 2000 ? round1(serving) : null
  };
}

/** Zoekresultaten: `products` (oud zoekadres) of `hits` (zoekdienst search.openfoodfacts.org). */
export function parseOffSearch(input: unknown): OffProduct[] {
  const data = input as { products?: unknown[]; hits?: unknown[] } | null;
  const products = data?.hits ?? data?.products;
  if (!Array.isArray(products)) return [];
  const seen = new Set<string>();
  const result: OffProduct[] = [];
  for (const item of products) {
    const product = parseOffProduct(item);
    if (product && !seen.has(product.code)) {
      seen.add(product.code);
      result.push(product);
    }
  }
  return result.slice(0, 10);
}

/** Antwoorden van de doorgeefserver aan de app. */
export type ProductResponse = { found: true; product: OffProduct } | { found: false };
export interface SearchResponse {
  products: OffProduct[];
}
