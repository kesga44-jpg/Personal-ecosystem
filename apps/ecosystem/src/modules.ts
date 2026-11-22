import type { ModuleLink } from '@ecosystem/ui';

/** Modules van Personal Ecosystem op één origin (ADR 0020). */
export type ModuleId = 'dashboard' | 'groei' | 'kennis' | 'sport' | 'quest' | 'lichaam' | 'kracht' | 'duur' | 'voeding' | 'dagboek' | 'backup';

interface ModuleDefinition {
  id: ModuleId;
  path: string;
  label: string;
  icon: string;
}

export const modules: readonly ModuleDefinition[] = [
  { id: 'dashboard', path: '/', label: 'Dashboard', icon: '⌂' },
  { id: 'groei', path: '/groei', label: 'Groei', icon: '◎' },
  { id: 'kennis', path: '/kennis', label: 'Kennis', icon: '❒' },
  { id: 'sport', path: '/sport', label: 'Sport', icon: '↗' },
  { id: 'kracht', path: '/kracht', label: 'Kracht', icon: '▲' },
  { id: 'duur', path: '/duur', label: 'Duur', icon: '〰' },
  { id: 'quest', path: '/quest', label: 'SIDEQUEST', icon: '✦' },
  { id: 'lichaam', path: '/lichaam', label: 'Lichaam', icon: '♥' },
  { id: 'voeding', path: '/voeding', label: 'Voeding', icon: '◔' },
  { id: 'dagboek', path: '/dagboek', label: 'Dagboek', icon: '✎' },
  { id: 'backup', path: '/back-up', label: 'Back-up', icon: '⇩' }
];

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Bepaalt welke module bij een pad hoort. Alles wat niet bij een andere module hoort, is het dashboard. */
export function moduleForPath(pathname: string): ModuleId {
  for (const module of modules) {
    if (module.id !== 'dashboard' && isUnder(pathname, module.path)) return module.id;
  }
  return 'dashboard';
}

export function moduleLinksFor(active: ModuleId): ModuleLink[] {
  return modules.map((module) => ({
    href: module.path,
    label: module.label,
    icon: module.icon,
    active: module.id === active
  }));
}

export function moduleUrl(id: 'sport' | 'quest', origin: string): string {
  const module = modules.find((candidate) => candidate.id === id);
  return `${origin}${module?.path ?? '/'}`;
}
