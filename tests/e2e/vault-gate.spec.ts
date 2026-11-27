import { expect, test, type Page } from '@playwright/test';

/**
 * P-6 stap 5, deel 1: kluis aanmaken en openen in de app (ADR 0029 § 1, ADR 0031 § 2–3).
 * Draait tegen de testbuild met de kluis aan (`--mode vault`, poort 4178). Alleen synthetische wachtwoorden.
 */
const base = 'http://127.0.0.1:4178';
const password = 'synthetisch-wachtwoord-1';

async function createVault(page: Page): Promise<string> {
  await page.goto(`${base}/groei`);
  await expect(page.getByRole('heading', { name: 'Kluis aanmaken' })).toBeVisible();
  await page.getByLabel(/^Kluiswachtwoord/).fill(password);
  await page.getByLabel('Herhaal kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Kluis aanmaken' }).click();
  await expect(page.getByRole('heading', { name: 'Bewaar je herstelcode' })).toBeVisible({ timeout: 15_000 });
  const code = (await page.getByLabel('Herstelcode', { exact: true }).textContent())!.trim();

  // Zonder bewaren kan de kluis niet actief worden.
  await expect(page.getByRole('button', { name: 'Kluis activeren' })).toBeDisabled();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Downloaden' }).click()]);
  expect(download.suggestedFilename()).toBe('herstelcode-personal-ecosystem.txt');

  // Een verkeerde code activeert niets.
  await page.getByLabel(/^Typ de herstelcode ter controle/).fill('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF');
  await page.getByRole('button', { name: 'Kluis activeren' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'Kluis' })).toHaveCount(0);

  await page.getByLabel(/^Typ de herstelcode ter controle/).fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Kluis activeren' }).click();
  await expect(page.getByRole('region', { name: 'Kluis' })).toBeVisible({ timeout: 15_000 });
  return code;
}

test('kluis aanmaken vraagt bewaren en controleren van de herstelcode; na herladen is de kluis dicht', async ({ page }) => {
  const code = await createVault(page);
  await expect(page.getByRole('heading', { name: 'Waar groei je naartoe?' })).toBeVisible();

  // Op het apparaat staat alleen het ingepakte kluisrecord: geen wachtwoord, herstelcode of sleutel.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).toContain('personal-ecosystem.vault.record');
  expect(stored).not.toContain(password);
  expect(stored.replace(/-/g, '')).not.toContain(code.replace(/-/g, ''));

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Kluis openen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Waar groei je naartoe?' })).toHaveCount(0);

  await page.getByLabel('Kluiswachtwoord').fill('fout-wachtwoord-123');
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Onjuist kluiswachtwoord', { timeout: 15_000 });

  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Waar groei je naartoe?' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Vergrendelen' }).click();
  await expect(page.getByRole('heading', { name: 'Kluis openen' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Waar groei je naartoe?' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Met herstelcode openen' }).click();
  await page.getByLabel('Herstelcode', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Waar groei je naartoe?' })).toBeVisible({ timeout: 15_000 });
});

test('de kluis vergrendelt na de ingestelde inactiviteit (5–60 minuten)', async ({ page }) => {
  await page.clock.install();
  await createVault(page);
  const select = page.getByLabel('Automatisch vergrendelen na');
  await expect(select).toHaveValue('15');
  await select.selectOption('5');
  await page.clock.fastForward('04:30');
  await expect(page.getByRole('region', { name: 'Kluis' })).toBeVisible();
  await page.clock.fastForward('01:00');
  await expect(page.getByRole('heading', { name: 'Kluis openen' })).toBeVisible();

  // De keuze blijft bewaard.
  await page.getByLabel('Kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Openen', exact: true }).click();
  await expect(page.getByLabel('Automatisch vergrendelen na')).toHaveValue('5', { timeout: 15_000 });
});

test('kluis annuleren tijdens het aanmaken laat geen kluisrecord achter', async ({ page }) => {
  await page.goto(`${base}/`);
  await page.getByLabel(/^Kluiswachtwoord/).fill(password);
  await page.getByLabel('Herhaal kluiswachtwoord').fill(password);
  await page.getByRole('button', { name: 'Kluis aanmaken' }).click();
  await expect(page.getByRole('heading', { name: 'Bewaar je herstelcode' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Annuleren' }).click();
  await expect(page.getByRole('heading', { name: 'Kluis aanmaken' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('personal-ecosystem.vault.record'))).toBeNull();
});

test('een te kort of ongelijk wachtwoord wordt geweigerd', async ({ page }) => {
  await page.goto(`${base}/`);
  await page.getByLabel(/^Kluiswachtwoord/).fill('kort');
  await page.getByLabel('Herhaal kluiswachtwoord').fill('kort');
  await page.getByRole('button', { name: 'Kluis aanmaken' }).click();
  await expect(page.getByRole('alert')).toContainText('minimaal 12 tekens');
  await page.getByLabel(/^Kluiswachtwoord/).fill(password);
  await page.getByLabel('Herhaal kluiswachtwoord').fill(`${password}x`);
  await page.getByRole('button', { name: 'Kluis aanmaken' }).click();
  await expect(page.getByRole('alert')).toContainText('niet gelijk');
});
