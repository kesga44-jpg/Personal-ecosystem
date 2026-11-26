import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let origin: string;
let testPage: string;

test.beforeAll(async () => {
  server = await createServer({
    root: resolve('apps/ecosystem'),
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error'
  });
  await server.listen();
  origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
  testPage = await server.transformIndexHtml('/p6-lock-test', '<!doctype html><html><head></head><body></body></html>');
});

test.afterAll(async () => {
  await server.close();
});

test('cachewissing wacht op de echte mutatie-lock in een ander tabblad', async ({ context }) => {
  await context.route('**/p6-lock-test', (route) => route.fulfill({ contentType: 'text/html', body: testPage }));
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(`${origin}/p6-lock-test`);
  await second.goto(`${origin}/p6-lock-test`);

  await first.evaluate(async (moduleUrl) => {
    const storage = await import(/* @vite-ignore */ moduleUrl);
    await new Promise<void>((resolve, reject) => {
      void storage.withDatabaseMutationLock(async () => {
        await new Promise<void>((release) => {
          (window as Window & { releaseMutation: () => void }).releaseMutation = release;
          resolve();
        });
      }).catch(reject);
    });
  }, `/@fs/${resolve('packages/storage/src/index.ts')}`);

  await second.evaluate(async () => {
    localStorage.setItem('synthetic-p6-key', 'synthetic');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('synthetic-p6-db', 1);
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const moduleUrl = '/src/vault/localData.ts';
    const { deletePersonalEcosystemLocalData } = await import(/* @vite-ignore */ moduleUrl);
    const state = window as Window & { deletionResult?: string };
    void deletePersonalEcosystemLocalData({
      indexedDB,
      localStorage,
      databaseNames: ['synthetic-p6-db'],
      localStorageKeys: ['synthetic-p6-key']
    }).then(() => { state.deletionResult = 'success'; }, (error: Error) => { state.deletionResult = error.message; });
  });

  await expect.poll(async () => second.evaluate(async () => {
    const locks = await navigator.locks.query();
    return locks.pending?.some((lock) => lock.name === 'personal-ecosystem:database-mutation');
  })).toBe(true);
  expect(await second.evaluate(async () => ({
    databaseExists: (await indexedDB.databases()).some((database) => database.name === 'synthetic-p6-db'),
    value: localStorage.getItem('synthetic-p6-key')
  }))).toEqual({ databaseExists: true, value: 'synthetic' });

  await first.evaluate(() => (window as Window & { releaseMutation: () => void }).releaseMutation());
  await expect.poll(() => second.evaluate(() =>
    (window as Window & { deletionResult?: string }).deletionResult
  )).toBe('success');
  expect(await second.evaluate(async () => ({
    databaseExists: (await indexedDB.databases()).some((database) => database.name === 'synthetic-p6-db'),
    value: localStorage.getItem('synthetic-p6-key')
  }))).toEqual({ databaseExists: false, value: null });
});

test('zonder Web Locks begint de browser geen enkele cachewisactie', async ({ context }) => {
  await context.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }));
  await context.route('**/p6-lock-test', (route) => route.fulfill({ contentType: 'text/html', body: testPage }));
  const page = await context.newPage();
  await page.goto(`${origin}/p6-lock-test`);
  const result = await page.evaluate(async () => {
    const moduleUrl = '/src/vault/localData.ts';
    const { deletePersonalEcosystemLocalData } = await import(/* @vite-ignore */ moduleUrl);
    const calls: string[] = [];
    try {
      await deletePersonalEcosystemLocalData({
        indexedDB: { deleteDatabase: () => { calls.push('database'); } },
        localStorage: { removeItem: () => { calls.push('localStorage'); } },
        databaseNames: ['synthetic-p6-db'],
        localStorageKeys: ['synthetic-p6-key']
      });
      return { calls, error: 'geen fout' };
    } catch (error) {
      return { calls, error: error instanceof Error ? error.message : 'onbekend' };
    }
  });
  expect(result.calls).toEqual([]);
  expect(result.error).toContain('browservergrendeling tussen tabbladen');
});
