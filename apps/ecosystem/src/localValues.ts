/**
 * Kleine PE-waarden op dit apparaat (concepttraining, weerlocatie, dashboardindeling, herinneringen, ...).
 *
 * Gewone build: rechtstreeks `localStorage`, zoals altijd. Kluisbuild (P-6, ADR 0031): de geopende kluis
 * installeert een backend die de waarden ontsleuteld in het geheugen houdt en versleuteld bewaart; zonder
 * geopende kluis is er niets te lezen. De API blijft synchroon, zodat modules niet veranderen.
 */
export interface LocalValueBackend {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

const plainBackend: LocalValueBackend = {
  get: (key) => globalThis.localStorage?.getItem(key) ?? null,
  set: (key, value) => {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  }
};

let backend: LocalValueBackend = plainBackend;

export function installLocalValueBackend(next: LocalValueBackend | null): void {
  backend = next ?? plainBackend;
}

export function readLocalValue(key: string): string | null {
  return backend.get(key);
}

export function writeLocalValue(key: string, value: string | null): void {
  backend.set(key, value);
}
