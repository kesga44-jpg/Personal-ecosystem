import { StrictMode, Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@ecosystem/ui/styles.css';
import '@ecosystem/hub/theme.css';
import { LoadingState, type ModuleLink } from '@ecosystem/ui';
import { moduleForPath, moduleLinksFor, type ModuleId } from './modules';
import { installableAppFor, iconPath, manifestPath } from './installableApps';
import { REMINDERS_CHANGED } from './reminders/events';

let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {};
updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.confirm('Er is een bijgewerkte versie van Personal Ecosystem beschikbaar. Nu vernieuwen?')) void updateSW(true);
  }
});

// Elke module wordt pas geladen als je hem opent (ADR 0020, G-4).
const loaders: Record<ModuleId, () => Promise<{ default: ComponentType<{ links: ModuleLink[] }> }>> = {
  dashboard: () => import('./modules/dashboard'),
  groei: () => import('./modules/groei'),
  kennis: () => import('./modules/kennis'),
  financien: () => import('./modules/financien'),
  sport: () => import('./modules/sport'),
  kracht: () => import('./modules/kracht'),
  duur: () => import('./modules/duur'),
  quest: () => import('./modules/quest'),
  lichaam: () => import('./modules/lichaam'),
  voeding: () => import('./modules/voeding'),
  dagboek: () => import('./modules/dagboek'),
  backup: () => import('./BackupApp')
};

// Optie A: elke groep modules is los te installeren. Het manifest volgt de module die je opent.
function applyInstallableApp(module: ModuleId): void {
  const app = installableAppFor(module);
  document.querySelector('link[rel="manifest"]')?.setAttribute('href', manifestPath(app));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', app.color);
}

applyInstallableApp(moduleForPath(window.location.pathname));

const VAULT_MODE = import.meta.env.VITE_PE_VAULT === '1';
const lazyModules = Object.fromEntries(
  (Object.keys(loaders) as ModuleId[]).map((id) => [id, lazy(loaders[id])])
) as unknown as Record<ModuleId, ComponentType<{ links: ModuleLink[] }>>;

/**
 * P-6: de gegevenssleutel staat alleen in het geheugen (ADR 0031 § 2). In de kluisbuild wisselt een link
 * naar een andere module daarom binnen de pagina in plaats van met een herlaad; anders zou elke
 * modulewissel de kluis sluiten. De gewone build blijft volledige paginanavigatie gebruiken.
 */
function useActiveModule(): ModuleId {
  const [active, setActive] = useState<ModuleId>(() => moduleForPath(window.location.pathname));
  useEffect(() => applyInstallableApp(active), [active]);
  useEffect(() => {
    if (!VAULT_MODE) return;
    const onPopState = () => setActive(moduleForPath(window.location.pathname));
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || /^\/(manifests|icons|assets)\//.test(url.pathname)) return;
      event.preventDefault();
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
      // De router van de module luistert naar popstate; zo volgt hij ook een link binnen dezelfde module.
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick);
    };
  }, []);
  return active;
}

/** Teller bij Dashboard in de modulebalk: aantal herinneringen (ADR 0022). Wordt pas na het laden van de module berekend. */
function Shell() {
  const active = useActiveModule();
  const ActiveModule = lazyModules[active];
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = () => {
      void import('./reminders/input')
        .then((module) => module.countVisibleReminders())
        .then((next) => alive && setCount(next));
    };
    const first = window.setTimeout(run, 800);
    const interval = window.setInterval(() => document.visibilityState === 'visible' && run(), 5 * 60_000);
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(REMINDERS_CHANGED, run);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(REMINDERS_CHANGED, run);
    };
  }, []);
  const links = moduleLinksFor(active).map((link) =>
    link.href === '/' && count > 0 ? { ...link, badge: count, badgeLabel: `${count} ${count === 1 ? 'herinnering' : 'herinneringen'}` } : link
  );
  return <ActiveModule key={active} links={links} />;
}

// P-6: de kluis staat alleen in builds met VITE_PE_VAULT=1 aan; productie verandert pas na vrijgave van P-6.
const VaultGate = import.meta.env.VITE_PE_VAULT === '1'
  ? lazy(() => import('./vault/VaultGate').then((module) => ({ default: module.VaultGate })))
  : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<LoadingState />}>
      {VaultGate ? <VaultGate><Shell /></VaultGate> : <Shell />}
    </Suspense>
  </StrictMode>
);
