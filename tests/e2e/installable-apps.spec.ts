import { expect, test } from '@playwright/test';

/** Option A: each group of PE modules has its own web app manifest on the same origin. */
const base = 'http://127.0.0.1:4177';
const routes = [
  ['/', 'personal-ecosystem', 'Personal Ecosystem', '/'],
  ['/back-up', 'personal-ecosystem', 'Personal Ecosystem', '/'],
  ['/groei', 'groei-kennis', 'Groei & Kennis', '/groei'],
  ['/kennis', 'groei-kennis', 'Groei & Kennis', '/groei'],
  ['/financien', 'financien', 'Financiën', '/financien'],
  ['/voeding', 'voeding', 'Voeding', '/voeding'],
  ['/kracht', 'sport', 'Sport', '/sport'],
  ['/duur', 'sport', 'Sport', '/sport'],
  ['/quest', 'sidequest', 'SIDEQUEST', '/quest'],
  ['/dagboek', 'lichaam-dagboek', 'Lichaam & Dagboek', '/lichaam']
] as const;

for (const [route, appId, name, startUrl] of routes) {
  test(`${route} biedt het manifest van ${name}`, async ({ page }) => {
    await page.goto(`${base}${route}`);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', `/manifests/${appId}.webmanifest`);
    const response = await page.request.get(`${base}/manifests/${appId}.webmanifest`);
    expect(response.status()).toBe(200);
    const manifest = await response.json() as { name: string; start_url: string; scope: string; display: string; id: string; icons: { src: string }[] };
    expect(manifest).toMatchObject({ name, start_url: startUrl, scope: '/', display: 'standalone' });
    const icon = await page.request.get(`${base}${manifest.icons[0]!.src}`);
    expect(icon.status()).toBe(200);
    expect(await icon.text()).toContain('<svg');
  });
}

test('de apps wisselen alleen van manifest, niet van origin (dezelfde opslag en hetzelfde account)', async ({ page }) => {
  await page.goto(`${base}/groei`);
  const manifests = new Set<string>();
  manifests.add((await page.locator('link[rel="manifest"]').getAttribute('href'))!);
  await page.goto(`${base}/`);
  manifests.add((await page.locator('link[rel="manifest"]').getAttribute('href'))!);
  expect(manifests.size).toBe(2);
  expect(await page.evaluate(() => window.location.origin)).toBe(base);
});
