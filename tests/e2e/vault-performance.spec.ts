import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';

/**
 * P-6 prestatietest (ADR 0031, Gevolgen: prestaties) in de kluisbuild. Grote synthetische proefdataset:
 * tien jaar dagboek (3.650 notities) en 10.000 transacties. Gemeten: overzetten naar versleutelde opslag,
 * en na herladen openen van de kluis tot de module met alle ontsleutelde records klaar is.
 * Daarnaast: één transactie opslaan bij 10.000 bestaande. De grenzen zijn ruim (CI-machines verschillen);
 * de gemeten tijden staan in de testannotaties en in de testuitvoer.
 */
const base = 'http://127.0.0.1:4178';
const password = 'synthetisch-wachtwoord-1';
const JOURNAL_DAYS = 3650;
const TRANSACTIONS = 10_000;
const LIMITS = { migrateMs: 240_000, openMs: 15_000, saveMs: 5_000 };
let harness = '';

test.describe.configure({ timeout: 300_000 });

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

async function createVault(page: Page) {
  await page.getByLabel(/^Kluiswachtwoord/).fill(password);
  await page.getByLabel('Herhaal kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Kluis aanmaken' }).click();
  const code = (await page.getByLabel('Herstelcode', { exact: true }).textContent({ timeout: 15_000 }))!.trim();
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Downloaden' }).click()]);
  await page.getByLabel(/^Typ de herstelcode ter controle/).fill(code);
  await page.getByRole('button', { name: 'Kluis activeren' }).click();
}

/** Opent de kluis en meet tot de module zijn (ontsleutelde) gegevens heeft geladen. */
async function timeOpen(page: Page, path: string, heading: RegExp): Promise<number> {
  await page.goto(`${base}${path}`);
  await page.getByLabel('Kluiswachtwoord').fill(password);
  const start = Date.now();
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: LIMITS.openMs * 2 });
  await expect(page.getByText('Gegevens laden…')).toHaveCount(0, { timeout: LIMITS.openMs * 2 });
  return Date.now() - start;
}

test('prestaties met een grote proefdataset: overzetten en openen blijven binnen de grenzen', async ({ page }) => {
  await page.goto(`${base}/`);
  await page.evaluate(`${harness}\nwindow.peSeed = peSeed;`);
  const total = await page.evaluate(([days, count]) => window.peSeed.seedLarge(days, count), [JOURNAL_DAYS, TRANSACTIONS] as const);
  expect(total).toBe(JOURNAL_DAYS + TRANSACTIONS);
  await page.reload();

  await createVault(page);
  await expect(page.getByText(`Nog onversleuteld: ${total.toLocaleString('nl-NL')} records.`).or(page.getByText(`Nog onversleuteld: ${total} records.`))).toBeVisible({ timeout: 30_000 });
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back-up downloaden' }).click()]);
  const migrateStart = Date.now();
  await page.getByRole('button', { name: 'Overzetten' }).click();
  await expect(page.getByRole('status')).toContainText('Alles is overgezet.', { timeout: LIMITS.migrateMs });
  const migrateMs = Date.now() - migrateStart;

  const financienMs = await timeOpen(page, '/financien/transacties', /Transacties/);
  await page.getByRole('button', { name: '＋ Transactie' }).click();
  await page.getByLabel('Bedrag (€)').fill('12,34');
  await page.getByLabel('Omschrijving').fill('Synthetische meting');
  const saveStart = Date.now();
  await page.getByRole('button', { name: 'Transactie opslaan' }).click();
  await expect(page.getByLabel('Bedrag (€)')).toHaveCount(0, { timeout: LIMITS.saveMs * 5 });
  const saveMs = Date.now() - saveStart;
  const dagboekMs = await timeOpen(page, '/dagboek/archief', /Archief/);

  const result = { records: total, migrateMs, financienOpenMs: financienMs, saveMs, dagboekOpenMs: dagboekMs };
  test.info().annotations.push({ type: 'prestaties', description: JSON.stringify(result) });
  console.log(`P-6 prestaties: ${JSON.stringify(result)}`);
  expect(migrateMs).toBeLessThan(LIMITS.migrateMs);
  expect(financienMs).toBeLessThan(LIMITS.openMs);
  expect(dagboekMs).toBeLessThan(LIMITS.openMs);
  expect(saveMs).toBeLessThan(LIMITS.saveMs);
});
