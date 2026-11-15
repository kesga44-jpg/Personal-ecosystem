export interface AppLaunch {
  id: string;
  appId: string;
  appName: string;
  openedAt: string;
}

export interface Shortcut {
  id: string;
  title: string;
  url: string;
  createdAt: string;
}

export function validateHubBackup(input: unknown): void {
  if (!input || typeof input !== 'object' || !('stores' in input) || !input.stores || typeof input.stores !== 'object') {
    throw new Error('Hub-back-up heeft geen geldige gegevenssectie.');
  }
  const stores = input.stores as Record<string, unknown>;
  const launches = stores.launches;
  const shortcuts = stores.shortcuts;
  if (!Array.isArray(launches) || !Array.isArray(shortcuts)) {
    throw new Error('Hub-back-up mist appopeningen of snelkoppelingen.');
  }

  for (const value of launches) {
    if (!value || typeof value !== 'object') throw new Error('Hub-back-up bevat een ongeldige appopening.');
    const launch = value as Partial<AppLaunch>;
    if (
      !['sportapp', 'sidequest'].includes(launch.appId ?? '') ||
      typeof launch.appName !== 'string' ||
      !Number.isFinite(Date.parse(launch.openedAt ?? ''))
    ) {
      throw new Error('Hub-back-up bevat ongeldige appopeningsgegevens.');
    }
  }

  for (const value of shortcuts) {
    if (!value || typeof value !== 'object') throw new Error('Hub-back-up bevat een ongeldige snelkoppeling.');
    const shortcut = value as Partial<Shortcut>;
    if (
      typeof shortcut.title !== 'string' ||
      !shortcut.title.trim() ||
      shortcut.title.length > 60 ||
      typeof shortcut.url !== 'string' ||
      !isSafeUrl(shortcut.url) ||
      !Number.isFinite(Date.parse(shortcut.createdAt ?? ''))
    ) {
      throw new Error('Hub-back-up bevat ongeldige snelkoppelingsgegevens.');
    }
  }
}

export function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) &&
      !url.username &&
      !url.password;
  } catch {
    return false;
  }
}
