import { expect, test } from '@playwright/test';

const landingUrl = 'http://127.0.0.1:4176/';
const appIds = ['hub', 'sportapp', 'sidequest'];

for (const width of [375, 768, 1280]) {
  test(`public landing page fits a ${width}px viewport`, async ({ page }) => {
    const requestOrigins = new Set<string>();
    page.on('request', (request) => requestOrigins.add(new URL(request.url()).origin));
    await page.setViewportSize({ width, height: 900 });

    const response = await page.goto(landingUrl);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Jouw apps. Jouw gegevens.' })).toBeVisible();
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      /default-src 'none'; script-src 'self'; style-src 'self'/
    );
    await expect(page.locator('script[src^="http"]')).toHaveCount(0);
    await expect(page.locator('[data-app-card]')).toHaveCount(5);
    await expect(page.getByText('Lokaal, geen account nodig', { exact: true })).toHaveCount(3);
    await expect(page.getByText('Bestaande app · met account', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Documentatie' })).toBeVisible();

    for (const [appId, url] of [
      ['samen-thuis', 'https://kesga44-jpg.github.io/Samen-thuis/'],
      ['coach', 'https://kesga44-jpg.github.io/Coach/']
    ]) {
      const link = page.locator(`[data-app-card="${appId}"]`).getByRole('link', { name: 'Openen' });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', url);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }

    for (const appId of appIds) {
      await expect(page.locator(`[data-app-card="${appId}"]`).getByRole('button', { name: 'Openen' })).toBeDisabled();
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
    const columns = await page.locator('.apps').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width <= 560 ? 1 : width <= 800 ? 2 : 3);
    expect([...requestOrigins]).toEqual(['http://127.0.0.1:4176']);
  });
}

test('configured app links use distinct HTTPS origins', async ({ page }) => {
  await page.route(`${landingUrl}app-urls.js`, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.PERSONAL_ECOSYSTEM_APP_URLS = {
      hub: 'https://hub.example.com/',
      sportapp: 'https://sport.example.com/',
      sidequest: 'https://sidequest.example.com/'
    };`
  }));
  await page.goto(landingUrl);

  for (const [appId, host] of [
    ['hub', 'hub.example.com'],
    ['sportapp', 'sport.example.com'],
    ['sidequest', 'sidequest.example.com']
  ]) {
    const card = page.locator(`[data-app-card="${appId}"]`);
    await expect(card.getByRole('link', { name: 'Openen' })).toHaveAttribute('href', `https://${host}/`);
    await expect(card.locator('[data-app-link-status]')).toBeEmpty();
  }
});

test('existing apps open their configured URLs in separate tabs', async ({ page, context }) => {
  for (const [appId, url] of [
    ['samen-thuis', 'https://kesga44-jpg.github.io/Samen-thuis/'],
    ['coach', 'https://kesga44-jpg.github.io/Coach/']
  ]) {
    await context.route(url, (route) => route.fulfill({ contentType: 'text/html', body: '<title>App</title>' }));
    await page.goto(landingUrl);
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator(`[data-app-card="${appId}"]`).getByRole('link', { name: 'Openen' }).click()
    ]);
    await expect(popup).toHaveURL(url);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    await context.unroute(url);
  }
});

test('rejects app links that reuse an origin', async ({ page }) => {
  await page.route(`${landingUrl}app-urls.js`, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `window.PERSONAL_ECOSYSTEM_APP_URLS = {
      hub: 'https://shared.example.com/',
      sportapp: 'https://shared.example.com/sportapp/',
      sidequest: ''
    };`
  }));
  await page.goto(landingUrl);

  const hubCard = page.locator('[data-app-card="hub"]');
  await expect(hubCard.getByRole('link', { name: 'Openen' })).toHaveAttribute('href', 'https://shared.example.com/');
  await expect(hubCard.locator('[data-app-link-status]')).toBeEmpty();

  const sportCard = page.locator('[data-app-card="sportapp"]');
  await expect(sportCard.getByRole('button', { name: 'Openen' })).toBeDisabled();
  await expect(sportCard.locator('[data-app-link-status]')).toHaveText('De app-link is niet veilig ingesteld.');
});
