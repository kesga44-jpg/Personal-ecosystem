import { useEffect, useRef } from 'react';

/**
 * Openstaande invoer bij vergrendelen (ADR 0031 § 3). Een formulier met niet-opgeslagen invoer meldt
 * zich aan met `save` (versleuteld opslaan en teruglezen) en `discard`. Vergrendelen slaagt pas als
 * alle `save`-acties gelukt zijn; anders blijft de kluis open en kiest de gebruiker.
 */
export interface PendingInput {
  label: string;
  save(): Promise<void>;
  discard(): void;
}

const pending = new Set<PendingInput>();

export function registerPendingInput(input: PendingInput): () => void {
  pending.add(input);
  return () => { pending.delete(input); };
}

export class PendingInputError extends Error {
  constructor(readonly failures: { label: string; reason: string }[]) {
    super(`Niet alle openstaande invoer kon worden opgeslagen: ${failures.map((failure) => `${failure.label} (${failure.reason})`).join(', ')}.`);
    this.name = 'PendingInputError';
  }
}

/** Slaat alle openstaande invoer op; gooit `PendingInputError` als iets niet lukt. */
export async function savePendingInput(): Promise<void> {
  const failures: { label: string; reason: string }[] = [];
  for (const input of [...pending]) {
    try {
      await input.save();
      pending.delete(input);
    } catch (cause) {
      failures.push({ label: input.label, reason: cause instanceof Error ? cause.message : 'onbekende fout' });
    }
  }
  if (failures.length) throw new PendingInputError(failures);
}

/** Alleen na een bewuste keuze van de gebruiker. */
export function discardPendingInput(): void {
  for (const input of [...pending]) {
    input.discard();
    pending.delete(input);
  }
}

export function pendingInputCount(): number {
  return pending.size;
}

/** Meldt een formulier aan zolang het niet-opgeslagen invoer heeft. */
export function usePendingInput(label: string, dirty: boolean, save: () => Promise<void>, discard: () => void): void {
  const latest = useRef({ save, discard });
  latest.current = { save, discard };
  useEffect(() => {
    if (!dirty) return;
    return registerPendingInput({ label, save: () => latest.current.save(), discard: () => latest.current.discard() });
  }, [label, dirty]);
}
