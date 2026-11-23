import { expect, test, type Page } from '@playwright/test';

async function failNextIndexedDbWrite(page: Page) {
  await page.evaluate(() => {
    const originalPut = IDBObjectStore.prototype.put;
    let shouldFail = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (shouldFail) {
        shouldFail = false;
        throw new DOMException('Test quota failure', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    };
  });
}

test('Hub opens the configured Sportapp and shows only Hub-owned activity', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welkom/ })).toBeVisible();
  await expect(page.getByText('Appdata blijft gescheiden')).toBeVisible();

  const sportPage = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open Sportapp ↗' }).click();
  const popup = await sportPage;
  await expect(popup).toHaveURL(/:4174\/$/);
  await expect(page.getByText('Sportapp geopend')).toBeVisible();
});

for (const [width, columns] of [[375, 1], [768, 2], [1280, 4]] as const) {
  test(`Hub app links fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    for (const name of ['Sportapp', 'SIDEQUEST', 'Samen Thuis', 'Coach']) {
      await expect(page.getByRole('link', { name: `Open ${name} ↗` })).toBeVisible();
    }

    const layout = await page.locator('.grid-4').evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
      overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth
    }));
    expect(layout.columns).toBe(columns);
    expect(layout.overflows).toBe(false);
  });
}

test('Sportapp records a manual activity and updates its statistics', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174');
  await page.getByRole('link', { name: 'Activiteiten' }).click();
  await page.getByRole('button', { name: '＋ Toevoegen' }).click();
  await page.getByLabel('Sporttype').selectOption('run');
  await page.getByLabel('Duur (minuten)').fill('35');
  await page.getByLabel('Afstand (km)').fill('5.2');
  await page.getByLabel('Notities').fill('Chromium test');
  await page.getByRole('button', { name: 'Activiteit opslaan' }).click();

  await expect(page.getByText('Chromium test')).toBeVisible();
  await page.getByRole('link', { name: 'Overzicht' }).click();
  await expect(page.locator('.metric-value').filter({ hasText: '5.2 km' })).toBeVisible();
});

test('SIDEQUEST stores a goal, habit check and quest reward', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175');

  await page.getByRole('link', { name: 'Doelen', exact: true }).click();
  await page.getByRole('button', { name: '＋ Nieuw doel' }).click();
  await page.getByLabel('Doel', { exact: true }).fill('Chromium doel');
  await page.getByLabel('Categorie').fill('Leren');
  await page.getByLabel('Deadline').fill('2027-12-31');
  await page.getByLabel('Doelwaarde').fill('4');
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await expect(page.getByText('Chromium doel')).toBeVisible();

  await page.getByRole('link', { name: 'Gewoontes', exact: true }).click();
  await page.getByRole('button', { name: '＋ Gewoonte maken' }).click();
  await page.getByLabel('Gewoonte').fill('Chromium wandeling');
  await page.getByRole('button', { name: 'Gewoonte opslaan' }).click();
  await page.getByRole('button', { name: 'Vink vandaag af' }).click();
  await expect(page.getByRole('button', { name: 'Vandaag gedaan' })).toBeVisible();

  await page.getByRole('link', { name: 'Quests', exact: true }).click();
  await page.getByRole('button', { name: '＋ Quest maken' }).click();
  await page.getByLabel('Naam').fill('Chromium quest');
  await page.getByLabel('Aantal stappen').fill('1');
  await page.getByLabel('Punten bij voltooien').fill('25');
  await page.getByRole('button', { name: 'Quest opslaan' }).click();
  await page.getByRole('button', { name: 'Registreer stap' }).click();
  await expect(page.getByText('Chromium quest')).toBeVisible();
  await expect(page.getByText('+25 punten')).toBeVisible();
});

test('a failed GPX save keeps its preview and a retry stores one activity', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/activiteiten');
  await page.getByLabel('Kies .gpx-bestand').setInputFiles({
    name: 'retry.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(`<gpx><trk><name>Retry route</name><trkseg>
      <trkpt lat="52" lon="5"><time>2026-11-15T08:00:00Z</time></trkpt>
      <trkpt lat="52.001" lon="5"><time>2026-11-15T08:10:00Z</time></trkpt>
    </trkseg></trk></gpx>`)
  });
  await expect(page.getByText('Voorbeeld: Retry route')).toBeVisible();
  await failNextIndexedDbWrite(page);

  await page.getByRole('button', { name: 'Importeer activiteit' }).click();
  await expect(page.getByText(/Opslaan mislukt/)).toBeVisible();
  await expect(page.getByText('Voorbeeld: Retry route')).toBeVisible();
  await page.getByRole('button', { name: 'Importeer activiteit' }).click();
  await expect(page.getByText('Voorbeeld: Retry route')).toHaveCount(0);
  await expect(page.getByText('GPX-import: Retry route')).toBeVisible();
  await expect(page.getByText('GPX-import: Retry route')).toHaveCount(1);
});

test('choosing an invalid GPX does not leave a stale preview available to import', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/activiteiten');
  const fileInput = page.getByLabel('Kies .gpx-bestand');
  await fileInput.setInputFiles({
    name: 'valid.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(`<gpx><trkseg>
      <trkpt lat="52" lon="5"><time>2026-11-15T08:00:00Z</time></trkpt>
      <trkpt lat="52.001" lon="5"><time>2026-11-15T08:10:00Z</time></trkpt>
    </trkseg></gpx>`)
  });
  await expect(page.getByRole('button', { name: 'Importeer activiteit' })).toBeVisible();

  await fileInput.setInputFiles({
    name: 'invalid.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from('<gpx/>')
  });
  await expect(page.getByText(/minimaal twee punten/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importeer activiteit' })).toHaveCount(0);
});

test('a failed manual activity save retains form fields for retry', async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/activiteiten');
  await page.getByRole('button', { name: '＋ Toevoegen' }).click();
  await page.getByLabel('Duur (minuten)').fill('35');
  await page.getByLabel('Notities').fill('Activity retry');
  await failNextIndexedDbWrite(page);

  await page.getByRole('button', { name: 'Activiteit opslaan' }).click();
  await expect(page.getByText(/Opslaan mislukt/)).toBeVisible();
  await expect(page.getByLabel('Notities')).toHaveValue('Activity retry');
  await page.getByRole('button', { name: 'Activiteit opslaan' }).click();
  await expect(page.getByText('Activity retry')).toBeVisible();
  await expect(page.getByText('Activity retry')).toHaveCount(1);
});

test('SIDEQUEST keeps form values after a failed save and retries without duplicates', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/doelen');
  await page.getByRole('button', { name: '＋ Nieuw doel' }).click();
  await page.getByLabel('Doel', { exact: true }).fill('Retry doel');
  await page.getByLabel('Categorie').fill('Test');
  await page.getByLabel('Deadline').fill('2027-12-31');
  await page.getByLabel('Doelwaarde').fill('4');
  await failNextIndexedDbWrite(page);

  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await expect(page.getByText(/Opslaan mislukt/)).toBeVisible();
  await expect(page.getByLabel('Doel', { exact: true })).toHaveValue('Retry doel');
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await expect(page.getByText('Retry doel')).toBeVisible();
  await expect(page.getByText('Retry doel')).toHaveCount(1);
});

test('a failed habit check can be retried without duplicate points', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/gewoontes');
  await page.getByRole('button', { name: '＋ Gewoonte maken' }).click();
  await page.getByLabel('Gewoonte').fill('Retry habit');
  await page.getByRole('button', { name: 'Gewoonte opslaan' }).click();
  await expect(page.getByText('Retry habit')).toBeVisible();
  await failNextIndexedDbWrite(page);

  await page.getByRole('button', { name: 'Vink vandaag af' }).click();
  await expect(page.getByText(/Opslaan mislukt/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vink vandaag af' })).toBeVisible();
  await page.getByRole('button', { name: 'Vink vandaag af' }).click();
  await expect(page.getByRole('button', { name: 'Vandaag gedaan' })).toBeVisible();
  await page.getByRole('link', { name: 'Overzicht' }).click();
  await expect(page.locator('.metric-value').filter({ hasText: /^5$/ })).toBeVisible();
});

test('Hub keeps shortcut values after a failed save and retries without duplicates', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/instellingen');
  await page.getByLabel('Naam', { exact: true }).fill('Retry shortcut');
  await page.getByLabel('URL', { exact: true }).fill('https://example.org/');
  await failNextIndexedDbWrite(page);

  await page.getByRole('button', { name: 'Snelkoppeling toevoegen' }).click();
  await expect(page.getByText(/Opslaan mislukt/)).toBeVisible();
  await expect(page.getByLabel('Naam', { exact: true })).toHaveValue('Retry shortcut');
  await page.getByRole('button', { name: 'Snelkoppeling toevoegen' }).click();
  await expect(page.getByText('Retry shortcut')).toBeVisible();
  await expect(page.getByText('Retry shortcut')).toHaveCount(1);
});

const pwaApps = [
  { name: 'Hub', origin: 'http://127.0.0.1:4173', route: '/activiteiten', heading: 'Activiteiten' },
  { name: 'Sportapp', origin: 'http://127.0.0.1:4174', route: '/activiteiten', heading: 'Activiteiten' },
  { name: 'SIDEQUEST', origin: 'http://127.0.0.1:4175', route: '/doelen', heading: 'Doelen' }
];

for (const app of pwaApps) {
  test(`${app.name} serves its SPA shell and core UI offline`, async ({ page, context }) => {
    const requestedOrigins = new Set<string>();
    page.on('request', (request) => requestedOrigins.add(new URL(request.url()).origin));

    const response = await page.goto(`${app.origin}${app.route}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: app.heading, exact: true })).toBeVisible();
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    const manifestResponse = await page.request.get(`${app.origin}/manifest.webmanifest`);
    expect(manifestResponse.status()).toBe(200);
    const manifest: { start_url?: string } = await manifestResponse.json();
    expect(manifest.start_url).toBe('/');
    await expect.poll(async () => page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.some((registration) => registration.active?.state === 'activated');
    })).toBe(true);

    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    const offlineResponse = await page.reload();
    expect(offlineResponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: app.heading, exact: true })).toBeVisible();

    if (app.name === 'Hub') {
      await page.getByRole('link', { name: 'Instellingen' }).click();
      await page.getByLabel('Naam', { exact: true }).fill('Offline shortcut');
      await page.getByLabel('URL', { exact: true }).fill('https://example.org/');
      await page.getByRole('button', { name: 'Snelkoppeling toevoegen' }).click();
      await expect(page.getByText('Offline shortcut')).toBeVisible();
    } else if (app.name === 'Sportapp') {
      await page.getByRole('button', { name: '＋ Toevoegen' }).click();
      await page.getByLabel('Duur (minuten)').fill('20');
      await page.getByRole('button', { name: 'Activiteit opslaan' }).click();
      await expect(page.getByText(/20 min/)).toBeVisible();
    } else {
      await page.getByRole('button', { name: '＋ Nieuw doel' }).click();
      await page.getByLabel('Doel', { exact: true }).fill('Offline doel');
      await page.getByLabel('Categorie').fill('Test');
      await page.getByLabel('Deadline').fill('2027-12-31');
      await page.getByRole('button', { name: 'Doel opslaan' }).click();
      await expect(page.getByText('Offline doel')).toBeVisible();
    }

    expect([...requestedOrigins].every((origin) => origin === app.origin)).toBe(true);
    await context.setOffline(false);
  });
}
