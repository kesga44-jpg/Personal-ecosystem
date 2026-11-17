import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const base = 'http://127.0.0.1:4177';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

for (const [path, text] of [
  ['/', /^Goede(nacht|morgen|middag|navond)/],
  ['/instellingen', 'Instellingen'],
  ['/sport', 'Sport, op jouw manier.'],
  ['/sport/activiteiten', 'Activiteiten'],
  ['/quest', 'Jouw volgende quest.'],
  ['/quest/gewoontes', 'Gewoontes'],
  ['/lichaam', 'Hoe gaat het met je lijf?'],
  ['/lichaam/invoeren', 'Meting invoeren'],
  ['/back-up', 'Back-up']
] as const) {
  test(`Personal Ecosystem laadt ${path} zonder fouten`, async ({ page }) => {
    const errors = collectErrors(page);
    const response = await page.goto(`${base}${path}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: text })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Modules' }).first()).toBeAttached();
    expect(errors).toEqual([]);
  });
}

test('modulewisselaar opent Sport en SIDEQUEST op dezelfde origin', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base);
  const switcher = page.getByRole('navigation', { name: 'Modules' }).first();
  await switcher.getByRole('link', { name: 'Sport' }).click();
  await expect(page).toHaveURL(`${base}/sport`);
  await expect(page.getByRole('heading', { level: 1, name: 'Sport, op jouw manier.' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Modules' }).first().getByRole('link', { name: 'SIDEQUEST' }).click();
  await expect(page).toHaveURL(`${base}/quest`);
  await page.getByRole('navigation', { name: 'SIDEQUEST navigatie' }).getByRole('link', { name: /Gewoontes/ }).click();
  await expect(page).toHaveURL(`${base}/quest/gewoontes`);
});

test('dashboardwidget opent Sport in hetzelfde tabblad', async ({ page }) => {
  await page.goto(base);
  const link = page.getByRole('link', { name: '↗ Sport' });
  await expect(link).toHaveAttribute('href', '/sport');
  await expect(link).not.toHaveAttribute('target', '_blank');
  await link.click();
  await expect(page).toHaveURL(`${base}/sport`);
});

test('widgetdashboard toont samenvattingen uit Sport en SIDEQUEST', async ({ page }) => {
  await page.goto(`${base}/sport/activiteiten`);
  await page.getByRole('button', { name: '＋ Toevoegen' }).click();
  await page.getByLabel('Duur (minuten)').fill('35');
  await page.getByRole('button', { name: /Activiteit opslaan/ }).click();
  await expect(page.getByText('35 min').first()).toBeVisible();

  await page.goto(base);
  const sportWidget = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Beweging deze week' }) });
  await expect(sportWidget.locator('.widget-stat')).toContainText('35');
  await expect(sportWidget.getByRole('img', { name: /Beweegminuten per dag/ })).toBeVisible();
  await expect(page.getByText('Nog geen dagelijkse gewoontes')).toBeVisible();
  await expect(page.getByText('35 min bewogen vandaag')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Back-up' })).toBeVisible();
});

test('widgets aanpassen: verbergen blijft bewaard', async ({ page }) => {
  await page.goto(base);
  await page.getByRole('button', { name: 'Widgets aanpassen' }).click();
  const points = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Punten' }) });
  await points.getByRole('button', { name: 'Verbergen' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await expect(page.getByRole('heading', { name: 'Punten' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Punten' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Streaks' })).toBeVisible();
});

test('weerwidget gebruikt Open-Meteo met afgeronde locatie', async ({ page }) => {
  const requested: string[] = [];
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => {
    requested.push(route.request().url());
    return route.fulfill({ json: { results: [{ name: 'Utrecht', latitude: 52.090737, longitude: 5.12142, admin1: 'Utrecht', country: 'Nederland' }] } });
  });
  await page.route('https://api.open-meteo.com/**', (route) => {
    requested.push(route.request().url());
    return route.fulfill({ json: { current: { temperature_2m: 12.3, weather_code: 2, wind_speed_10m: 14 }, daily: { temperature_2m_max: [14], temperature_2m_min: [6], precipitation_probability_max: [10] } } });
  });
  await page.goto(base);
  const weather = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Weer' }) });
  await weather.getByLabel('Plaats voor het weer').fill('Utrecht');
  await weather.getByRole('button', { name: 'Zoeken' }).click();
  await weather.getByRole('button', { name: 'Utrecht, Utrecht, Nederland' }).click();
  await expect(weather.locator('.widget-stat')).toContainText('12°');
  await expect(weather.getByText('Prima weer om buiten te trainen.')).toBeVisible();
  await expect(weather.getByRole('link', { name: 'Open-Meteo.com' })).toBeVisible();
  const forecast = requested.find((url) => url.startsWith('https://api.open-meteo.com'))!;
  expect(new URL(forecast).searchParams.get('latitude')).toBe('52.09');
});

test('Lichaam: meting invoeren, fout tonen, trend zien en dashboard ziet alleen óf er iets is ingevuld', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/lichaam/invoeren`);
  await page.getByLabel('Gewicht (kg)').fill('4');
  await page.getByRole('button', { name: 'Meting opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('Gewicht moet tussen 20 en 400 kg liggen.');

  await page.getByLabel('Gewicht (kg)').fill('81,5');
  await page.getByLabel('Slaap (uur)').fill('7,5');
  await page.getByLabel('Bovendruk (mmHg)').fill('121');
  await page.getByLabel('Onderdruk (mmHg)').fill('79');
  await page.getByLabel('Herstel').selectOption('4');
  await page.getByRole('button', { name: 'Meting opslaan' }).click();

  await expect(page).toHaveURL(`${base}/lichaam`);
  await expect(page.locator('.metric').filter({ hasText: 'Gewicht' }).locator('.metric-value')).toHaveText('81,5 kg');
  await expect(page.locator('.metric').filter({ hasText: 'Bloeddruk' }).locator('.metric-value')).toHaveText('121/79');
  await expect(page.getByRole('img', { name: /Gewicht per meting/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Uren slaap per nacht/ })).toBeVisible();

  await page.goto(`${base}/lichaam/geschiedenis`);
  await expect(page.getByText(/81,5 kg · 7,5 uur slaap · 121\/79 mmHg · herstel 4\/5/)).toBeVisible();
  await page.getByRole('link', { name: 'Aanpassen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Meting aanpassen' })).toBeVisible();
  await expect(page.getByLabel('Gewicht (kg)')).toHaveValue('81,5');

  await page.goto(base);
  const widget = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Lichaam' }) });
  await expect(widget).toContainText('✓ Vandaag ingevuld');
  await expect(widget).not.toContainText('81');
  await page.reload();
  await expect(widget).toContainText('✓ Vandaag ingevuld');
  expect(errors).toEqual([]);
});

test('Lichaam: registratie verwijderen na bevestiging', async ({ page }) => {
  await page.goto(`${base}/lichaam/invoeren`);
  await page.getByLabel('Rusthartslag (bpm)').fill('58');
  await page.getByRole('button', { name: 'Meting opslaan' }).click();
  await page.goto(`${base}/lichaam/geschiedenis`);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: /Registratie van .* verwijderen/ }).click();
  await expect(page.getByText('Nog geen registraties')).toBeVisible();
});

