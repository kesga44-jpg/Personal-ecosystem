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
  ['/voeding/planning', 'Planning'],
  ['/voeding/planning/automatisch', 'Automatisch plannen'],
  ['/voeding/recepten', 'Recepten'],
  ['/voeding/recepten/nieuw', 'Nieuw recept'],
  ['/voeding/producten', 'Ingrediënten'],
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
  ['/groei', 'Waar groei je naartoe?'],
  ['/groei/doelen', 'Doelen'],
  ['/groei/acties', 'Acties'],
  ['/groei/gewoontes', 'Gewoontes'],
  ['/groei/vaardigheden', 'Vaardigheden'],
  ['/groei/evaluaties', 'Evaluaties'],
  ['/groei/systeem', 'Groeisysteem'],
  ['/kennis', 'Wat leer je nu?'],
  ['/kennis/bibliotheek', 'Bibliotheek'],
  ['/kennis/highlights', 'Highlights'],
  ['/kennis/inzichten', 'Inzichten'],
  ['/kennis/studie', 'Studieprogramma'],
  ['/kennis/logboek', 'Logboek'],
  ['/kennis/makers', 'Makers'],
  ['/financien', 'Jouw geld, jouw strategie'],
  ['/financien/transacties', 'Transacties'],
  ['/financien/budgetten', 'Budgetten'],
  ['/financien/spaarpotten', 'Spaarpotten'],
  ['/financien/rapportage', 'Rapportage'],
  ['/financien/money-manual', 'Money Manual'],
  ['/financien/beleggingsplan', 'Investment Plan'],
  ['/financien/instellingen', 'Categorieën'],
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

test('dashboard: blokken voor Groei, Kennis, Financiën en maaltijdplanning tonen alleen tellers en zijn uit te zetten', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/financien/transacties?nieuw=1`);
  await page.getByRole('combobox', { name: /^Soort/ }).selectOption('in');
  await page.getByLabel('Bedrag (€)').fill('1000');
  await page.getByLabel('Omschrijving').fill('Geheime omschrijving');
  await page.getByRole('button', { name: 'Transactie opslaan' }).click();
  await expect(page.getByText(/Geheime omschrijving/)).toBeVisible();
  await page.goto(`${base}/groei/doelen?nieuw=1`);
  await page.getByLabel('Titel', { exact: true }).fill('Geheim doel');
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await expect(page.getByRole('link', { name: 'Geheim doel' })).toBeVisible();

  await page.goto(base);
  const block = (name: string) => page.locator('.widget').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(block('Financiën').locator('.widget-stat')).toContainText(/€\s?1\.000,00/);
  await expect(block('Financiën')).toContainText('Binnen budget');
  await expect(block('Groei').locator('.widget-stat')).toContainText('1');
  await expect(block('Groei')).toContainText('actief doel');
  await expect(block('Kennis').locator('.widget-stat')).toContainText('0');
  await expect(block('Maaltijdplanning')).toContainText('Geen plan voor vandaag');
  await expect(page.getByText('Geheime omschrijving')).toHaveCount(0);
  await expect(page.getByText('Geheim doel')).toHaveCount(0);

  await page.getByRole('button', { name: 'Widgets aanpassen' }).click();
  await block('Financiën').getByRole('button', { name: 'Verbergen' }).click();
  await page.getByRole('button', { name: 'Klaar' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Financiën', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Groei', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
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

test('Groei: doel met subdoel, actie, gewoonte, vaardigheid en 10/10; blijft bewaard na herladen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/groei/doelen?nieuw=1`);
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('titel');
  await page.getByLabel('Titel', { exact: true }).fill('Marathon lopen');
  await page.getByLabel('Levensgebied').fill('Gezondheid');
  await page.getByLabel('Voortgang (%)').fill('20');
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await page.getByRole('link', { name: 'Marathon lopen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Marathon lopen' })).toBeVisible();

  await page.getByRole('link', { name: '＋ Subdoel' }).click();
  await page.getByLabel('Titel', { exact: true }).fill('Halve marathon');
  await expect(page.getByLabel('Subdoel van')).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await page.getByLabel('Zoeken').fill('halve');
  await expect(page.getByText('Subdoel van Marathon lopen')).toBeVisible();

  await page.goto(`${base}/groei/doelen`);
  await page.getByRole('link', { name: 'Marathon lopen' }).click();
  await page.getByRole('link', { name: '＋ Actie' }).click();
  await page.getByLabel('Actie', { exact: true }).fill('Trainingsschema kiezen');
  await page.getByRole('button', { name: 'Actie opslaan' }).click();
  await page.getByLabel('Status van Trainingsschema kiezen').selectOption('klaar');
  await page.getByLabel('Tonen').selectOption('klaar');
  await expect(page.getByText('Trainingsschema kiezen')).toBeVisible();

  await page.goto(`${base}/groei/gewoontes`);
  await page.getByLabel('Gewoonte', { exact: true }).fill('10 minuten lezen');
  await page.getByRole('button', { name: 'Gewoonte toevoegen' }).click();
  await page.getByRole('button', { name: 'Vandaag afvinken' }).click();
  await expect(page.getByRole('button', { name: '✓ Vandaag gedaan' })).toBeVisible();

  await page.goto(`${base}/groei/vaardigheden`);
  await page.getByLabel('Vaardigheid', { exact: true }).fill('Hardlooptechniek');
  await page.getByLabel('Huidig niveau (1–10)').fill('4');
  await page.getByRole('button', { name: 'Marathon lopen' }).click();
  await page.getByRole('button', { name: 'Vaardigheid opslaan' }).click();
  await expect(page.getByText('Niveau 4/10 → 5/10 · Marathon lopen')).toBeVisible();

  await page.goto(`${base}/groei/systeem`);
  await expect(page.getByText('1-1-5-3-1-35-30-5-10-10')).toBeVisible();
  await expect(page.getByLabel('Betekenis van 35')).toHaveValue('');
  await page.getByLabel('Inkomen (€)').fill('3000');
  await page.getByLabel('Anderen helpen (€)').fill('300');
  await page.getByLabel('Ontwikkeling (€)').fill('150');
  await page.getByRole('button', { name: 'Maand opslaan' }).click();
  await expect(page.getByRole('table')).toContainText('10%');
  await expect(page.getByRole('table')).toContainText('5%');

  await page.reload();
  await page.goto(`${base}/groei`);
  await expect(page.locator('.metric').filter({ hasText: 'Actieve doelen' }).locator('.metric-value')).toHaveText('2');
  await expect(page.locator('.metric').filter({ hasText: 'Gewoontes vandaag' }).locator('.metric-value')).toHaveText('1/1');
  await page.getByRole('link', { name: 'Marathon lopen' }).click();
  await expect(page.getByText('Halve marathon')).toBeVisible();
  await expect(page.getByText('Hardlooptechniek')).toBeVisible();
  await expect(page.locator('.metric').filter({ hasText: 'Acties' }).locator('.metric-value')).toHaveText('1/1');
  expect(errors).toEqual([]);
});

