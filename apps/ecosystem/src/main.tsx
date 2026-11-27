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

const active = moduleForPath(window.location.pathname);

// Optie A: elke groep modules is los te installeren. Het manifest volgt de module die je opent.
const app = installableAppFor(active);
document.querySelector('link[rel="manifest"]')?.setAttribute('href', manifestPath(app));
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', app.color);
const ActiveModule = lazy(loaders[active]);

/** Teller bij Dashboard in de modulebalk: aantal herinneringen (ADR 0022). Wordt pas na het laden van de module berekend. */
function Shell() {
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
  return <ActiveModule links={links} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<LoadingState />}>
      <Shell />
    </Suspense>
  </StrictMode>
);
