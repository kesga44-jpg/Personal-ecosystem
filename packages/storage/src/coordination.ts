export const DATABASE_MUTATION_LOCK = 'personal-ecosystem:database-mutation';

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
  return withSharedLock(operation);
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
