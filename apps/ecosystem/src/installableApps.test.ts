import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appIconSvg, installableAppFor, installableApps, manifestPath, webManifest } from './installableApps';
import { modules } from './modules';

describe('losse installeerbare apps (optie A)', () => {
  it('elke module hoort bij precies één app, met unieke id, manifest-id en startpad', () => {
    for (const module of modules) {
      expect(installableApps.filter((app) => app.modules.includes(module.id)), module.id).toHaveLength(1);
    }
    expect(new Set(installableApps.map((app) => app.id)).size).toBe(installableApps.length);
    expect(new Set(installableApps.map((app) => webManifest(app).id)).size).toBe(installableApps.length);
    for (const app of installableApps) {
      const start = modules.find((module) => module.path === app.startPath);
      expect(start && app.modules.includes(start.id), app.id).toBe(true);
    }
  });

  it('het dashboard houdt de manifest-id van de bestaande installatie', () => {
    expect(webManifest(installableAppFor('dashboard'))).toMatchObject({ id: '/', start_url: '/', scope: '/' });
    expect(installableAppFor('kracht').id).toBe('sport');
    expect(installableAppFor('kennis').id).toBe('groei-kennis');
    expect(installableAppFor('dagboek').id).toBe('lichaam-dagboek');
  });

  it('manifesten zijn installeerbaar: naam, start-URL binnen de scope, standalone en een icoon', () => {
    for (const app of installableApps) {
      const manifest = webManifest(app) as { name: string; short_name: string; start_url: string; scope: string; display: string; icons: { src: string }[] };
      expect(manifest.name).toBe(app.name);
      expect(manifest.short_name.length).toBeLessThanOrEqual(12);
      expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
      expect(manifest.display).toBe('standalone');
      expect(manifest.icons[0]!.src).toBe(`/icons/${app.id}.svg`);
      expect(appIconSvg(app)).toMatch(/^<svg [^>]*viewBox="0 0 64 64"/);
      expect(manifestPath(app)).toBe(`/manifests/${app.id}.webmanifest`);
    }
  });

  it('de publieke startpagina toont dezelfde apps met dezelfde paden', () => {
    const landing = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');
    const tiles = [...landing.matchAll(/data-app-id="([^"]+)" data-app-path="([^"]+)"/g)].map(([, id, path]) => ({ id, path }));
    expect(tiles).toEqual(installableApps.map((app) => ({ id: app.id, path: app.startPath })));
    for (const app of installableApps) expect(landing).toContain(`<h3>${app.name.replace('&', '&amp;')}</h3>`);
  });
});
