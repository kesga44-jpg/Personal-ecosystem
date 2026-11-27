import type { ModuleId } from './modules';

/**
 * Personal Ecosystem als losse, installeerbare apps (optie A, besluit eigenaar 2026-11-26).
 *
 * Technisch blijft het één app op één origin (ADR 0020): dezelfde gegevens, dezelfde service worker
 * en straks hetzelfde account (ADR 0030). Elke app hieronder krijgt een eigen web-app-manifest met
 * een eigen `id`, naam, kleur en start-URL, zodat je hem los op je startscherm kunt zetten.
 * De scope is voor alle apps `/`: zo blijven links naar andere modules in hetzelfde venster.
 */
export type InstallableAppId = 'personal-ecosystem' | 'groei-kennis' | 'financien' | 'voeding' | 'sport' | 'sidequest' | 'lichaam-dagboek';

export interface InstallableApp {
  id: InstallableAppId;
  name: string;
  shortName: string;
  description: string;
  startPath: string;
  modules: readonly ModuleId[];
  color: string;
  /** Eén of twee tekens op het icoon. */
  glyph: string;
}

export const installableApps: readonly InstallableApp[] = [
  { id: 'personal-ecosystem', name: 'Personal Ecosystem', shortName: 'Ecosystem', description: 'Dashboard met de samenvatting van al je modules, herinneringen en back-up.', startPath: '/', modules: ['dashboard', 'backup'], color: '#397d71', glyph: 'PE' },
  { id: 'groei-kennis', name: 'Groei & Kennis', shortName: 'Groei', description: 'Doelen, gewoontes, acties, evaluaties, bronnen, inzichten en wat je leert.', startPath: '/groei', modules: ['groei', 'kennis'], color: '#5b5bd6', glyph: 'G' },
  { id: 'financien', name: 'Financiën', shortName: 'Financiën', description: 'Money Manual, budgetten, spaarpotten, rapportages en je beleggingsplan.', startPath: '/financien', modules: ['financien'], color: '#2f7d32', glyph: '€' },
  { id: 'voeding', name: 'Voeding', shortName: 'Voeding', description: 'Wat je eet, recepten en je persoonlijke maaltijdplanning.', startPath: '/voeding', modules: ['voeding'], color: '#c2571a', glyph: 'V' },
  { id: 'sport', name: 'Sport', shortName: 'Sport', description: 'Activiteiten, krachttraining en duurtrainingen.', startPath: '/sport', modules: ['sport', 'kracht', 'duur'], color: '#1d6fb8', glyph: 'S' },
  { id: 'sidequest', name: 'SIDEQUEST', shortName: 'SIDEQUEST', description: 'Quests en beloningen; doelen en gewoontes staan in Groei.', startPath: '/quest', modules: ['quest'], color: '#a3329b', glyph: '✦' },
  { id: 'lichaam-dagboek', name: 'Lichaam & Dagboek', shortName: 'Lichaam', description: 'Je lichaam, gezondheid, stemming en dagboek.', startPath: '/lichaam', modules: ['lichaam', 'dagboek'], color: '#b3364b', glyph: 'L' }
];

export function installableAppFor(module: ModuleId): InstallableApp {
  return installableApps.find((app) => app.modules.includes(module)) ?? installableApps[0]!;
}

export const manifestPath = (app: InstallableApp) => `/manifests/${app.id}.webmanifest`;
export const iconPath = (app: InstallableApp) => `/icons/${app.id}.svg`;

export function webManifest(app: InstallableApp): Record<string, unknown> {
  return {
    id: app.startPath === '/' ? '/' : `${app.startPath}/`,
    name: app.name,
    short_name: app.shortName,
    description: app.description,
    lang: 'nl',
    start_url: app.startPath,
    scope: '/',
    display: 'standalone',
    theme_color: app.color,
    background_color: '#f4f6f7',
    icons: [{ src: iconPath(app), sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
  };
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function appIconSvg(app: InstallableApp): string {
  const size = app.glyph.length > 1 ? 24 : 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${app.color}"/>` +
    `<text x="32" y="33" fill="#fff" font-family="system-ui, sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeXml(app.glyph)}</text></svg>\n`;
}
