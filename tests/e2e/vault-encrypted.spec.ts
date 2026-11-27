import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';

/**
 * P-6 stap 5, deel 2 (ADR 0031 § 1 en § 5) in de kluisbuild: bestaande onversleutelde gegevens worden
 * na een back-up per record overgezet; daarna staat in IndexedDB geen leesbare inhoud. Synthetische gegevens.
 */
const base = 'http://127.0.0.1:4178';
const password = 'synthetisch-wachtwoord-1';
const secret = 'Synthetische dagboektekst over de Vecht';
let harness = '';

test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: { write: false, minify: false, lib: { entry: fileURLToPath(new URL('./harness/plaintextSeed.ts', import.meta.url)), name: 'peSeed', formats: ['iife'], fileName: () => 'seed.js' } }
  });
  const output = Array.isArray(result) ? result[0]! : result;
  if (!('output' in output)) throw new Error('Harness bundle failed.');
  harness = output.output.find((chunk) => chunk.type === 'chunk')!.code;
});

declare global {
  interface Window { peSeed: typeof import('./harness/plaintextSeed') }
}

async function inject(page: Page) {
  await page.evaluate(`${harness}\nwindow.peSeed = peSeed;`);
}

async function createVault(page: Page) {
  await page.getByLabel(/^Kluiswachtwoord/).fill(password);
  await page.getByLabel('Herhaal kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Kluis aanmaken' }).click();
  const code = (await page.getByLabel('Herstelcode', { exact: true }).textContent({ timeout: 15_000 }))!.trim();
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Downloaden' }).click()]);
  await page.getByLabel(/^Typ de herstelcode ter controle/).fill(code);
  await page.getByRole('button', { name: 'Kluis activeren' }).click();
}

