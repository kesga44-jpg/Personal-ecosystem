import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { handleFoodApi, userAgent, type Env } from './index';

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