test('Groei: doel met subdoel kan niet worden verwijderd; actie wel, na bevestiging', async ({ page }) => {
  await page.goto(`${base}/groei/doelen?nieuw=1`);
  await page.getByLabel('Titel', { exact: true }).fill('Hoofddoel');
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await page.getByRole('link', { name: 'Hoofddoel' }).click();
  await page.getByRole('link', { name: '＋ Subdoel' }).click();
  await page.getByLabel('Titel', { exact: true }).fill('Onderdeel');
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await page.getByRole('link', { name: 'Hoofddoel' }).click();
  await expect(page.getByText('Verplaats of verwijder die eerst')).toBeVisible();
  await page.goto(`${base}/groei/acties?nieuw=1`);
  await page.getByLabel('Actie', { exact: true }).fill('Weg ermee');
  await page.getByRole('button', { name: 'Actie opslaan' }).click();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Actie Weg ermee verwijderen' }).click();
  await expect(page.getByText('Geen acties', { exact: true })).toBeVisible();
});

test('Financiën: categorie, budget, spaarpot, transacties, Money Manual en Investment Plan; blijft bewaard na herladen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/financien/instellingen`);
  await page.getByLabel('Nieuwe categorie').fill('Boodschappen');
  await page.getByRole('button', { name: 'Categorie toevoegen' }).click();
  await expect(page.getByText('Boodschappen')).toBeVisible();

  await page.goto(`${base}/financien/budgetten`);
  await page.getByRole('combobox', { name: /^Categorie/ }).selectOption({ label: 'Boodschappen' });
  await page.getByLabel('Per maand (€)').fill('300');
  await page.getByRole('button', { name: 'Budget opslaan' }).click();
  await expect(page.locator('.list-item').filter({ hasText: 'Boodschappen' })).toContainText(/van €\s?300,00/);

  await page.goto(`${base}/financien/spaarpotten`);
  await page.getByLabel('Naam').fill('Buffer');
  await page.getByLabel('Doelbedrag (€)').fill('1000');
  await page.getByRole('button', { name: 'Spaarpot opslaan' }).click();
  await expect(page.locator('.list-item').filter({ hasText: 'Buffer' })).toContainText('0%');

  await page.goto(`${base}/financien/transacties?nieuw=1`);
  await page.getByRole('button', { name: 'Transactie opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('bedrag');
  await page.getByLabel('Bedrag (€)').fill('350');
  await page.getByRole('combobox', { name: /^Categorie/ }).selectOption({ label: 'Boodschappen' });
  await page.getByLabel('Omschrijving').fill('Weekboodschappen');
  await page.getByRole('button', { name: 'Transactie opslaan' }).click();
  await expect(page.getByText(/Weekboodschappen/)).toBeVisible();
  await page.getByRole('button', { name: '＋ Transactie' }).click();
  await page.getByLabel('Bedrag (€)').fill('100');
  await page.getByRole('combobox', { name: /^Spaarpot/ }).selectOption({ label: 'Buffer' });
  await page.getByLabel('Omschrijving').fill('Naar buffer');
  await page.getByRole('button', { name: 'Transactie opslaan' }).click();
  await expect(page.getByText(/Naar buffer/)).toBeVisible();

  await page.goto(`${base}/financien/money-manual`);
  const principles = page.getByRole('textbox', { name: /^Uitgangspunten/ });
  await principles.fill('Eerst een buffer, dan beleggen.');
  await page.locator('.card').filter({ has: principles }).getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText('Opgeslagen.')).toBeVisible();
  await page.getByLabel('Scenario', { exact: true }).fill('Parttime');
  await page.getByLabel('Inkomen per maand (€)').fill('2500');
  await page.getByLabel('Uitgaven per maand (€)').fill('2000');
  await page.getByRole('button', { name: 'Scenario toevoegen' }).click();
  await expect(page.locator('.list-item').filter({ hasText: 'Parttime' })).toContainText(/Over per maand €\s?500,00/);

  await page.goto(`${base}/financien/beleggingsplan?nieuw=1`);
  await expect(page.getByText(/werkelijke portefeuille, transacties, waardes en rendementen staan niet hier/)).toBeVisible();
  await page.getByLabel('Naam van het plan').fill('Lange termijn');
  await page.getByRole('combobox', { name: /^Status/ }).selectOption('actief');
  await page.getByLabel('Categorie 1').fill('Aandelen wereldwijd');
  await page.getByLabel('Percentage 1').fill('80');
  await page.getByRole('button', { name: '＋ Categorie' }).click();
  await page.getByLabel('Categorie 2').fill('Obligaties');
  await page.getByLabel('Percentage 2').fill('10');
  await page.getByLabel('Gepland inlegbedrag (€)').fill('200');
  await page.getByRole('button', { name: 'Plan opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('100');
  await page.getByLabel('Percentage 2').fill('20');
  await page.getByRole('button', { name: 'Plan opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Lange termijn' })).toBeVisible();
  await expect(page.locator('.metric').filter({ hasText: 'Geplande inleg per jaar' })).toContainText(/€\s?2\.400,00/);

  await page.getByLabel('Naam scenario').fill('Voorzichtig');
  await page.getByLabel('Aangenomen rendement per jaar (%)').fill('4');
  await page.getByRole('button', { name: 'Scenario doorrekenen' }).click();
  await expect(page.getByText(/rekenwaarde .* bij een totale inleg van/)).toBeVisible();

  await page.getByLabel('Onderwerp').fill('Eerste evaluatie');
  await page.getByRole('button', { name: 'Notitie opslaan' }).click();
  await expect(page.locator('.metric').filter({ hasText: 'Voortgang' }).locator('.metric-value')).toHaveText('op koers');

  await page.reload();
  await page.goto(`${base}/financien`);
  await expect(page.locator('.metric').filter({ hasText: 'Uitgaven deze maand' }).locator('.metric-value')).toHaveText(/€\s?450,00/);
  await expect(page.locator('.metric').filter({ hasText: 'Budgetten' }).locator('.metric-value')).toHaveText('0/1');
  await expect(page.getByText('Budget overschreden')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Voortgang Buffer' })).toHaveAttribute('value', '10');
  await expect(page.getByRole('link', { name: 'Lange termijn' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Kennis: bron met doel, highlight, inzicht, actie in Groei, studieprogramma en logboek', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/groei/doelen?nieuw=1`);
  await page.getByLabel('Titel', { exact: true }).fill('Beter leidinggeven');
  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await expect(page.getByRole('link', { name: 'Beter leidinggeven' })).toBeVisible();

  await page.goto(`${base}/kennis/bibliotheek?nieuw=1`);
  await page.getByLabel('Titel', { exact: true }).fill('Extreme Ownership');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('bezig');
  await page.getByRole('button', { name: 'Beter leidinggeven' }).click();
  await page.getByRole('button', { name: 'Bron opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Extreme Ownership' })).toBeVisible();
  await expect(page.getByText('Doelen: Beter leidinggeven')).toBeVisible();

  await page.getByLabel('Nieuwe highlight').fill('Er zijn geen slechte teams, alleen slechte leiders.');
  await page.getByLabel('Pagina of tijdstip').fill('p. 54');
  await page.getByRole('button', { name: 'Highlight toevoegen' }).click();
  await expect(page.getByText('Er zijn geen slechte teams, alleen slechte leiders.')).toBeVisible();

  await page.getByRole('link', { name: '＋ Inzicht' }).click();
  await page.getByLabel('Inzicht', { exact: true }).fill('Neem eigenaarschap over resultaten');
  await page.getByRole('button', { name: /Er zijn geen slechte teams/ }).click();
  await page.getByRole('button', { name: 'Beter leidinggeven' }).click();
  await page.getByRole('button', { name: 'Inzicht opslaan' }).click();
  await expect(page.getByText('Neem eigenaarschap over resultaten')).toBeVisible();

  await page.getByRole('link', { name: '＋ Actie in Groei' }).first().click();
  await expect(page).toHaveURL(/\/groei\/acties\?nieuw=1&inzicht=/);
  await expect(page.getByLabel('Ontstaan uit inzicht')).not.toHaveValue('');
  await page.getByLabel('Actie', { exact: true }).fill('Wekelijks 1-op-1 plannen');
  await page.getByRole('button', { name: 'Actie opslaan' }).click();
  await expect(page.getByText('Wekelijks 1-op-1 plannen')).toBeVisible();

  await page.goto(`${base}/kennis/studie`);
  await page.getByRole('combobox', { name: 'Bron', exact: true }).selectOption({ label: 'Extreme Ownership' });
  await page.getByRole('button', { name: 'Programma starten' }).click();
  await page.getByLabel('Study the material afgerond').click();
  await expect(page.getByLabel('Study the material afgerond')).toBeChecked();
  await expect(page.getByText('20%')).toBeVisible();

  await page.goto(`${base}/kennis/logboek`);
  await page.getByLabel('Minuten').fill('25');
  await page.getByRole('button', { name: 'Minuten vastleggen' }).click();
  await expect(page.getByText('25 min').first()).toBeVisible();

  await page.reload();
  await page.goto(`${base}/groei/doelen`);
  await page.getByRole('link', { name: 'Beter leidinggeven' }).click();
  const kennis = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Uit Kennis' }) });
  await expect(kennis).toContainText('Extreme Ownership');
  await expect(kennis).toContainText('Neem eigenaarschap over resultaten');
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

async function addOwnProduct(page: Page, name: string, values: [string, string, string, string], amount: string) {
  await page.goto(`${base}/voeding/toevoegen`);
  await page.getByRole('button', { name: 'Barcode', exact: true }).click();
  await page.getByLabel('Barcode', { exact: false }).fill('87104000');
  await page.getByRole('button', { name: 'Opzoeken' }).click();
  await page.getByRole('button', { name: 'Zelf invoeren' }).last().click();
  await page.getByLabel('Naam').fill(name);
  await page.getByLabel('Energie per 100 g (kcal)').fill(values[0]);
  await page.getByLabel('Eiwit per 100 g (g)').fill(values[1]);
  await page.getByLabel('Koolhydraten per 100 g (g)').fill(values[2]);
  await page.getByLabel('Vet per 100 g (g)').fill(values[3]);
  await page.getByRole('button', { name: 'Verder' }).click();
  await page.getByLabel('Hoeveelheid (g)').fill(amount);
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page).toHaveURL(`${base}/voeding`);
}

test('Voeding: ingrediënt aanvullen, recept met berekende waarden, registreren als gegeten; geschiedenis blijft gelijk', async ({ page }) => {
  const errors = collectErrors(page);
  await page.route('**/api/voeding/product/**', (route) => route.fulfill({ json: { found: false } }));
  await addOwnProduct(page, 'Havermout', ['370', '13', '60', '7'], '50');
  await addOwnProduct(page, 'Melk', ['50', '3,4', '4,8', '1,5'], '200');
  const dayEnergy = page.locator('.metric').filter({ has: page.locator('.metric-label', { hasText: /^Energie$/ }) }).locator('.metric-value');
  await expect(dayEnergy).toHaveText('285 kcal');

  await page.goto(`${base}/voeding/producten`);
  await page.getByRole('link', { name: 'Melk' }).click();
  await page.getByRole('combobox', { name: /^Waarden gelden/ }).selectOption('100ml');
  await page.getByRole('button', { name: 'Ingrediënt opslaan' }).click();
  await page.getByRole('link', { name: 'Havermout' }).click();
  await page.getByLabel('Allergenen').fill('gluten');
  await page.getByRole('button', { name: 'Ingrediënt opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ingrediënten' })).toBeVisible();

  await page.goto(`${base}/voeding/recepten/nieuw`);
  await page.getByRole('button', { name: 'Recept opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('naam');
  await page.getByLabel('Naam van het recept').fill('Overnight oats');
  await page.getByLabel('Porties', { exact: true }).fill('2');
  await page.getByLabel('Labels').fill('ontbijt, snel');
  await page.getByRole('button', { name: 'Recept opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overnight oats' })).toBeVisible();

  const ingredient = page.getByRole('combobox', { name: /^Ingrediënt/ });
  await ingredient.selectOption({ label: 'Havermout' });
  await page.getByLabel('Hoeveelheid').fill('100');
  await page.getByRole('button', { name: 'Ingrediënt toevoegen' }).click();
  await expect(page.getByText('100 g Havermout')).toBeVisible();
  await ingredient.selectOption({ label: 'Melk' });
  await page.getByLabel('Hoeveelheid').fill('300');
  await page.getByRole('button', { name: 'Ingrediënt toevoegen' }).click();
  await expect(page.getByText('Melk heeft waarden per 100 ml; vul milliliter in.')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Melk uit het recept halen' }).click();
  await ingredient.selectOption({ label: 'Melk' });
  await page.getByLabel('Hoeveelheid').fill('300');
  await page.getByRole('combobox', { name: /^Eenheid/ }).selectOption('ml');
  await page.getByRole('button', { name: 'Ingrediënt toevoegen' }).click();
  await expect(page.getByText('300 ml Melk')).toBeVisible();
  const perServing = page.locator('.metric').filter({ hasText: 'Energie per portie' }).locator('.metric-value');
  await expect(perServing).toHaveText('260 kcal');
  await expect(page.getByText('Allergenen: gluten')).toBeVisible();

  await page.getByLabel('Gegeten porties').fill('1');
  await page.getByRole('button', { name: 'Registreren' }).click();
  await expect(page.getByText('Geregistreerd: 1 portie.')).toBeVisible();

  await page.getByRole('button', { name: 'Aanpassen' }).click();
  await page.getByLabel('Porties', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Recept opslaan' }).click();
  await expect(perServing).toHaveText('130 kcal');

  await page.reload();
  await page.goto(`${base}/voeding`);
  await expect(dayEnergy).toHaveText('545 kcal');
  await expect(page.getByText('Overnight oats')).toBeVisible();
  await page.goto(`${base}/voeding/recepten`);
  await page.getByRole('combobox', { name: /^Label/ }).selectOption('snel');
  await expect(page.getByRole('link', { name: 'Overnight oats' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Voeding: persoonlijke planning met recept en losse ingrediënten, dag herhalen, gegeten registreren en afgeleide boodschappenlijst', async ({ page }) => {
  const errors = collectErrors(page);
  await page.route('**/api/voeding/product/**', (route) => route.fulfill({ json: { found: false } }));
  await addOwnProduct(page, 'Havermout', ['370', '13', '60', '7'], '50');
  await page.goto(`${base}/voeding/recepten/nieuw`);
  await page.getByLabel('Naam van het recept').fill('Pap');
  await page.getByLabel('Porties', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Recept opslaan' }).click();
  await page.getByRole('combobox', { name: /^Ingrediënt/ }).selectOption({ label: 'Havermout' });
  await page.getByLabel('Hoeveelheid').fill('100');
  await page.getByRole('button', { name: 'Ingrediënt toevoegen' }).click();
  await expect(page.getByText('100 g Havermout')).toBeVisible();

  await page.goto(`${base}/voeding/planning`);
  await page.getByRole('button', { name: '＋ Plan' }).click();
  await page.getByLabel('Naam van het plan').fill('Testweek');
  await page.getByLabel('Doel energie (kcal per dag)').fill('2000');
  await page.getByLabel('Doel eiwit (g per dag)').fill('100');
  await page.getByRole('button', { name: 'Plan opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Testweek' })).toBeVisible();

  await page.getByRole('combobox', { name: /^Recept/ }).selectOption({ label: 'Pap' });
  await page.getByLabel('Porties', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Maaltijd plannen' }).click();
  await expect(page.locator('.list-item').filter({ hasText: 'Ontbijt: Pap' })).toContainText('740 kcal');
  await page.getByRole('combobox', { name: /^Maaltijdmoment/ }).selectOption('lunch');
  await page.getByRole('combobox', { name: /^Uit/ }).selectOption('los');
  await page.getByRole('combobox', { name: /^Ingrediënt/ }).selectOption({ label: 'Havermout' });
  await page.getByLabel('Hoeveelheid').fill('80');
  await page.getByLabel('Porties', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Maaltijd plannen' }).click();
  await expect(page.locator('.list-item').filter({ hasText: 'Lunch: Havermout' })).toContainText('296 kcal');
  await expect(page.getByText('Energie 52% van doel')).toBeVisible();

  const repeat = page.getByRole('combobox', { name: /^Deze dag herhalen op/ });
  const nextDay = await repeat.locator('option').nth(1).getAttribute('value');
  await repeat.selectOption(nextDay!);
  await page.getByRole('button', { name: 'Dag herhalen' }).click();
  await expect(page).toHaveURL(new RegExp(`dag=${nextDay}`));
  await expect(page.locator('.list-item').filter({ hasText: 'Ontbijt: Pap' })).toBeVisible();
  await expect(page.locator('.list-item').filter({ hasText: 'Lunch: Havermout' })).toBeVisible();

  await page.goto(`${base}/voeding/planning`);
  await page.getByRole('link', { name: 'Testweek' }).click();
  await page.getByRole('combobox', { name: 'Actie voor Pap' }).selectOption('gegeten');
  await expect(page.getByLabel('Gegeten porties')).toHaveValue('2');
  await page.getByRole('button', { name: 'Registreren' }).click();
  await expect(page.locator('.list-item').filter({ hasText: 'Ontbijt: Pap' })).toContainText('gegeten');

  await page.getByRole('link', { name: 'Boodschappenlijst' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Boodschappenlijst' })).toBeVisible();
  await expect(page.getByText('wordt niet opgeslagen en heeft geen historie')).toBeVisible();
  await expect(page.locator('.list-item').filter({ hasText: 'Havermout' })).toContainText('560 g');

  await page.goBack();
  await page.getByRole('button', { name: 'Plan bevestigen' }).click();
  await expect(page.getByText('· bevestigd')).toBeVisible();

  await page.reload();
  await page.goto(`${base}/voeding`);
  await expect(page.locator('.metric').filter({ has: page.locator('.metric-label', { hasText: /^Energie$/ }) }).locator('.metric-value')).toHaveText('925 kcal');
  expect(errors).toEqual([]);
});

async function addRecipe(page: Page, name: string, labels: string, ingredient: string, grams: string) {
  await page.goto(`${base}/voeding/recepten/nieuw`);
  await page.getByLabel('Naam van het recept').fill(name);
  await page.getByLabel('Porties', { exact: true }).fill('1');
  await page.getByLabel('Labels').fill(labels);
  await page.getByRole('button', { name: 'Recept opslaan' }).click();
  await page.getByRole('combobox', { name: /^Ingrediënt/ }).selectOption({ label: ingredient });
  await page.getByLabel('Hoeveelheid').fill(grams);
  await page.getByRole('button', { name: 'Ingrediënt toevoegen' }).click();
  await expect(page.getByText(`${grams} g ${ingredient}`)).toBeVisible();
}

test('Voeding: automatische planner respecteert uitsluitingen en slaat pas op na bevestiging', async ({ page }) => {
  const errors = collectErrors(page);
  await page.route('**/api/voeding/product/**', (route) => route.fulfill({ json: { found: false } }));
  await addOwnProduct(page, 'Havermout', ['370', '13', '60', '7'], '50');
  await addOwnProduct(page, 'Kip', ['165', '31', '0', '4'], '100');
  await addRecipe(page, 'Ontbijtpap', 'ontbijt', 'Havermout', '100');
  await addRecipe(page, 'Kipsalade', 'lunch', 'Kip', '200');
  await addRecipe(page, 'Kip uit de oven', 'diner', 'Kip', '300');
  await addRecipe(page, 'Pindadiner', 'diner, pinda', 'Havermout', '100');

  await page.goto(`${base}/voeding/planning`);
  await page.getByRole('link', { name: 'Automatisch plannen' }).click();
  await page.getByLabel('Labels die nooit mogen').fill('pinda');
  await page.getByLabel('Zelfde recept per week maximaal').fill('7');
  await page.getByRole('button', { name: 'Voorkeuren opslaan' }).click();
  await expect(page.getByText('Voorkeuren opgeslagen.')).toBeVisible();

  await page.getByLabel('Doel energie (kcal per dag)').fill('1200');
  await page.getByLabel('Doel eiwit (g per dag)').fill('120');
  await page.getByRole('button', { name: 'Concept maken' }).click();
  await expect(page.getByText('Concept: 7 van 7 dagen gevuld')).toBeVisible();
  await expect(page.getByText('Nog niet opgeslagen.')).toBeVisible();
  await expect(page.locator('.list-item').filter({ hasText: 'Pindadiner' })).toContainText('label pinda is uitgesloten');
  await expect(page.getByText(/Diner: Pindadiner/)).toHaveCount(0);

  await page.goto(`${base}/voeding/planning`);
  await expect(page.getByText('Nog geen plan')).toBeVisible();

  await page.getByRole('link', { name: 'Automatisch plannen' }).click();
  await expect(page.getByLabel('Labels die nooit mogen')).toHaveValue('pinda');
  await page.getByLabel('Doel energie (kcal per dag)').fill('1200');
  await page.getByLabel('Doel eiwit (g per dag)').fill('120');
  await page.getByRole('button', { name: 'Concept maken' }).click();
  await page.getByRole('button', { name: /^Ontbijtpap op .* weghalen uit het concept$/ }).first().click();
  await page.getByRole('button', { name: 'Bevestigen en opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Automatisch plan' })).toBeVisible();
  await expect(page.getByText(/· bevestigd$/)).toBeVisible();
  await page.goto(`${base}/voeding/planning`);
  await expect(page.locator('.list-item').filter({ hasText: 'Automatisch plan' })).toContainText('20 maaltijden');
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
  await expect(page.getByText('Opgeslagen', { exact: true })).toBeVisible();
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

test('SIDEQUEST: quest met categorie, deadline en benoemde stappen afvinken, bewerken en filteren', async ({ page }) => {
  const errors = collectErrors(page);
  const day = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  await page.goto(`${base}/quest/quests`);

  await page.getByRole('button', { name: '＋ Quest maken' }).click();
  await page.getByLabel('Naam').fill('Fiets opknappen');
  await page.getByLabel('Categorie').fill('Huis');
  await page.getByLabel('Deadline (optioneel)').fill(day(-1));
  await page.getByLabel('Punten bij voltooien').fill('30');
  await page.getByRole('button', { name: '＋ Stap toevoegen' }).click();
  await page.getByRole('button', { name: '＋ Stap toevoegen' }).click();
  await expect(page.getByLabel('Aantal stappen')).toHaveCount(0);
  await page.getByLabel('Stap 1', { exact: true }).fill('Banden plakken');
  await page.getByLabel('Stap 2', { exact: true }).fill('Remmen afstellen');
  await page.getByRole('button', { name: 'Quest opslaan' }).click();
  await expect(page.getByRole('alert')).toContainText('Kies een deadline vandaag of later.');
  await page.getByLabel('Deadline (optioneel)').fill(day(2));
  await page.getByRole('button', { name: 'Quest opslaan' }).click();

  const bike = page.locator('.quest-item').filter({ hasText: 'Fiets opknappen' });
  await expect(bike.getByText('Nog 2 dagen')).toBeVisible();
  await expect(bike.getByText('0 van 2 stappen')).toBeVisible();
  await expect(bike.getByRole('button', { name: 'Registreer stap' })).toHaveCount(0);

  await page.getByRole('button', { name: '＋ Quest maken' }).click();
  await page.getByLabel('Naam').fill('Boek lezen');
  await page.getByLabel('Categorie').fill('Leren');
  await page.getByLabel('Aantal stappen').fill('2');
  await page.getByRole('button', { name: 'Quest opslaan' }).click();
  await expect(page.locator('.quest-item').first()).toContainText('Fiets opknappen');

  await page.getByRole('group', { name: 'Filter op categorie' }).getByRole('button', { name: 'Leren' }).click();
  await expect(page.getByText('Fiets opknappen')).toHaveCount(0);
  await expect(page.getByText('Boek lezen')).toBeVisible();
  await page.getByRole('group', { name: 'Filter op categorie' }).getByRole('button', { name: 'Alle' }).click();

  await bike.getByRole('checkbox', { name: 'Banden plakken' }).click();
  await expect(bike.getByText('1 van 2 stappen')).toBeVisible();
  await bike.getByRole('button', { name: 'Fiets opknappen bewerken' }).click();
  await page.getByRole('button', { name: '＋ Stap toevoegen' }).click();
  await page.getByLabel('Stap 3', { exact: true }).fill('Proefrit');
  await page.getByRole('button', { name: 'Quest opslaan' }).click();
  await expect(bike.getByText('1 van 3 stappen')).toBeVisible();
  await expect(bike.getByRole('checkbox', { name: 'Banden plakken' })).toBeChecked();

  // Twee stappen direct na elkaar, zonder te wachten op opslaan: de tweede klik mag de eerste niet overschrijven.
  await bike.evaluate((item) => {
    const boxes = [...item.querySelectorAll<HTMLInputElement>('.quest-steps input')];
    boxes[1]!.click();
    boxes[2]!.click();
  });
  await expect(page.getByText('Huis · +30 punten')).toBeVisible();
  await expect(page.locator('.quest-item').filter({ hasText: 'Fiets opknappen' })).toHaveCount(0);

  await page.goto(`${base}/quest`);
  await expect(page.getByText('30 punten', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('SIDEQUEST: voortgang toont level, badges, statistieken en kalender uit eigen gegevens', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/quest/voortgang`);
  await expect(page.getByRole('heading', { level: 1, name: 'Voortgang' })).toBeVisible();
  await expect(page.getByText('Badges · 0 van 9')).toBeVisible();
  await expect(page.getByText('Nog geen quests')).toBeVisible();

  await page.goto(`${base}/quest/gewoontes`);
  await page.getByRole('button', { name: '＋ Gewoonte maken' }).click();
  await page.getByLabel('Gewoonte').fill('Lezen');
  await page.getByRole('button', { name: 'Gewoonte opslaan' }).click();
  await page.getByRole('button', { name: 'Vink vandaag af' }).click();
  await expect(page.getByRole('button', { name: 'Vandaag gedaan' })).toBeVisible();

  await page.goto(`${base}/quest/quests`);
  await page.getByRole('button', { name: '＋ Quest maken' }).click();
  await page.getByLabel('Naam').fill('Kast opruimen');
  await page.getByLabel('Categorie').fill('Huis');
  await page.getByLabel('Punten bij voltooien').fill('120');
  await page.getByLabel('Aantal stappen').fill('1');
  await page.getByRole('button', { name: 'Quest opslaan' }).click();
  await page.getByRole('button', { name: 'Registreer stap' }).click();
  await expect(page.getByText('Huis · +120 punten')).toBeVisible();

  await page.goto(`${base}/quest`);
  await expect(page.getByText('Level 2', { exact: true })).toBeVisible();
  await expect(page.getByText('Nog 125 punten tot level 3')).toBeVisible();

  await page.getByRole('link', { name: 'Voortgang →' }).click();
  await expect(page).toHaveURL(`${base}/quest/voortgang`);
  await expect(page.locator('.status-pill').filter({ hasText: '125 punten' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Voortgang naar level 3' })).toHaveAttribute('aria-valuenow', '125');
  await expect(page.getByText('Badges · 2 van 9')).toBeVisible();
  await expect(page.locator('.badge.earned')).toHaveCount(2);
  await expect(page.locator('.badge.earned').filter({ hasText: 'Eerste vinkje' })).toContainText('Behaald op');
  await expect(page.locator('.badge').filter({ hasText: 'Questjager' })).toContainText('1 van 10');
  await expect(page.locator('.metric').filter({ hasText: 'Voltooide quests' }).locator('.metric-value')).toHaveText('1');
  await expect(page.getByRole('img', { name: /Activiteit per dag, laatste 16 weken: 1 van \d+ dagen actief/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Huis/ })).toContainText('120');
  expect(errors).toEqual([]);
});

test('herinneringen: blok op het dashboard, teller in de modulebalk, vandaag verbergen en instellen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/`);
  await expect(page.getByText('Geen herinneringen voor nu.')).toBeVisible();

  await page.goto(`${base}/quest/gewoontes`);
  await page.getByRole('button', { name: '＋ Gewoonte maken' }).click();
  await page.getByLabel('Gewoonte').fill('Wandelen');
  await page.getByRole('button', { name: 'Gewoonte opslaan' }).click();
  await expect(page.getByRole('button', { name: 'Vink vandaag af' })).toBeVisible();

  const dashboardLink = page.locator('.sidebar .module-link').filter({ hasText: 'Dashboard' });
  await page.goto(`${base}/quest`);
  await expect(dashboardLink.locator('.module-badge')).toHaveText('2');
  await expect(dashboardLink).toHaveAccessibleName('Dashboard, 2 herinneringen');

  await page.goto(`${base}/`);
  const card = page.locator('.reminders-card');
  await expect(card.getByRole('heading', { name: 'Herinneringen · 2' })).toBeVisible();
  await expect(card.getByRole('link', { name: '1 gewoonte nog af te vinken' })).toHaveAttribute('href', '/quest/gewoontes');
  await expect(card.getByRole('link', { name: 'Nog geen back-up gemaakt' })).toBeVisible();

  await card.getByRole('button', { name: '1 gewoonte nog af te vinken vandaag verbergen' }).click();
  await expect(card.getByRole('heading', { name: 'Herinneringen · 1' })).toBeVisible();
  await expect(dashboardLink.locator('.module-badge')).toHaveText('1');
  await expect(dashboardLink).toHaveAccessibleName('Dashboard, 1 herinnering');

  await card.getByRole('button', { name: 'Instellen' }).click();
  await card.getByRole('checkbox', { name: 'Back-up ouder dan 14 dagen' }).uncheck();
  await card.getByRole('button', { name: 'Klaar' }).click();
  await expect(page.getByText('Geen herinneringen voor nu.')).toBeVisible();
  await expect(dashboardLink.locator('.module-badge')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Geen herinneringen voor nu.')).toBeVisible();
  await page.goto(`${base}/quest/gewoontes`);
  await page.getByRole('button', { name: 'Vink vandaag af' }).click();
  await expect(page.getByRole('button', { name: 'Vandaag gedaan' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('koppeling Sport → SIDEQUEST: standaard uit, aanzetten geeft 10 punten per trainingsdag, uitzetten haalt ze weg', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/sport/activiteiten`);
  await page.getByRole('button', { name: '＋ Toevoegen' }).click();
  await page.getByLabel('Duur (minuten)').fill('30');
  await page.getByRole('button', { name: /Activiteit opslaan/ }).click();
  await page.getByRole('button', { name: '＋ Toevoegen' }).click();
  await page.getByLabel('Duur (minuten)').fill('20');
  await page.getByRole('button', { name: /Activiteit opslaan/ }).click();
  await expect(page.getByText('20 min').first()).toBeVisible();

  await page.goto(`${base}/quest`);
  await expect(page.locator('.status-pill').filter({ hasText: /^0 punten$/ })).toBeVisible();

  await page.goto(`${base}/quest/instellingen`);
  const link = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Koppeling met Sport' }) });
  await expect(link.getByText('Staat uit. Als je aanzet, tellen alleen trainingen vanaf vandaag mee')).toBeVisible();
  await link.getByRole('checkbox', { name: /Punten voor trainingen/ }).click();
  await expect(link.getByRole('checkbox', { name: /Punten voor trainingen/ })).toBeChecked();
  await expect(link.getByText(/: 1 dag, 10 punten\./)).toBeVisible();

  await page.goto(`${base}/quest`);
  await expect(page.locator('.status-pill').filter({ hasText: /^10 punten$/ })).toBeVisible();
  await expect(page.getByText(/plus 10 punten per dag met een training/)).toBeVisible();
  await page.goto(`${base}/`);
  await expect(page.getByText('Level 1 · nog 90 punten tot level 2')).toBeVisible();

  await page.goto(`${base}/quest/instellingen`);
  await link.getByRole('checkbox', { name: /Punten voor trainingen/ }).click();
  await expect(link.getByRole('checkbox', { name: /Punten voor trainingen/ })).not.toBeChecked();
  await expect(link.getByText(/Staat nu uit; aanzetten telt weer vanaf dezelfde datum\./)).toBeVisible();
  await page.goto(`${base}/quest`);
  await expect(page.locator('.status-pill').filter({ hasText: /^0 punten$/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('een SIDEQUEST-back-up van schema 1 (oud adres) is nog te herstellen', async ({ page }, testInfo) => {
  const oldExport = {
    format: 'personal-ecosystem-local-data',
    appId: 'sidequest',
    schemaVersion: 1,
    exportedAt: '2026-11-10T08:00:00.000Z',
    stores: {
      goals: [],
      habits: [],
      habitChecks: [],
      quests: [{ id: 'oud', title: 'Quest van het oude adres', description: '', target: 2, progress: 0, rewardPoints: 15, status: 'active', completedAt: null, createdAt: '2026-11-01T08:00:00.000Z' }]
    }
  };
  const path = testInfo.outputPath('sidequest-v1.json');
  await writeFile(path, JSON.stringify(oldExport));
  await page.goto(`${base}/back-up`);
  await page.getByLabel('Back-upbestand (JSON)').setInputFiles(path);
  await expect(page.getByText('Bestand is in orde.')).toBeVisible();
  await page.getByRole('button', { name: 'Herstel deze module' }).click();
  await expect(page.getByText('Herstel voltooid.')).toBeVisible();
  await page.goto(`${base}/quest/quests`);
  await expect(page.getByText('Quest van het oude adres')).toBeVisible();
  await page.goto(`${base}/quest/instellingen`);
  await expect(page.getByText('SIDEQUEST · schema v2')).toBeVisible();
  await expect(page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Koppeling met Sport' }) }).getByRole('checkbox')).not.toBeChecked();
});

test('dashboard: weekreview toont vorige week (ma–zo) met verschil t.o.v. de week ervoor', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/`);
  const review = page.locator('.widget').filter({ has: page.getByRole('heading', { name: 'Vorige week' }) });
  await expect(review.getByText(/t\/m .*vergeleken met de week ervoor\./)).toBeVisible();
  await expect(review.getByRole('row', { name: /Trainingen/ })).toContainText('gelijk');
  await expect(review.getByRole('rowheader')).toHaveText(['Trainingen', 'Beweegminuten', 'Gewoontes afgevinkt', 'Quests voltooid', 'Punten', 'Dagen met dagboek', 'Dagen met Lichaam', 'Dagen met Voeding']);
  expect(errors).toEqual([]);
});

test('Sport-coach: profiel, voorstel als concept, bevestigen, inplannen en terugkoppeling leidt tot een nieuw concept', async ({ page }) => {
  const errors = collectErrors(page);
  const field = (text: string) => page.locator('label.field').filter({ hasText: text }).locator('input, select, textarea');
  await page.goto(`${base}/sport/coach`);
  await expect(page.getByRole('heading', { level: 1, name: 'Coach' })).toBeVisible();
  await expect(page.getByText('Eerst je sportprofiel')).toBeVisible();

  await field('Huidige activiteit').fill('Wandelt dagelijks, loopt soms 2 km');
  await field('Beschikbare minuten per week').fill('150');
  await field('Huidige trainingsminuten per week').fill('60');
  await field('Astma').selectOption('yes');
  await page.getByRole('button', { name: 'Profiel opslaan' }).click();
  await expect(page.getByText('Profiel opgeslagen')).toBeVisible();

  await field('Bijv. 5 km rustig kunnen lopen').fill('5 km rustig lopen');
  await page.getByRole('button', { name: 'Voorstel maken' }).click();
  await expect(page.getByText(/Concept opgeslagen/)).toBeVisible();
  const program = page.getByRole('article', { name: 'Hardlopen · 5 km rustig lopen' });
  await expect(program.locator('.status-pill')).toHaveText('Concept');
  await program.getByText('Onderbouwing en aandachtspunten').click();
  await expect(program.getByText(/sluit geen sport of trainingsvorm automatisch uit/)).toBeVisible();

  await program.getByRole('button', { name: 'Bevestigen' }).click();
  await expect(program.locator('.status-pill')).toHaveText('Actief');
  await program.getByRole('button', { name: 'Week 1 inplannen' }).click();
  await expect(page.getByText(/van week 1 staan in Planning/)).toBeVisible();

  await program.getByLabel('Minuten').fill('30');
  await program.getByLabel('Ervaren inspanning (RPE)').selectOption('9');
  await program.getByLabel('Herstel').selectOption('slecht');
  await program.getByRole('button', { name: 'Terugkoppeling opslaan' }).click();
  await expect(program.getByText('Terugkoppeling opgeslagen')).toBeVisible();
  await expect(program.getByText(/het herstel vraagt aandacht/)).toBeVisible();
  await program.getByRole('button', { name: 'Aanpassing voorstellen' }).click();
  await expect(page.getByText(/Het huidige programma is niet gewijzigd/)).toBeVisible();
  await expect(page.getByRole('article', { name: 'Hardlopen · 5 km rustig lopen' })).toHaveCount(2);
  await expect(page.getByText(/versie 2/)).toBeVisible();

  await page.goto(`${base}/sport/planning`);
  await expect(page.getByText(/Coach: /).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Sport-coach maakt geen voorstel bij ingevulde fysieke aandachtspunten', async ({ page }) => {
  const field = (text: string) => page.locator('label.field').filter({ hasText: text }).locator('input, select, textarea');
  await page.goto(`${base}/sport/coach`);
  await field('Huidige activiteit').fill('Wandelt dagelijks');
  await field('Beschikbare minuten per week').fill('150');
  await field('Fysieke aandachtspunten').fill('Knieklachten');
  await page.getByRole('button', { name: 'Profiel opslaan' }).click();
  await expect(page.getByText('Profiel opgeslagen')).toBeVisible();
  await field('Bijv. 5 km rustig kunnen lopen').fill('5 km');
  await page.getByRole('button', { name: 'Voorstel maken' }).click();
  await expect(page.getByText('Geen voorstel gemaakt')).toBeVisible();
  await expect(page.getByText(/bevoegde professional/)).toBeVisible();
  await expect(page.getByText('Nog geen programma\'s')).toBeVisible();
});

test('Sport: weekdoel over Sport en Duur, training plannen en status volgt uit vastgelegde trainingen', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${base}/sport/planning`);
  await page.getByLabel('Trainingen per week').fill('2');
  await page.getByRole('button', { name: 'Weekdoel opslaan' }).click();
  await expect(page.getByText('Weekdoel opgeslagen')).toBeVisible();
  await expect(page.getByText('Trainingen: 0 van 2')).toBeVisible();

  await page.getByLabel('Naam').fill('Hardlopen');
  await page.getByLabel('Minuten', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Inplannen' }).click();
  const todayCard = page.locator('.plan-day.today');
  await expect(todayCard.getByText('Hardlopen · 30 min')).toBeVisible();
  await expect(todayCard.locator('.status-pill')).toHaveText('Gepland');

  await page.goto(`${base}/sport/activiteiten`);
  await page.getByRole('button', { name: '＋ Toevoegen' }).click();
  await page.getByLabel('Duur (minuten)').fill('30');
  await page.getByRole('button', { name: /Activiteit opslaan/ }).click();
  await expect(page.getByText('30 min').first()).toBeVisible();

  await page.goto(`${base}/duur/toevoegen`);
  await page.getByPlaceholder('45:00').fill('20:00');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page).toHaveURL(/\/duur\/activiteit\//);

  await page.goto(`${base}/sport/planning`);
  await expect(page.locator('.plan-day.today .status-pill')).toHaveText('Gedaan');
  await expect(page.locator('.plan-day.today')).toContainText('2 trainingen · 50 min');
  await page.goto(`${base}/sport`);
  const goal = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Weekdoel' }) });
  await expect(goal.getByText('Trainingen: 2 van 2')).toBeVisible();
  await expect(goal.getByText('Gehaald')).toBeVisible();
  expect(errors).toEqual([]);
});

test('een Sport-back-up van schema 1 (oud adres) is nog te herstellen', async ({ page }, testInfo) => {
  const oldExport = {
    format: 'personal-ecosystem-local-data',
    appId: 'sport',
    schemaVersion: 1,
    exportedAt: '2026-11-10T08:00:00.000Z',
    stores: {
      activities: [{ id: 'oud', startedAt: '2026-11-09T07:00:00.000Z', type: 'run', durationMinutes: 33, distanceKm: 5, notes: 'Van het oude adres' }],
      trainings: []
    }
  };
  const path = testInfo.outputPath('sport-v1.json');
  await writeFile(path, JSON.stringify(oldExport));
  await page.goto(`${base}/back-up`);
  await page.getByLabel('Back-upbestand (JSON)').setInputFiles(path);
  await expect(page.getByText('Bestand is in orde.')).toBeVisible();
  await page.getByRole('button', { name: 'Herstel deze module' }).click();
  await expect(page.getByText('Herstel voltooid.')).toBeVisible();
  await page.goto(`${base}/sport/activiteiten`);
  await expect(page.getByText('33 min').first()).toBeVisible();
  await page.goto(`${base}/sport/planning`);
  await expect(page.getByRole('heading', { level: 1, name: 'Planning' })).toBeVisible();
  await page.goto(`${base}/sport/coach`);
  await expect(page.getByRole('heading', { level: 1, name: 'Coach' })).toBeVisible();
});

for (const width of [375, 768, 1280]) {
  test(`Personal Ecosystem past op ${width}px zonder horizontaal scrollen`, async ({ page }) => {
    // Ruim 40 pagina's achter elkaar; de standaardlimiet van 30 s is bij parallelle runs te krap.
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/sport', '/sport/planning', '/sport/coach', '/quest', '/quest/quests', '/quest/voortgang', '/lichaam', '/lichaam/invoeren', '/voeding', '/voeding/toevoegen', '/voeding/planning', '/voeding/planning/automatisch', '/voeding/recepten', '/voeding/recepten/nieuw', '/kracht', '/kracht/training', '/kracht/oefeningen', '/kracht/schemas/nieuw', '/duur', '/duur/importeren', '/duur/toevoegen', '/dagboek', '/dagboek/schrijven', '/dagboek/archief', '/groei', '/groei/doelen', '/groei/acties', '/groei/gewoontes', '/groei/systeem', '/kennis', '/kennis/bibliotheek', '/kennis/inzichten', '/kennis/studie', '/kennis/logboek', '/financien', '/financien/transacties', '/financien/budgetten', '/financien/rapportage', '/financien/money-manual', '/financien/beleggingsplan', '/back-up']) {
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
  expect(Object.keys(backup.modules).sort()).toEqual(['dagboek', 'duur', 'financien', 'groei', 'hub', 'kracht', 'lichaam', 'sidequest', 'sport', 'voeding']);
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
