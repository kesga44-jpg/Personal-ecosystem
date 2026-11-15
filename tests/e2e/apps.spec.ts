import { expect, test } from '@playwright/test';

test('Hub opens the configured Sportapp and shows only Hub-owned activity', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welkom/ })).toBeVisible();
  await expect(page.getByText('Appdata blijft gescheiden')).toBeVisible();

  const sportPage = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open Sportapp' }).click();
  const popup = await sportPage;
  await expect(popup).toHaveURL(/:4174\/$/);
  await expect(page.getByText('Sportapp geopend')).toBeVisible();
});

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

test('Hub serves its installable app shell offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await page.waitForFunction(async () => (await navigator.serviceWorker?.getRegistrations()).length > 0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Welkom/ })).toBeVisible();
  await context.setOffline(false);
});
