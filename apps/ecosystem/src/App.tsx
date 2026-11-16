import { lazy, Suspense } from 'react';
import { LoadingState } from '@ecosystem/ui';

const DashboardModule = lazy(() => import('./modules/dashboard/App'));
const SportModule = lazy(() => import('./modules/sport/App'));
const QuestModule = lazy(() => import('./modules/quest/App'));

const primaryNavigation = [
  { to: '/', label: 'Dashboard', icon: '⌂' },
  { to: '/sport', label: 'Sport', icon: '↗' },
  { to: '/quest', label: 'SIDEQUEST', icon: '✦' },
  { to: '/instellingen', label: 'Instellingen', icon: '⚙' }
];

function moduleNavigation(pathname: string) {
  if (pathname.startsWith('/sport')) {
    return [
      ...primaryNavigation,
      { to: '/sport/activiteiten', label: 'Activiteiten', icon: '◷' },
      { to: '/sport/trainingen', label: 'Trainingen', icon: '◉' },
      { to: '/sport/instellingen', label: 'Sportinstellingen', icon: '⚙' }
    ];
  }
  if (pathname.startsWith('/quest')) {
    return [
      ...primaryNavigation,
      { to: '/quest/doelen', label: 'Doelen', icon: '◎' },
      { to: '/quest/gewoontes', label: 'Gewoontes', icon: '↻' },
      { to: '/quest/quests', label: 'Quests', icon: '✦' },
      { to: '/quest/instellingen', label: 'Questinstellingen', icon: '⚙' }
    ];
  }
  return [
    ...primaryNavigation,
    { to: '/activiteiten', label: 'Activiteiten', icon: '◷' }
  ];
}

function activeModule(pathname: string) {
  if (pathname.startsWith('/sport')) return SportModule;
  if (pathname.startsWith('/quest')) return QuestModule;
  return DashboardModule;
}

export default function App() {
  const pathname = window.location.pathname;
  const Module = activeModule(pathname);
  const navigation = moduleNavigation(pathname);

  return (
    <div className="app-frame ecosystem-shell" data-module={pathname.startsWith('/sport') ? 'sport' : pathname.startsWith('/quest') ? 'quest' : 'dashboard'}>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Personal Ecosystem</span>
        </a>
        <nav className="side-nav" aria-label="Personal Ecosystem navigatie">
          {navigation.map((item) => (
            <a
              key={item.to}
              href={item.to}
              className={`nav-link${pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`)) ? ' active' : ''}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">Persoonlijk. Lokaal. Van jou.</div>
      </aside>
      <main className="main-content">
        <header className="mobile-header">
          <span className="brand-mark">P</span>
          <strong>Personal Ecosystem</strong>
        </header>
        <Suspense fallback={<LoadingState />}>
          <Module />
        </Suspense>
      </main>
      <nav className="mobile-nav" aria-label="Hoofdnavigatie">
        {navigation.map((item) => (
          <a
            key={item.to}
            href={item.to}
            className={`mobile-nav-link${pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`)) ? ' active' : ''}`}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
