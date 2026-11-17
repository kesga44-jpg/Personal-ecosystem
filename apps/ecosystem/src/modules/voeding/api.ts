/**
 * Het enige netwerkverkeer van Voeding: de eigen doorgeefroute op dezelfde origin (worker/index.ts).
 * Er gaat alleen een barcode of zoekterm mee; nooit innamegegevens of doelen.
 */
import { cleanQuery, isBarcode, type OffProduct, type ProductResponse, type SearchResponse } from './product';

async function request<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error('Geen verbinding. Voer het product zelf in of probeer het later opnieuw.');
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.error ?? 'Opzoeken is mislukt. Voer het product zelf in.');
  return body;
}

export async function lookupBarcode(code: string): Promise<OffProduct | null> {
  if (!isBarcode(code)) throw new Error('Een barcode bestaat uit 8 tot 14 cijfers.');
  const result = await request<ProductResponse>(`/api/voeding/product/${code}`);
  return result.found ? result.product : null;
}

export async function searchProducts(raw: string): Promise<OffProduct[]> {
  const query = cleanQuery(raw);
  if (!query) throw new Error('Typ minstens twee tekens.');
  const result = await request<SearchResponse>(`/api/voeding/zoeken?q=${encodeURIComponent(query)}`);
  return result.products;
}
