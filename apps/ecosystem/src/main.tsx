import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@ecosystem/ui/styles.css';
import '@ecosystem/hub/theme.css';
import { LoadingState, type ModuleLink } from '@ecosystem/ui';
import { moduleForPath, moduleLinksFor, type ModuleId } from './modules';

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
  sport: () => import('./modules/sport'),
  quest: () => import('./modules/quest'),
  lichaam: () => import('./modules/lichaam'),
  voeding: () => import('./modules/voeding'),
  dagboek: () => import('./modules/dagboek'),
  backup: () => import('./BackupApp')
};

const active = moduleForPath(window.location.pathname);
const ActiveModule = lazy(loaders[active]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<LoadingState />}>
      <ActiveModule links={moduleLinksFor(active)} />
    </Suspense>
  </StrictMode>
);
