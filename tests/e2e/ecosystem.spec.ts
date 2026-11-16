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
  ['/', /Welkom/],
  ['/instellingen', 'Instellingen'],
  ['/sport', 'Sport, op jouw manier.'],
  ['/sport/activiteiten', 'Activiteiten'],
  ['/quest', 'Jouw volgende quest.'],
  ['/quest/gewoontes', 'Gewoontes'],
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

test('dashboardtegel opent Sport in hetzelfde tabblad', async ({ page }) => {
  await page.goto(base);
  const link = page.getByRole('link', { name: 'Open Sportapp ↗' });
  await expect(link).toHaveAttribute('href', `${base}/sport`);
  await expect(link).not.toHaveAttribute('target', '_blank');
  await link.click();
  await expect(page).toHaveURL(`${base}/sport`);
});

for (const width of [375, 768, 1280]) {
  test(`Personal Ecosystem past op ${width}px zonder horizontaal scrollen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/sport', '/quest', '/back-up']) {
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
  expect(Object.keys(backup.modules).sort()).toEqual(['hub', 'sidequest', 'sport']);
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
