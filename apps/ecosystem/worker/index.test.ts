import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { handleFoodApi, handleStrengthApi, resetWgerMemory, userAgent, type Env } from './index';

const env: Env = { ASSETS: { fetch: vi.fn(async () => new Response('app')) } };
const request = (path: string, init?: RequestInit) => new Request(`https://pe-hub.example${path}`, init);

const offProduct = {
  code: '8710400000000',
  product_name: 'Yoghurt',
  product_name_nl: 'Volle yoghurt',
  brands: 'Merk A, Merk B',
  serving_quantity: '150',
  nutriments: { 'energy-kcal_100g': 63, proteins_100g: 3.6, carbohydrates_100g: 4.4, fat_100g: 3.3 }
};

function mockFetch(response: Response | Error) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

afterEach(() => vi.restoreAllMocks());

describe('doorgeefserver Open Food Facts', () => {
  it('stuurt alleen de barcode door, met een eigen User-Agent', async () => {
    const spy = mockFetch(Response.json({ status: 1, product: offProduct }));
    const response = await handleFoodApi(request('/api/voeding/product/8710400000000'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      found: true,
      product: { code: '8710400000000', name: 'Volle yoghurt', brand: 'Merk A', per100: { kcal: 63, protein: 3.6, carbs: 4.4, fat: 3.3 }, servingGrams: 150 }
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe('https://world.openfoodfacts.org/api/v2/product/8710400000000?fields=code,product_name,product_name_nl,brands,nutriments,serving_quantity');
    expect((init?.headers as Record<string, string>)['user-agent']).toBe('PersonalEcosystem/1.0 (https://github.com/kesga44-jpg/Personal-ecosystem)');
    expect(init?.headers).not.toHaveProperty('cookie');
  });

  it('weigert ongeldige barcodes en korte zoektermen zonder Open Food Facts te belasten', async () => {
    const spy = mockFetch(Response.json({}));
    expect((await handleFoodApi(request('/api/voeding/product/12ab'), env)).status).toBe(400);
    expect((await handleFoodApi(request('/api/voeding/zoeken?q=a'), env)).status).toBe(400);
    expect((await handleFoodApi(request('/api/voeding/product/8710400000000', { method: 'POST' }), env)).status).toBe(405);
    expect(spy).not.toHaveBeenCalled();
  });

  it('meldt niet gevonden, drukte en storing in gewone taal', async () => {
    mockFetch(new Response('', { status: 404 }));
    expect(await (await handleFoodApi(request('/api/voeding/product/87104000'), env)).json()).toEqual({ found: false });
    vi.restoreAllMocks();
    mockFetch(new Response('', { status: 429 }));
    const busy = await handleFoodApi(request('/api/voeding/zoeken?q=kaas'), env);
    expect(busy.status).toBe(429);
    expect((await busy.json()).error).toContain('even druk');
    vi.restoreAllMocks();
    mockFetch(Response.json({ status: 1, product: { code: '87104000', product_name: 'Zonder waarden' } }));
    const incomplete = await handleFoodApi(request('/api/voeding/product/87104000'), env);
    expect(await incomplete.json()).toEqual({ found: false });
    expect(incomplete.headers.get('cache-control')).toBe('no-store');
    vi.restoreAllMocks();
    mockFetch(new Error('netwerk'));
    expect((await handleFoodApi(request('/api/voeding/zoeken?q=kaas'), env)).status).toBe(502);
  });

  it('zoekt via de zoekdienst met een opgeschoonde term en geeft alleen bruikbare producten terug', async () => {
    const spy = mockFetch(Response.json({ hits: [{ ...offProduct, brands: ['Merk A'] }, { code: '123', product_name: 'x' }, offProduct] }));
    const response = await handleFoodApi(request('/api/voeding/zoeken?q=%20%20volle%20%20yoghurt%20'), env);
    const body = (await response.json()) as { products: { brand: string }[] };
    expect(body.products).toHaveLength(1);
    expect(body.products[0]!.brand).toBe('Merk A');
    expect(spy).toHaveBeenCalledTimes(1);
    const upstreamUrl = new URL(String(spy.mock.calls[0]![0]));
    expect(upstreamUrl.origin).toBe('https://search.openfoodfacts.org');
    expect(upstreamUrl.searchParams.get('q')).toBe('volle yoghurt');
    expect(upstreamUrl.searchParams.get('langs')).toBe('nl,en');
  });

  it('valt terug op het oude zoekadres als de zoekdienst faalt', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ products: [offProduct] }));
    const response = await handleFoodApi(request('/api/voeding/zoeken?q=yoghurt'), env);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { products: unknown[] }).products).toHaveLength(1);
    expect(new URL(String(spy.mock.calls[1]![0])).pathname).toBe('/cgi/search.pl');
  });

  it('meldt drukte als beide zoekadressen falen', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(new Response('', { status: 503 }));
    expect((await handleFoodApi(request('/api/voeding/zoeken?q=yoghurt'), env)).status).toBe(429);
  });

  it('serveert de app voor alle andere paden en kent geen andere API-routes', async () => {
    expect(await (await worker.fetch(request('/dagboek'), env)).text()).toBe('app');
    expect((await worker.fetch(request('/api/iets'), env)).status).toBe(404);
  });

  it('maakt een veilige User-Agent van een ingestelde contactwaarde', () => {
    expect(userAgent({ OFF_CONTACT: 'kees@example.com' })).toBe('PersonalEcosystem/1.0 (kees@example.com)');
    expect(userAgent({ OFF_CONTACT: 'a\r\nb<script>' })).toBe('PersonalEcosystem/1.0 (abscript)');
  });
});

