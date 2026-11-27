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
