export const DATABASE_MUTATION_LOCK = 'personal-ecosystem:database-mutation';
/** Cross-tab lock that every sync round holds; logout takes it to wait for and exclude sync. */
export const SYNC_LOCK = 'personal-ecosystem:sync';
/**
 * Durable, origin-wide marker set by the logout barrier just before the local PE cache is wiped.
 * While it exists, cooperating writes and sync rounds are refused in every tab, also after a restart.
 */
export const LOGOUT_BARRIER_STORAGE_KEY = 'personal-ecosystem.logout.barrier';

export class LogoutBarrierActiveError extends Error {
  constructor() {
    super('Personal Ecosystem wordt afgemeld; nieuwe wijzigingen en synchronisatie zijn geblokkeerd.');
    this.name = 'LogoutBarrierActiveError';
  }
}

/** True when a logout barrier marker exists. Unreadable storage counts as no marker: setting one would have failed too. */
export function logoutBarrierActive(): boolean {
  try {
    return globalThis.localStorage?.getItem(LOGOUT_BARRIER_STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

function refuseDuringLogout<T>(operation: () => Promise<T>): () => Promise<T> {
  return async () => {
    if (logoutBarrierActive()) throw new LogoutBarrierActiveError();
    return operation();
  };
}

type LockOperation = <T>(name: string, operation: () => Promise<T>) => Promise<T>;

function inProcessLock(): LockOperation {
  const queues = new Map<string, Promise<void>>();
  return async <T>(name: string, operation: () => Promise<T>): Promise<T> => {
    const previous = queues.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    queues.set(name, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (queues.get(name) === current) queues.delete(name);
    }
  };
}

const processLock = inProcessLock();

async function withSharedLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (locks) return locks.request(DATABASE_MUTATION_LOCK, { mode: 'exclusive' }, operation);
  return processLock(DATABASE_MUTATION_LOCK, operation);
}

/** Serialize IndexedDB writes across modules and tabs when Web Locks are available. */
export function withDatabaseMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  return withSharedLock(refuseDuringLogout(operation));
}

/**
 * Run one sync round exclusively across tabs. Refused while a logout barrier is active,
 * so a sync that queued behind a logout cannot write into a wiped cache.
 */
export async function withSyncLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) throw new Error('Synchroniseren vereist browservergrendeling tussen tabbladen.');
  return locks.request(SYNC_LOCK, { mode: 'exclusive' }, refuseDuringLogout(operation));
}

/** Logout only: take the sync lock without the barrier check (an interrupted logout may be resumed). */
export async function withSyncExcludedForLogout<T>(operation: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) throw new Error('Afmelden vereist browservergrendeling tussen tabbladen.');
  return locks.request(SYNC_LOCK, { mode: 'exclusive' }, operation);
}

/** Destructive operations require the same origin-wide lock used by database writes. */
export async function withCrossTabDatabaseLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) {
    throw new Error('Lokale PE-gegevens wissen vereist browservergrendeling tussen tabbladen.');
  }
  return locks.request(DATABASE_MUTATION_LOCK, { mode: 'exclusive' }, operation);
}

/**
 * Take a consistent cross-module snapshot. Browsers without Web Locks cannot guarantee
 * that writes in another tab stay out of the snapshot, so fail rather than claim consistency.
 */
export function withConsistentDatabaseSnapshot<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof window !== 'undefined' && !globalThis.navigator?.locks) {
    throw new Error('Een consistente export vereist browservergrendeling tussen tabbladen.');
  }
  return withSharedLock(operation);
}
