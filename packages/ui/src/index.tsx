import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode, type PropsWithChildren } from 'react';
import { NavLink } from 'react-router-dom';

export interface NavigationItem {
  to: string;
  label: string;
  icon: string;
}

export function AppFrame({
  appName,
  appMark,
  navigation,
  children
}: PropsWithChildren<{
  appName: string;
  appMark: string;
  navigation: NavigationItem[];
}>) {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">{appMark}</span>
          <span>{appName}</span>
        </a>
        <nav className="side-nav" aria-label={`${appName} navigatie`}>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">Persoonlijk. Lokaal. Van jou.</div>
      </aside>
      <main className="main-content">
        <header className="mobile-header">
          <span className="brand-mark">{appMark}</span>
          <strong>{appName}</strong>
        </header>
        {children}
      </main>
      <nav className="mobile-nav" aria-label="Hoofdnavigatie">
        {navigation.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="mobile-nav-link">
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({
  variant = 'primary',
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button className={`button button-${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function Card({
  title,
  action,
  children,
  className = ''
}: PropsWithChildren<{ title?: string; action?: ReactNode; className?: string }>) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || action) && (
        <div className="card-heading">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">✦</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <strong>Er ging iets mis</strong>
      <span>{message}</span>
    </div>
  );
}

export function LoadingState({ label = 'Gegevens laden…' }: { label?: string }) {
  return <p className="loading-state" role="status">{label}</p>;
}

export function StatusPill({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'good' | 'warning' }>) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

export function Field({
  label,
  children,
  hint
}: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ConfirmAction({
  label,
  confirmMessage,
  onConfirm,
  children
}: {
  label: string;
  confirmMessage: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="text-button"
      type="button"
      aria-label={label}
      onClick={() => {
        if (window.confirm(confirmMessage)) onConfirm();
      }}
    >
      {children}
    </button>
  );
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredInstallPrompt: InstallPromptEvent | null = null;
const installPromptSubscribers = new Set<(event: InstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as InstallPromptEvent;
    for (const subscriber of installPromptSubscribers) subscriber(deferredInstallPrompt);
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    for (const subscriber of installPromptSubscribers) subscriber(null);
  });
}

export function PwaInstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(deferredInstallPrompt);
  const [message, setMessage] = useState('');

  useEffect(() => {
    installPromptSubscribers.add(setPrompt);
    return () => {
      installPromptSubscribers.delete(setPrompt);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setMessage('');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'dismissed') setMessage('Installatie niet gestart. Je kunt later opnieuw proberen via het browsermenu.');
    } catch (cause) {
      setMessage(cause instanceof Error ? `Installatie is niet gelukt: ${cause.message}` : 'Installatie is niet gelukt.');
    } finally {
      deferredInstallPrompt = null;
      setPrompt(null);
    }
  }

  return (
    <div className="pwa-install">
      {prompt ? (
        <Button variant="secondary" onClick={() => void install()}>Installeer deze app</Button>
      ) : (
        <p className="item-subtitle">Installeren kan via het browsermenu. iOS/iPadOS: Safari → Deel → Zet op beginscherm.</p>
      )}
      {message && <p className="item-subtitle" role="status">{message}</p>}
    </div>
  );
}
