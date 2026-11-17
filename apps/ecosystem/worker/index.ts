/**
 * Worker voor pe-hub: serveert de app (statische bestanden) en kleine doorgeefroutes voor Open Food Facts en wger.
 *
 * Waarom: Open Food Facts vraagt elke app om zich met een eigen User-Agent te melden; een browser kan die niet zetten.
 * wger heeft geen zoekfunctie in de API; de Worker haalt daarom de openbare lijst met oefeningnamen op,
 * houdt alleen ID en naam over en bewaart die compacte lijst een week in de cache. Licentie en auteur van
 * één oefening komen pas bij kiezen uit exerciseinfo (ook een week in de cache).
 * Wat er doorgaat: alleen een barcode of zoekterm. Geen gebruikers-ID, geen cookies, geen innamegegevens.
 * Er wordt niets gelogd of opgeslagen behalve een gedeelde cache van openbare productgegevens.
 */
import { cleanQuery, isBarcode, parseOffProduct, parseOffSearch, type ProductResponse, type SearchResponse } from '../src/modules/voeding/product';
import { WGER_LANGUAGE, buildCatalog, parseExerciseInfo, searchCatalog, translationsFromText, type WgerDetailResponse, type WgerSearchItem, type WgerSearchResponse } from '../src/modules/kracht/wger';

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

const WGER = 'https://wger.de/api/v2/exercise-translation/';
const WGER_INFO = 'https://wger.de/api/v2/exerciseinfo/';
const WGER_TTL = 7 * 24 * 3600;
/** Catalogus per Worker-instantie in het geheugen, zodat de cache niet bij elke zoekopdracht gelezen hoeft te worden. */
let memoryCatalog: { loadedAt: number; catalog: WgerSearchItem[] } | null = null;

function wgerProblem(status: number): Response {
  return status === 429
    ? problem(429, 'wger is even druk. Probeer het over een minuut opnieuw of voer de oefening zelf in.')
    : problem(502, 'wger is nu niet bereikbaar. Kies een basisoefening of voer de oefening zelf in.');
}

async function loadWgerCatalog(origin: string, env: Env): Promise<WgerSearchItem[] | Response> {
  if (memoryCatalog && Date.now() - memoryCatalog.loadedAt < 3600_000) return memoryCatalog.catalog;
  const response = await cached(`${origin}/api/kracht/_catalogus-v2`, WGER_TTL, async () => {
    const list = (language: number) => upstream(`${WGER}?language=${language}&limit=2000&format=json`, env);
    const [english, dutch] = await Promise.all([list(WGER_LANGUAGE.en), list(WGER_LANGUAGE.nl)]);
    if (!(english instanceof Response) || !english.ok) return wgerProblem(english.status);
    const englishData = translationsFromText(await english.text().catch(() => ''));
    // Nederlandse namen zijn een aanvulling; zonder die lijst werkt zoeken op Engelse naam gewoon door.
    const dutchData = dutch instanceof Response && dutch.ok ? translationsFromText(await dutch.text().catch(() => '')) : null;
    const catalog = buildCatalog(englishData, dutchData);
    if (!catalog.length) return problem(502, 'wger gaf geen bruikbare oefeningen terug. Probeer het later opnieuw.');
    return json(catalog, 200, WGER_TTL);
  });
  if (!response.ok) return response;
  const catalog = (await response.json().catch(() => null)) as WgerSearchItem[] | null;
  if (!Array.isArray(catalog)) return problem(502, 'De oefeningenlijst kon niet worden gelezen.');
  memoryCatalog = { loadedAt: Date.now(), catalog };
  return catalog;
}

export async function handleStrengthApi(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return problem(405, 'Alleen opvragen is toegestaan.');
  const url = new URL(request.url);
  const detail = /^\/api\/kracht\/oefening\/([1-9]\d{0,6})$/.exec(url.pathname);
  if (detail) {
    const id = Number(detail[1]);
    return cached(`${url.origin}/api/kracht/oefening/${id}`, WGER_TTL, async () => {
      const response = await upstream(`${WGER_INFO}${id}/?format=json`, env);
      if (response.status === 404) return json({ found: false } satisfies WgerDetailResponse);
      if (!(response instanceof Response) || !response.ok) return wgerProblem(response.status);
      const exercise = parseExerciseInfo(await response.json().catch(() => null));
      return exercise ? json({ found: true, exercise } satisfies WgerDetailResponse, 200, WGER_TTL) : json({ found: false } satisfies WgerDetailResponse);
    });
  }
  if (url.pathname !== '/api/kracht/oefeningen') return problem(404, 'Onbekende route.');
  const query = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (query.length < 2) return problem(400, 'Typ minstens twee tekens.');
  const catalog = await loadWgerCatalog(url.origin, env);
  if (catalog instanceof Response) return catalog;
  return json({ exercises: searchCatalog(catalog, query) } satisfies WgerSearchResponse, 200, 3600);
}

/** Alleen voor tests: vergeet de catalogus in het geheugen. */
export function resetWgerMemory(): void {
  memoryCatalog = null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname.startsWith('/api/voeding/')) return handleFoodApi(request, env);
      if (url.pathname.startsWith('/api/kracht/')) return handleStrengthApi(request, env);
      return problem(404, 'Onbekende route.');
    }
    return env.ASSETS.fetch(request);
  }
};