test('bestaande onversleutelde gegevens: eerst back-up, dan per record overzetten; daarna niets leesbaars in IndexedDB', async ({ page }) => {
  await page.goto(`${base}/`);
  await inject(page);
  await page.evaluate((text) => window.peSeed.seedJournal('2026-11-20', text), secret);
  await page.reload();

  await createVault(page);
  await expect(page.getByRole('heading', { name: 'Gegevens versleutelen' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Nog onversleuteld: 1 record.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Overzetten' })).toBeDisabled();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back-up downloaden' }).click()]);
  expect(await readFile(await download.path(), 'utf8')).toContain(secret);
  await page.getByRole('button', { name: 'Overzetten' }).click();
  await expect(page.getByRole('status')).toContainText('1 record versleuteld. Alles is overgezet.', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Naar de app' }).click();

  // Wisselen van module houdt de kluis open en toont de overgezette notitie uit de versleutelde opslag.
  await page.getByRole('link', { name: /Dagboek/ }).first().click();
  await page.getByRole('link', { name: /Archief/ }).first().click();
  await expect(page.getByText(secret)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kluis' })).toBeVisible();

  await inject(page);
  const raw = await page.evaluate(() => window.peSeed.rawIndexedDb());
  expect(Object.keys(raw)).toContain('personal-ecosystem-dagboek-encrypted');
  for (const [name, content] of Object.entries(raw)) expect(content, name).not.toContain('Vecht');

  // Na herladen is de kluis dicht; na openen staat de notitie er nog, zonder nieuwe overzetting.
  await page.reload();
  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gegevens versleutelen' })).toHaveCount(0);
  await page.getByRole('link', { name: /Archief/ }).first().click();
  await expect(page.getByText(secret)).toBeVisible({ timeout: 15_000 });
});

test('nieuwe invoer in de kluisbuild wordt versleuteld opgeslagen', async ({ page }) => {
  await page.goto(`${base}/dagboek/schrijven`);
  await createVault(page);
  await expect(page.getByRole('region', { name: 'Kluis' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Notitie', { exact: false }).fill('Nieuwe synthetische zeiltocht op het IJsselmeer');
  await page.getByRole('button', { name: /Goed/ }).click();
  await page.getByRole('button', { name: 'Notitie opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vandaag: 🙂 Goed');

  await inject(page);
  const raw = await page.evaluate(() => window.peSeed.rawIndexedDb());
  expect(raw['personal-ecosystem-dagboek-encrypted']).toBeTruthy();
  for (const [name, content] of Object.entries(raw)) expect(content, name).not.toContain('IJsselmeer');
  expect(raw['personal-ecosystem-dagboek'] ?? '[[]]').toBe('[[]]');
});

test('een lopende krachttraining (concept) staat versleuteld in de browser en is na vergrendelen en openen terug', async ({ page }) => {
  await page.goto(`${base}/kracht/training`);
  await createVault(page);
  await expect(page.getByRole('region', { name: 'Kluis' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Oefening kiezen').selectOption({ label: 'Squat' });
  await page.getByRole('button', { name: 'Toevoegen' }).click();
  await page.getByLabel('Squat set 1 gewicht').fill('77,5');
  await page.getByLabel('Squat set 1 gewicht').blur();

  await expect.poll(() => page.evaluate(() => localStorage.getItem('personal-ecosystem.sealed.personal-ecosystem.kracht.concept'))).not.toBeNull();
  const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(raw).not.toContain('Squat');
  expect(raw).not.toContain('77,5'); // base64 bevat geen komma, dus geen toevallige treffer

  await page.getByRole('button', { name: 'Vergrendelen' }).click();
  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByLabel('Squat set 1 gewicht')).toHaveValue('77,5', { timeout: 15_000 });
});

test('niet-opgeslagen dagboektekst wordt bij vergrendelen versleuteld bewaard en na openen teruggezet', async ({ page }) => {
  await page.goto(`${base}/dagboek/schrijven`);
  await createVault(page);
  await expect(page.getByRole('region', { name: 'Kluis' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Notitie', { exact: false }).fill('Half geschreven synthetische gedachte over de Waddenzee');
  await page.getByRole('button', { name: /Goed/ }).click();

  await page.getByRole('button', { name: 'Vergrendelen' }).click();
  await expect(page.getByRole('heading', { name: 'Kluis openen' })).toBeVisible();
  const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(raw).toContain('personal-ecosystem.sealed.personal-ecosystem.dagboek.concept');
  expect(raw).not.toContain('Waddenzee');

  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByLabel('Notitie', { exact: false })).toHaveValue('Half geschreven synthetische gedachte over de Waddenzee', { timeout: 15_000 });
  await expect(page.getByText('Niet-opgeslagen invoer van de vorige keer is teruggezet.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Goed/ })).toHaveAttribute('aria-pressed', 'true');

  // Na opslaan is het concept weg.
  await page.getByRole('button', { name: 'Notitie opslaan' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vandaag: 🙂 Goed');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('personal-ecosystem.sealed.personal-ecosystem.dagboek.concept'))).toBeNull();
});

test('niet-opgeslagen invoer in een Groei-formulier wordt bij vergrendelen versleuteld bewaard en na openen teruggezet', async ({ page }) => {
  const conceptKey = 'personal-ecosystem.sealed.personal-ecosystem.concept.groei.doel';
  await page.goto(`${base}/groei/doelen?nieuw=1`);
  await createVault(page);
  await expect(page.getByRole('region', { name: 'Kluis' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'Titel' }).fill('Synthetisch doel: de Elfstedenroute fietsen');
  await page.getByLabel('Omschrijving').fill('Half ingevuld');

  await page.getByRole('button', { name: 'Vergrendelen' }).click();
  await expect(page.getByRole('heading', { name: 'Kluis openen' })).toBeVisible();
  const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(raw).toContain(conceptKey);
  expect(raw).not.toContain('Elfstedenroute');

  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Titel' })).toHaveValue('Synthetisch doel: de Elfstedenroute fietsen', { timeout: 15_000 });
  await expect(page.getByLabel('Omschrijving')).toHaveValue('Half ingevuld');
  await expect(page.getByText('Niet-opgeslagen invoer van de vorige keer is teruggezet.')).toBeVisible();

  await page.getByRole('button', { name: 'Doel opslaan' }).click();
  await expect(page.getByText('Synthetisch doel: de Elfstedenroute fietsen').first()).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), conceptKey)).toBeNull();
});

test('een half ingevulde lichaamsmeting en duurtraining komen na vergrendelen en openen terug', async ({ page }) => {
  await page.goto(`${base}/lichaam/invoeren`);
  await createVault(page);
  await expect(page.getByRole('region', { name: 'Kluis' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('Notitie', { exact: false }).fill('Synthetische notitie over de Veluwe');

  await page.getByRole('button', { name: 'Vergrendelen' }).click();
  await expect(page.getByRole('heading', { name: 'Kluis openen' })).toBeVisible();
  const raw = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(raw).toContain('personal-ecosystem.sealed.personal-ecosystem.concept.lichaam.meting');
  expect(raw).not.toContain('Veluwe');

  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByLabel('Notitie', { exact: false })).toHaveValue('Synthetische notitie over de Veluwe', { timeout: 15_000 });
  await expect(page.getByText('Niet-opgeslagen invoer van de vorige keer is teruggezet.')).toBeVisible();
  await page.getByRole('button', { name: 'Invoer weggooien' }).click();
  await expect(page.getByLabel('Notitie', { exact: false })).toHaveValue('');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('personal-ecosystem.sealed.personal-ecosystem.concept.lichaam.meting'))).toBeNull();

  await page.goto(`${base}/duur/toevoegen`);
  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await page.getByLabel('Notities', { exact: false }).fill('Synthetisch rondje Amstel');
  await page.getByRole('button', { name: 'Vergrendelen' }).click();
  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByLabel('Notities', { exact: false })).toHaveValue('Synthetisch rondje Amstel', { timeout: 15_000 });
});
