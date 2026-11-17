/**
 * Worker voor pe-hub: serveert de app (statische bestanden) en een kleine doorgeefroute voor Open Food Facts.
 *
 * Waarom: Open Food Facts vraagt elke app om zich met een eigen User-Agent te melden; een browser kan die niet zetten.
 * Wat er doorgaat: alleen een barcode of zoekterm. Geen gebruikers-ID, geen cookies, geen innamegegevens.
 * Er wordt niets gelogd of opgeslagen behalve een gedeelde cache van openbare productgegevens.
 */
import { cleanQuery, isBarcode, parseOffProduct, parseOffSearch, type ProductResponse, type SearchResponse } from '../src/modules/voeding/product';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Contact voor Open Food Facts in de User-Agent (e-mail of URL). Optioneel, als Worker-variabele. */
  OFF_CONTACT?: string;
}

const OFF = 'https://world.openfoodfacts.org';
const SEARCH = 'https://search.openfoodfacts.org';
const PRODUCT_FIELDS = 'code,product_name,product_name_nl,brands,nutriments,serving_quantity';
const PRODUCT_TTL = 7 * 24 * 3600;
const SEARCH_TTL = 24 * 3600;
const DEFAULT_CONTACT = 'https://github.com/kesga44-jpg/Personal-ecosystem';

export function userAgent(env: Pick<Env, 'OFF_CONTACT'>): string {
  const contact = (env.OFF_CONTACT ?? '').replace(/[^\w@.:/+-]/g, '').slice(0, 120) || DEFAULT_CONTACT;
  return `PersonalEcosystem/1.0 (${contact})`;
}

function json(body: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    }
  });
}

function problem(status: number, message: string): Response {
  return json({ error: message }, status);
}

/** Gedeelde Cloudflare-cache voor openbare productgegevens, zodat we Open Food Facts zo min mogelijk belasten. */
async function cached(key: string, ttl: number, load: () => Promise<Response>): Promise<Response> {
  const store = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  const request = new Request(key);
  if (store) {
    const hit = await store.match(request);
    if (hit) return hit;
  }
  const response = await load();
  // Alleen gevonden, openbare gegevens cachen; 'niet gevonden' en fouten niet.
  if (store && response.status === 200 && response.headers.get('cache-control')?.startsWith('public')) {
    const copy = new Response(response.clone().body, response);
    copy.headers.set('cache-control', `public, max-age=${ttl}`);
    await store.put(request, copy);
  }
  return response;
}

async function upstream(url: string, env: Env): Promise<Response | { status: number }> {
  try {
    return await fetch(url, {
      headers: { 'user-agent': userAgent(env), accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return { status: 504 };
  }
}

function upstreamProblem(status: number): Response {
  if (status === 429) return problem(429, 'Open Food Facts is even druk. Probeer het over een minuut opnieuw of voer het product zelf in.');
  return problem(502, 'Open Food Facts is nu niet bereikbaar. Voer het product zelf in of probeer het later opnieuw.');
}

export async function handleFoodApi(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return problem(405, 'Alleen opvragen is toegestaan.');
  const url = new URL(request.url);

  const productMatch = /^\/api\/voeding\/product\/([^/]+)$/.exec(url.pathname);
  if (productMatch) {
    const code = productMatch[1]!;
    if (!isBarcode(code)) return problem(400, 'Een barcode bestaat uit 8 tot 14 cijfers.');
    return cached(`${url.origin}/api/voeding/product/${code}`, PRODUCT_TTL, async () => {
      const response = await upstream(`${OFF}/api/v2/product/${code}?fields=${PRODUCT_FIELDS}`, env);
      if (response.status === 404) return json({ found: false } satisfies ProductResponse);
      if (!(response instanceof Response) || !response.ok) return upstreamProblem(response.status);
      const data = (await response.json().catch(() => null)) as { status?: unknown; product?: unknown } | null;
      const product = data?.status === 1 || data?.product ? parseOffProduct(data?.product) : null;
      // Onvolledige producten niet cachen: ze kunnen later in Open Food Facts worden aangevuld.
      return product ? json({ found: true, product } satisfies ProductResponse, 200, PRODUCT_TTL) : json({ found: false } satisfies ProductResponse);
    });
  }

  if (url.pathname === '/api/voeding/zoeken') {
    const query = cleanQuery(url.searchParams.get('q') ?? '');
    if (!query) return problem(400, 'Typ minstens twee tekens.');
    return cached(`${url.origin}/api/voeding/zoeken?q=${encodeURIComponent(query.toLowerCase())}`, SEARCH_TTL, async () => {
      // Eerst de zoekdienst van Open Food Facts (snel, Nederlandstalig); het oude zoekadres weigert verzoeken vanaf Cloudflare vaak.
      const primary = new URLSearchParams({ q: query, langs: 'nl,en', page_size: '20', fields: PRODUCT_FIELDS });
      const first = await upstream(`${SEARCH}/search?${primary.toString()}`, env);
      let response: Response;
      if (first instanceof Response && first.ok) {
        response = first;
      } else {
        const legacy = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '20', lc: 'nl', fields: PRODUCT_FIELDS });
        const fallback = await upstream(`${OFF}/cgi/search.pl?${legacy.toString()}`, env);
        if (!(fallback instanceof Response) || !fallback.ok) return upstreamProblem(fallback.status === 429 || first.status === 429 ? 429 : fallback.status);
        response = fallback;
      }
      const data = await response.json().catch(() => null);
      return json({ products: parseOffSearch(data) } satisfies SearchResponse, 200, SEARCH_TTL);
    });
  }

  return problem(404, 'Onbekende route.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname.startsWith('/api/voeding/')) return handleFoodApi(request, env);
      return problem(404, 'Onbekende route.');
    }
    return env.ASSETS.fetch(request);
  }
};