for (const width of [375, 768, 1280]) {
  test(`Personal Ecosystem past op ${width}px zonder horizontaal scrollen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/sport', '/quest', '/lichaam', '/lichaam/invoeren', '/back-up']) {
      await page.goto(`${base}${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow, path).toBe(false);
    }
  });
}

test('centrale back-up: exporteren, ongeldig bestand weigeren en herstellen', async ({ page }, testInfo) => {
  await page.goto(`${base}/sport/activiteiten`);
  await page.getByRole('button', { name: '＋ Toevoegen' }).click();
  await page.getByLabel('Duur (minuten)').fill('42');
  await page.getByRole('button', { name: /Activiteit opslaan/ }).click();
  await expect(page.getByText('42 min').first()).toBeVisible();

  await page.goto(`${base}/back-up`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download back-up' }).click()]);
  const exportPath = testInfo.outputPath('backup.json');
  await download.saveAs(exportPath);
  const backup = JSON.parse(await readFile(exportPath, 'utf8')) as { format: string; modules: Record<string, { stores: Record<string, unknown[]> }> };
  expect(backup.format).toBe('personal-ecosystem-backup');
  expect(Object.keys(backup.modules).sort()).toEqual(['hub', 'lichaam', 'sidequest', 'sport']);
  expect(backup.modules.sport?.stores.activities).toHaveLength(1);
  await expect(page.getByText(/Laatste back-up op dit apparaat: (?!nog niet)/)).toBeVisible();

  const tamperedPath = testInfo.outputPath('tampered.json');
  backup.modules.sport!.stores.activities = [];
  await writeFile(tamperedPath, JSON.stringify(backup));
  await page.getByLabel('Back-upbestand (JSON)').setInputFiles(tamperedPath);
  await expect(page.getByRole('alert')).toContainText('controlegetal');
  await expect(page.getByRole('button', { name: /Herstel deze/ })).toHaveCount(0);

  await page.getByLabel('Back-upbestand (JSON)').setInputFiles(exportPath);
  await expect(page.getByText('Bestand is in orde.')).toBeVisible();
  await page.getByRole('button', { name: 'Herstel deze modules' }).click();
  await expect(page.getByText('Herstel voltooid.')).toBeVisible();
  await page.goto(`${base}/sport/activiteiten`);
  await expect(page.getByText('42 min').first()).toBeVisible();
});

test('Personal Ecosystem start offline na het eerste bezoek', async ({ page, context }) => {
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.goto(`${base}/quest`);
  await expect(page.getByRole('heading', { level: 1, name: 'Jouw volgende quest.' })).toBeVisible();
  await context.setOffline(false);
});

for (const [port, name, target] of [
  [4174, 'Sportapp', 'https://pe-hub.kesga44.workers.dev/sport'],
  [4175, 'SIDEQUEST', 'https://pe-hub.kesga44.workers.dev/quest']
] as const) {
  test(`oude ${name} toont de verhuismelding`, async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    const notice = page.getByRole('status').filter({ hasText: `${name} is verhuisd naar Personal Ecosystem.` });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole('link', { name: 'Open Personal Ecosystem →' })).toHaveAttribute('href', target);
    await expect(notice.getByRole('link', { name: 'Instellingen' })).toHaveAttribute('href', '/instellingen');
  });
}