describe('doorgeefserver wger (Kracht)', () => {
  // Vorm zoals wger die op 17-11-2026 teruggaf: vertalingen zonder licentieveld.
  const english = {
    results: [
      { id: 1, exercise: 73, name: 'Bench Press', language: 2, license_author: 'wger.de', description: '<p>lang</p>' },
      { id: 2, exercise: 91, name: 'Bent Over Row', language: 2, license_author: 'Jan' }
    ]
  };
  const dutch = { results: [{ id: 3, exercise: 73, name: 'Bankdrukken', language: 6 }] };
  const info = {
    id: 73,
    license: { id: 2, short_name: 'CC-BY-SA 4', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en' },
    license_author: 'wger.de',
    translations: [
      { exercise: 73, name: 'Bench Press', language: 2, license: 2, license_author: 'wger.de' },
      { exercise: 73, name: 'Bankdrukken', language: 6, license: 2, license_author: 'Kees' }
    ]
  };

  function mockWger(englishResponse: Response, infoResponse: Response = Response.json(info)) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/exerciseinfo/')) return infoResponse.clone();
      return url.includes('language=6') ? Response.json(dutch) : englishResponse.clone();
    });
  }

  afterEach(() => resetWgerMemory());

  it('bouwt een namenlijst en zoekt op Nederlandse en Engelse naam', async () => {
    const spy = mockWger(Response.json(english));
    const response = await worker.fetch(request('/api/kracht/oefeningen?q=bank'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ exercises: [{ id: 73, name: 'Bench Press', nameNl: 'Bankdrukken' }] });
    expect(spy.mock.calls.map(([url]) => String(url))).toEqual([
      'https://wger.de/api/v2/exercise-translation/?language=2&limit=2000&format=json',
      'https://wger.de/api/v2/exercise-translation/?language=6&limit=2000&format=json'
    ]);
    // Tweede zoekopdracht komt uit het geheugen: geen nieuwe verzoeken naar wger.
    expect(await (await handleStrengthApi(request('/api/kracht/oefeningen?q=row'), env)).json()).toEqual({ exercises: [{ id: 91, name: 'Bent Over Row', nameNl: null }] });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('haalt licentie en auteurs van één gekozen oefening op', async () => {
    const spy = mockWger(Response.json(english));
    const response = await handleStrengthApi(request('/api/kracht/oefening/73'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      found: true,
      exercise: { id: 73, name: 'Bench Press', nameNl: 'Bankdrukken', license: 'CC-BY-SA 4', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en', author: 'wger.de, Kees' }
    });
    expect(String(spy.mock.calls[0]![0])).toBe('https://wger.de/api/v2/exerciseinfo/73/?format=json');
    vi.restoreAllMocks();
    mockWger(Response.json(english), new Response('', { status: 404 }));
    expect(await (await handleStrengthApi(request('/api/kracht/oefening/74'), env)).json()).toEqual({ found: false });
    vi.restoreAllMocks();
    mockWger(Response.json(english), Response.json({ ...info, license: { id: 99 } }));
    const unknown = await handleStrengthApi(request('/api/kracht/oefening/75'), env);
    expect(await unknown.json()).toEqual({ found: false });
    expect(unknown.headers.get('cache-control')).toBe('no-store');
  });

  it('weigert korte zoektermen, ongeldige ID\'s, andere methodes en onbekende routes zonder wger te belasten', async () => {
    const spy = mockWger(Response.json(english));
    expect((await handleStrengthApi(request('/api/kracht/oefeningen?q=a'), env)).status).toBe(400);
    expect((await handleStrengthApi(request('/api/kracht/oefeningen?q=bank', { method: 'POST' }), env)).status).toBe(405);
    expect((await handleStrengthApi(request('/api/kracht/_catalogus-v2'), env)).status).toBe(404);
    expect((await handleStrengthApi(request('/api/kracht/oefening/0'), env)).status).toBe(404);
    expect((await handleStrengthApi(request('/api/kracht/oefening/12a'), env)).status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it('meldt drukte en storing in gewone taal en onthoudt mislukkingen niet', async () => {
    mockWger(new Response('', { status: 429 }), new Response('', { status: 429 }));
    const busy = await handleStrengthApi(request('/api/kracht/oefeningen?q=bank'), env);
    expect(busy.status).toBe(429);
    expect((await busy.json()).error).toContain('even druk');
    expect((await handleStrengthApi(request('/api/kracht/oefening/73'), env)).status).toBe(429);
    vi.restoreAllMocks();
    const spy = mockWger(new Response('', { status: 500 }), new Response('', { status: 500 }));
    expect((await handleStrengthApi(request('/api/kracht/oefeningen?q=bank'), env)).status).toBe(502);
    expect((await handleStrengthApi(request('/api/kracht/oefening/73'), env)).status).toBe(502);
    expect(spy).toHaveBeenCalled();
    vi.restoreAllMocks();
    mockWger(Response.json(english));
    expect((await handleStrengthApi(request('/api/kracht/oefeningen?q=bank'), env)).status).toBe(200);
  });
});
