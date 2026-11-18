import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { fit, gpx, tcx } from '../../apps/ecosystem/src/modules/duur/fixtures';

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
  ['/voeding', 'Wat heb je gegeten?'],
  ['/voeding/toevoegen', 'Toevoegen'],
  ['/kracht', 'Krachttraining'],
  ['/kracht/schemas', 'Schema’s'],
  ['/kracht/oefeningen', 'Oefeningen'],
  ['/kracht/voortgang', 'Voortgang'],
  ['/duur', 'Duursport'],
  ['/duur/importeren', 'Importeren'],
  ['/duur/toevoegen', 'Training toevoegen'],
  ['/duur/instellingen', 'Instellingen'],
  ['/dagboek', 'Hoe was je dag?'],
  ['/dagboek/schrijven', 'Schrijven'],
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
  await expect(page).toHaveURL(`${base}/lichaam`);
  await page.goto(`${base}/lichaam/geschiedenis`);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: /Registratie van .* verwijderen/ }).click();
  await expect(page.getByText('Nog geen registraties')).toBeVisible();
});

test('Dagboek: stemming verplicht, notitie opslaan, zoeken en dashboard ziet alleen óf er geschreven is', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/dagboek/schrijven`);
  await page.getByLabel('Notitie', { exact: false }).fill('Lange fietstocht met Sam langs de Vecht.');
  await page.getByRole('button', { name: 'Notitie opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('Kies hoe je je voelt.');

  await page.getByRole('button', { name: /Goed/ }).click();
  await expect(page.getByRole('button', { name: /Goed/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'sport', exact: true }).click();
  await page.getByRole('button', { name: 'buiten', exact: true }).click();
  await page.getByLabel('Dankbaar 1 van 3').fill('Mooi weer');
  await page.getByLabel('Energie').selectOption('4');
  await page.getByRole('button', { name: 'Notitie opslaan' }).click();

  await expect(page).toHaveURL(`${base}/dagboek`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vandaag: 🙂 Goed');
  await expect(page.locator('.metric').filter({ hasText: 'Schrijfreeks' }).locator('.metric-value')).toHaveText('1 dag');
  await expect(page.getByRole('img', { name: /Stemmingskalender/ })).toBeVisible();

  await page.goto(`${base}/dagboek/archief`);
  await page.getByLabel('Zoeken').fill('FIETS');
  await expect(page.getByText('Lange fietstocht met Sam langs de Vecht.')).toBeVisible();
  await expect(page.getByText('Mooi weer')).toBeVisible();
  await page.getByLabel('Zoeken').fill('zeilen');
  await expect(page.getByText('Niets gevonden')).toBeVisible();
  await page.getByLabel('Zoeken').fill('');
  await page.getByRole('link', { name: 'Aanpassen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Notitie aanpassen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'sport', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goto(base);
  const widget = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Dagboek' }) });
  await expect(widget).toContainText('✓ Vandaag geschreven');
  await expect(widget).not.toContainText('fietstocht');
  await expect(widget).not.toContainText('🙂');
  expect(errors).toEqual([]);
});

test('Dagboek: notitie verwijderen na bevestiging', async ({ page }) => {
  await page.goto(`${base}/dagboek/schrijven`);
  await page.getByRole('button', { name: /Neutraal/ }).click();
  await page.getByRole('button', { name: 'Notitie opslaan' }).click();
  await expect(page).toHaveURL(`${base}/dagboek`);
  await page.goto(`${base}/dagboek/archief`);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: /Notitie van .* verwijderen/ }).click();
  await expect(page.getByText('Nog geen notities')).toBeVisible();
});

const yoghurt = { code: '8710400000000', name: 'Volle yoghurt', brand: 'Merk', per100: { kcal: 63, protein: 3.6, carbs: 4.4, fat: 3.3 }, servingGrams: 150 };

test('Voeding: zoeken via de eigen route, hoeveelheid kiezen en dashboard ziet alleen óf er iets is geregistreerd', async ({ page }) => {
  const errors = collectErrors(page);
  const requested: string[] = [];
  await page.route('**/api/voeding/**', (route) => {
    requested.push(new URL(route.request().url()).pathname + new URL(route.request().url()).search);
    return route.fulfill({ json: { products: [yoghurt] } });
  });
  await page.goto(`${base}/voeding/toevoegen`);
  await page.getByLabel('Product zoeken').fill('volle yoghurt');
  expect(requested).toEqual([]);
  await page.locator('form').getByRole('button', { name: 'Zoeken', exact: true }).click();
  await page.getByRole('button', { name: 'Kies Volle yoghurt' }).click();
  await expect(page.getByLabel('Hoeveelheid (g)')).toHaveValue('150');
  await page.getByLabel('Hoeveelheid (g)').fill('200');
  await page.getByLabel('Maaltijd').selectOption('ontbijt');
  await expect(page.getByText('Dit is 126 kcal')).toBeVisible();
  await page.getByRole('button', { name: 'Opslaan' }).click();

  await expect(page).toHaveURL(`${base}/voeding`);
  await expect(page.locator('.metric').filter({ has: page.locator('.metric-label', { hasText: /^Energie$/ }) }).locator('.metric-value')).toHaveText('126 kcal');
  await expect(page.getByText('Volle yoghurt (Merk)')).toBeVisible();
  await expect(page.getByRole('img', { name: /Energie per dag/ })).toBeVisible();
  expect(requested).toEqual(['/api/voeding/zoeken?q=volle%20yoghurt']);

  await page.goto(`${base}/voeding/toevoegen`);
  await expect(page.getByRole('button', { name: 'Volle yoghurt' })).toBeVisible();

  await page.goto(base);
  const widget = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Voeding' }) });
  await expect(widget).toContainText('✓ Vandaag geregistreerd');
  await expect(widget).not.toContainText('yoghurt');
  await expect(widget).not.toContainText('kcal');
  expect(errors).toEqual([]);
});

test('Voeding: onbekende barcode leidt naar zelf invoeren, en een fout wordt duidelijk gemeld', async ({ page }) => {
  await page.route('**/api/voeding/product/**', (route) => route.fulfill({ json: { found: false } }));
  await page.goto(`${base}/voeding/toevoegen`);
  await page.getByRole('button', { name: 'Barcode', exact: true }).click();
  await page.getByLabel('Barcode', { exact: false }).fill('87104000');
  await page.getByRole('button', { name: 'Opzoeken' }).click();
  await expect(page.getByText('staat niet (volledig) in Open Food Facts')).toBeVisible();
  await page.getByRole('button', { name: 'Zelf invoeren' }).last().click();

  await page.getByLabel('Naam').fill('Zelfgemaakte soep');
  await page.getByLabel('Energie per 100 g (kcal)').fill('45');
  await page.getByLabel('Eiwit per 100 g (g)').fill('2,5');
  await page.getByLabel('Koolhydraten per 100 g (g)').fill('6');
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(page.getByRole('alert')).toContainText('Vul vet per 100 g in');
  await page.getByLabel('Vet per 100 g (g)').fill('1');
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByLabel('Hoeveelheid (g)').fill('300');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page).toHaveURL(`${base}/voeding`);
  await expect(page.locator('.metric').filter({ has: page.locator('.metric-label', { hasText: /^Energie$/ }) }).locator('.metric-value')).toHaveText('135 kcal');

  await page.unroute('**/api/voeding/product/**');
  await page.route('**/api/voeding/zoeken**', (route) => route.fulfill({ status: 429, json: { error: 'Open Food Facts is even druk. Probeer het over een minuut opnieuw of voer het product zelf in.' } }));
  await page.goto(`${base}/voeding/toevoegen`);
  await page.getByLabel('Product zoeken').fill('kaas');
  await page.locator('form').getByRole('button', { name: 'Zoeken', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('even druk');
});

test('Kracht: schema met Darebee-link, training met sets, record en dashboard ziet alleen het aantal', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/kracht/schemas/nieuw`);
  await page.getByLabel('Naam').fill('Volledig lichaam A');
  await page.getByLabel('Link (optioneel)').fill('http://darebee.com/workouts/x.html');
  await page.getByLabel('Oefening kiezen').selectOption({ label: 'Squat' });
  await page.getByRole('button', { name: 'Toevoegen' }).click();
  await page.getByLabel('Squat sets').fill('2');
  await page.getByLabel('Squat doel').fill('5');
  await page.getByLabel('Squat rust').fill('0');
  await page.getByRole('button', { name: 'Schema opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('https');
  await page.getByLabel('Link (optioneel)').fill('https://darebee.com/workouts/x.html');
  await page.getByRole('button', { name: 'Schema opslaan' }).click();
  await expect(page).toHaveURL(`${base}/kracht/schemas`);
  const darebee = page.getByRole('link', { name: 'Open workout op Darebee ↗' });
  await expect(darebee).toHaveAttribute('href', 'https://darebee.com/workouts/x.html');
  await expect(darebee).toHaveAttribute('rel', 'noopener noreferrer');

  await page.getByRole('button', { name: 'Start Volledig lichaam A' }).click();
  await expect(page).toHaveURL(/\/kracht\/training\?schema=/);
  await expect(page.getByRole('heading', { level: 1, name: 'Volledig lichaam A' })).toBeVisible();
  await page.getByRole('button', { name: 'Training opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('Vink minstens één');
  await page.getByLabel('Squat set 1 gewicht').fill('60');
  await page.getByRole('button', { name: 'Squat set 1 gedaan' }).click();
  // Een lopende training overleeft herladen.
  await page.reload();
  await expect(page.getByLabel('Squat set 1 gewicht')).toHaveValue('60');
  await expect(page.getByRole('button', { name: 'Squat set 1 gedaan' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Training opslaan' }).click();
  await expect(page).toHaveURL(`${base}/kracht/geschiedenis`);
  await expect(page.getByText('Squat: 5 × 60 kg')).toBeVisible();

  // Tweede training, zwaarder: nieuw record.
  await page.goto(`${base}/kracht/training`);
  await expect(page.getByRole('heading', { level: 1, name: 'Vrije training' })).toBeVisible();
  await page.getByLabel('Oefening kiezen').selectOption({ label: 'Squat' });
  await page.getByRole('button', { name: 'Toevoegen' }).click();
  await expect(page.getByLabel('Squat set 1 gewicht')).toHaveValue('60');
  await page.getByLabel('Squat set 1 gewicht').fill('62,5');
  await page.getByRole('button', { name: 'Squat set 1 gedaan' }).click();
  await page.getByRole('button', { name: 'Training opslaan' }).click();
  await expect(page).toHaveURL(/\/kracht\/voortgang\?records=Squat/);
  await expect(page.getByText('Nieuw record: Squat')).toBeVisible();
  await expect(page.getByText(/Beste: 62,5 kg/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Voortgang Squat' })).toBeVisible();

  await page.goto(base);
  const widget = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Kracht' }) });
  await expect(widget).toContainText('2 trainingen deze week');
  await expect(widget).not.toContainText('Squat');
  await expect(widget).not.toContainText('kg');
  expect(errors).toEqual([]);
});

test('Kracht: oefening uit wger overnemen met licentie en auteur, en fouten duidelijk melden', async ({ page }) => {
  const requested: string[] = [];
  await page.route('**/api/kracht/**', (route) => {
    const url = new URL(route.request().url());
    requested.push(url.pathname + url.search);
    if (url.pathname === '/api/kracht/oefening/91') {
      return route.fulfill({ json: { found: true, exercise: { id: 91, name: 'Bent Over Row', nameNl: null, license: 'CC-BY-SA 3', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/deed.en', author: 'Jan' } } });
    }
    return route.fulfill({ json: { exercises: [{ id: 91, name: 'Bent Over Row', nameNl: null }] } });
  });
  await page.goto(`${base}/kracht/oefeningen`);
  await expect(page.getByText('40 oefeningen')).toBeVisible();
  await page.getByLabel('Zoek in wger').fill('row');
  expect(requested).toEqual([]);
  await page.getByRole('button', { name: 'Zoeken', exact: true }).click();
  await page.getByRole('button', { name: 'Kies Bent Over Row' }).click();
  await expect(page.getByText('Jan · CC-BY-SA 3')).toBeVisible();
  await page.getByRole('combobox', { name: 'Spiergroep', exact: true }).selectOption('rug');
  await page.getByRole('combobox', { name: 'Materiaal', exact: true }).selectOption('halter');
  await page.getByRole('button', { name: 'Overnemen' }).click();
  await expect(page.getByText('Bent Over Row is toegevoegd.')).toBeVisible();
  await expect(page.getByText('41 oefeningen')).toBeVisible();
  const item = page.locator('.list-item').filter({ hasText: 'rug · halter' }).filter({ hasText: 'Bent Over Row' });
  await expect(item.getByRole('link', { name: 'CC-BY-SA 3' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/3.0/deed.en');
  await expect(item).toContainText('Jan');
  expect(requested).toEqual(['/api/kracht/oefeningen?q=row', '/api/kracht/oefening/91']);

  await page.getByRole('button', { name: 'Zelf invoeren' }).click();
  await page.getByLabel('Naam').fill('Sled push');
  await page.getByRole('combobox', { name: 'Meten in', exact: true }).selectOption('tijd');
  await page.getByRole('button', { name: 'Oefening opslaan' }).click();
  await expect(page.getByText('Sled push is toegevoegd.')).toBeVisible();

  await page.unroute('**/api/kracht/**');
  await page.route('**/api/kracht/**', (route) => route.fulfill({ status: 502, json: { error: 'wger is nu niet bereikbaar. Kies een basisoefening of voer de oefening zelf in.' } }));
  await page.getByRole('button', { name: 'Zoeken in wger' }).click();
  await page.getByLabel('Zoek in wger').fill('curl');
  await page.getByRole('button', { name: 'Zoeken', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'niet bereikbaar' })).toBeVisible();
});

// Lege kaarttegel: E2E-tests mogen geen verkeer naar tile.openstreetmap.org veroorzaken.
const EMPTY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function stubTiles(page: Page): Promise<string[]> {
  const tiles: string[] = [];
  await page.route('https://tile.openstreetmap.org/**', (route) => {
    tiles.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: EMPTY_PNG });
  });
  return tiles;
}

test('Duur: FIT, TCX en GPX importeren, dubbel herkennen, route met kaart en dashboard ziet alleen totalen', async ({ page }) => {
  const errors = collectErrors(page);
  const tiles = await stubTiles(page);
  await page.goto(`${base}/duur/importeren`);
  await page.getByLabel('Bestanden kiezen').setInputFiles([
    { name: 'loop.fit', mimeType: 'application/octet-stream', buffer: Buffer.from(fit()) },
    { name: 'rit.tcx', mimeType: 'application/xml', buffer: Buffer.from(tcx()) },
    { name: 'wandeling.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx('hiking')) }
  ]);
  await expect(page.getByText('loop.fit')).toBeVisible();
  await expect(page.getByLabel('Sport voor loop.fit')).toHaveValue('hardlopen');
  await expect(page.getByLabel('Sport voor rit.tcx')).toHaveValue('fietsen');
  await expect(page.getByLabel('Sport voor wandeling.gpx')).toHaveValue('wandelen');
  await page.getByRole('button', { name: '3 trainingen opslaan' }).click();
  await expect(page).toHaveURL(`${base}/duur/geschiedenis`);
  await expect(page.getByRole('button', { name: /^Bekijk / })).toHaveCount(3);

  await page.goto(`${base}/duur/importeren`);
  await page.getByLabel('Bestanden kiezen').setInputFiles({ name: 'wandeling-kopie.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx('hiking')) });
  await expect(page.getByText('Al geïmporteerd')).toBeVisible();
  await expect(page.getByRole('button', { name: /opslaan/ })).toBeDisabled();

  await page.goto(`${base}/duur/geschiedenis`);
  await page.getByRole('button', { name: 'Hardlopen', exact: true }).click();
  await page.getByRole('button', { name: /^Bekijk Hardlopen/ }).click();
  await expect(page.locator('.metric').filter({ hasText: 'Afstand' }).locator('.metric-value')).toHaveText('1 km');
  await expect(page.locator('.metric').filter({ hasText: 'Tempo' }).locator('.metric-value')).toHaveText('4:50 /km');
  await expect(page.getByRole('img', { name: /Route van Hardlopen/ })).toBeVisible();
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  expect(tiles.every((url) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url))).toBe(true);
  await expect(page.locator('.split-table tbody tr')).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Hartslag over de training' })).toBeVisible();
  await expect(page.getByText('Stel je maximale hartslag in')).toBeVisible();

  await page.goto(`${base}/duur/instellingen`);
  await page.getByLabel('Maximale hartslag (bpm)').fill('300');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('120 en 230');
  await page.getByLabel('Maximale hartslag (bpm)').fill('190');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText('Opgeslagen')).toBeVisible();
  await page.goto(`${base}/duur/geschiedenis`);
  await page.getByRole('button', { name: /^Bekijk Hardlopen/ }).click();
  await expect(page.getByLabel('Tijd per hartslagzone')).toContainText('Zone 3 · tempo');

  await page.goto(base);
  const widget = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Duur' }) });
  await expect(widget).toContainText('3 trainingen deze week');
  await expect(widget).not.toContainText('♥');
  await expect(widget).not.toContainText('52,');
  expect(errors).toEqual([]);
});

test('Duur: training zelf invoeren, fout tonen, aanpassen en verwijderen', async ({ page }) => {
  await page.goto(`${base}/duur/toevoegen`);
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('Vul de duur in');
  await page.getByPlaceholder('45:00').fill('42:30');
  await page.getByLabel('Afstand (km)').fill('8,5');
  await page.getByLabel('Gemiddelde hartslag').fill('150');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page).toHaveURL(/\/duur\/activiteit\//);
  await expect(page.locator('.metric').filter({ hasText: 'Afstand' }).locator('.metric-value')).toHaveText('8,5 km');
  await expect(page.locator('.metric').filter({ hasText: 'Tempo' }).locator('.metric-value')).toHaveText('5:00 /km');
  await expect(page.getByText('Zelf ingevoerd.')).toBeVisible();
  await expect(page.locator('.route-map')).toHaveCount(0);

  await page.getByLabel('Naam').fill('Rondje park');
  await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rondje park' })).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Rondje park verwijderen' }).click();
  await expect(page).toHaveURL(`${base}/duur/geschiedenis`);
  await expect(page.getByText('Geen trainingen')).toBeVisible();
});

for (const width of [375, 768, 1280]) {
  test(`Personal Ecosystem past op ${width}px zonder horizontaal scrollen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/sport', '/quest', '/lichaam', '/lichaam/invoeren', '/voeding', '/voeding/toevoegen', '/kracht', '/kracht/training', '/kracht/oefeningen', '/kracht/schemas/nieuw', '/duur', '/duur/importeren', '/duur/toevoegen', '/dagboek', '/dagboek/schrijven', '/dagboek/archief', '/back-up']) {
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
  expect(Object.keys(backup.modules).sort()).toEqual(['dagboek', 'duur', 'hub', 'kracht', 'lichaam', 'sidequest', 'sport', 'voeding']);
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
