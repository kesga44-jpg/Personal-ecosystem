import { useEffect, useRef, useState } from 'react';
import { Button } from '@ecosystem/ui';
import { formConceptKey, type FormConceptId } from './formConceptKeys';
import { readLocalValue, writeLocalValue } from './localValues';
import { usePendingInput } from './pendingInput';

/**
 * Niet-opgeslagen formulierinvoer bij vergrendelen (ADR 0031 § 3). Zolang het formulier afwijkt van
 * `baseline`, meldt het zich aan als openstaande invoer. Bij vergrendelen wordt de invoer als concept
 * bewaard (in de kluisbuild versleuteld) en na ontgrendelen in hetzelfde formulier teruggezet.
 *
 * `scope` onderscheidt bijvoorbeeld een nieuw record van het bewerken van een bestaand record: een
 * concept wordt alleen teruggezet in een formulier met dezelfde scope.
 */
interface StoredConcept { scope: string; value: unknown }

export interface FormConcept {
  /** True als bij openen een concept is teruggezet. */
  restored: boolean;
  /** Na geslaagd opslaan: verwijdert het concept van dit formulier. */
  clear(): void;
  /** Zet het formulier terug op `baseline` en verwijdert het concept. */
  discard(): void;
}

/** Een concept past alleen als het dezelfde vorm heeft als de lege of bestaande invoer. */
export function sameShape(template: unknown, value: unknown): boolean {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return false;
    return value.every((item) => (template.length ? sameShape(template[0], item) : typeof item === 'string'));
  }
  if (template !== null && typeof template === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const expected = Object.keys(template).sort();
    const actual = Object.keys(value).sort();
    return expected.length === actual.length && expected.every((key, index) => key === actual[index] && sameShape((template as Record<string, unknown>)[key], (value as Record<string, unknown>)[key]));
  }
  return typeof template === typeof value;
}

function readConcept<T>(id: FormConceptId, scope: string, template: T): T | null {
  try {
    const stored = JSON.parse(readLocalValue(formConceptKey(id)) ?? 'null') as StoredConcept | null;
    if (!stored || stored.scope !== scope || !sameShape(template, stored.value)) return null;
    return stored.value as T;
  } catch {
    return null;
  }
}

function clearConcept(id: FormConceptId, scope: string): void {
  try {
    const stored = JSON.parse(readLocalValue(formConceptKey(id)) ?? 'null') as StoredConcept | null;
    if (stored && stored.scope !== scope) return; // concept van een ander record blijft staan
  } catch {
    // onleesbaar concept: weg ermee
  }
  writeLocalValue(formConceptKey(id), null);
}

export function useFormConcept<T>(id: FormConceptId, scope: string, label: string, value: T, baseline: T, restore: (value: T) => void): FormConcept {
  const [restored, setRestored] = useState(false);
  const latest = useRef({ value, baseline, restore });
  latest.current = { value, baseline, restore };

  useEffect(() => {
    const concept = readConcept(id, scope, latest.current.baseline);
    if (concept === null) return;
    latest.current.restore(concept);
    setRestored(true);
  }, [id, scope]);

  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  usePendingInput(
    label,
    dirty,
    async () => writeLocalValue(formConceptKey(id), JSON.stringify({ scope, value: latest.current.value } satisfies StoredConcept)),
    () => clearConcept(id, scope)
  );

  return {
    restored,
    clear() {
      clearConcept(id, scope);
      setRestored(false);
    },
    discard() {
      latest.current.restore(latest.current.baseline);
      clearConcept(id, scope);
      setRestored(false);
    }
  };
}

export function ConceptNotice({ concept }: { concept: FormConcept }) {
  if (!concept.restored) return null;
  return (
    <div className="concept-notice" role="status">
      <p>Niet-opgeslagen invoer van de vorige keer is teruggezet. Sla op om hem te bewaren.</p>
      <Button type="button" variant="secondary" onClick={concept.discard}>Invoer weggooien</Button>
    </div>
  );
}
