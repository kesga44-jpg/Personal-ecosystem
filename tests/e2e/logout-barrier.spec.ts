import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';

/**
 * P-6 logout/sync barrier in real Chromium: two tabs on the PE origin share Web Locks, IndexedDB
 * and localStorage. The logout UI is not wired yet (P-6 step 5), so a test-only harness drives the
 * real coordinator and storage adapter. Synthetic database and records only.
 */
const base = 'http://127.0.0.1:4177';
let harness = '';

test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      lib: { entry: fileURLToPath(new URL('./harness/logoutBarrier.ts', import.meta.url)), name: 'peBarrier', formats: ['iife'], fileName: () => 'harness.js' }
    }
  });
  const output = Array.isArray(result) ? result[0]! : result;
  if (!('output' in output)) throw new Error('Harness bundle failed.');
  harness = output.output.find((chunk) => chunk.type === 'chunk')!.code;
});

async function tab(page: Page): Promise<Page> {
  await page.goto(`${base}/back-up`);
  // The app's CSP blocks inline scripts; evaluate runs the bundle through DevTools instead.
  await page.evaluate(`${harness}\nwindow.peBarrier = peBarrier;`);
  return page;
}

declare global {
  interface Window {
    peBarrier: typeof import('./harness/logoutBarrier');
    peLogout?: Promise<unknown>;
  }
}

test('afmelden wist geen wijziging die een ander tabblad tijdens de bevestiging maakte, en blokkeert daarna writes en sync, ook na herladen', async ({ context }) => {
  const a = await tab(await context.newPage());
  const b = await tab(await context.newPage());
  await a.evaluate(() => window.peBarrier.reset());

  expect(await a.evaluate(() => window.peBarrier.write('synced'))).toBe('ok');
  expect(await a.evaluate(() => window.peBarrier.sync())).toBe('ok');

  // Race 1: tab B changes data while tab A's confirmation dialog is open.
  await a.evaluate(() => { window.peLogout = window.peBarrier.startLogout(); });
  expect(await b.evaluate(() => window.peBarrier.write('typed-in-tab-b'))).toBe('ok');
  await a.evaluate(() => window.peBarrier.confirm());
  expect(await a.evaluate(() => window.peLogout)).toMatchObject({ status: 'blocked', vaultLocked: true });
  expect(await b.evaluate(() => window.peBarrier.list())).toEqual(['synced', 'typed-in-tab-b']);
  expect(await a.evaluate(() => window.peBarrier.marker())).toBeNull();

  // After a confirmed sync the logout completes.
  expect(await b.evaluate(() => window.peBarrier.sync())).toBe('ok');
  await a.evaluate(() => { window.peLogout = window.peBarrier.startLogout(); window.peBarrier.confirm(); });
  expect(await a.evaluate(() => window.peLogout)).toEqual({ status: 'logged-out' });
  expect(await a.evaluate(() => window.peBarrier.marker())).toContain('"phase":"cleared"');

  // Tab B (and B after a reload) can no longer write or sync into the wiped cache.
  expect(await b.evaluate(() => window.peBarrier.write('late'))).toBe('Error');
  await tab(b);
  expect(await b.evaluate(() => window.peBarrier.list())).toEqual([]);
  expect(await b.evaluate(() => window.peBarrier.write('after-reload'))).toBe('LogoutBarrierActiveError');
  expect(await b.evaluate(() => window.peBarrier.sync())).toBe('LogoutBarrierActiveError');
  await a.evaluate(() => window.peBarrier.reset());
});

test('een onderbroken wisactie wordt na herstart afgerond', async ({ context }) => {
  const a = await tab(await context.newPage());
  await a.evaluate(() => window.peBarrier.reset());
  expect(await a.evaluate(() => window.peBarrier.write('synced'))).toBe('ok');
  expect(await a.evaluate(() => window.peBarrier.sync())).toBe('ok');
  await a.evaluate(() => window.peBarrier.simulateCrashAfterFinalCheck());

  await tab(a); // restart
  expect(await a.evaluate(() => window.peBarrier.resume())).toBe('resumed');
  expect(await a.evaluate(() => window.peBarrier.marker())).toContain('"phase":"cleared"');
  expect(await a.evaluate(() => window.peBarrier.list())).toEqual([]);
  expect(await a.evaluate(() => window.peBarrier.resume())).toBe('awaiting-login');
  await a.evaluate(() => window.peBarrier.reset());
});
